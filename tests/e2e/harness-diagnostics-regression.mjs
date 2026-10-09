#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  HARNESS_FAILURE_KINDS,
  DEVTOOLS_RETRY_POLICY,
  HarnessFailure,
  classifyInjectedFailure,
  cleanupHarnessResources,
  enableCdpDomainsWithDiagnostics,
  formatHarnessFailure,
  waitForDevToolsPort
} from './harness-diagnostics.mjs';

function check(condition, message) {
  assert.ok(condition, message);
  console.log('PASS  ' + message);
}

check(DEVTOOLS_RETRY_POLICY.maxAttempts === 300, 'DevTools startup polling supports a bounded 30-second window');
check(DEVTOOLS_RETRY_POLICY.startupTimeoutMs === 30000, 'DevTools startup deadline exceeds transient CI startup delays');
check(DEVTOOLS_RETRY_POLICY.startupTimeoutMs > 6000, 'DevTools startup deadline exceeds the previous six-second failure window');
check(DEVTOOLS_RETRY_POLICY.backoffMs === 100, 'bounded DevTools retry backoff is explicit');
check(DEVTOOLS_RETRY_POLICY.requestTimeoutMs === 1000, 'DevTools request timeout is explicit');

for (const kind of Object.values(HARNESS_FAILURE_KINDS)) {
  const failure = classifyInjectedFailure(kind);
  check(failure instanceof HarnessFailure, kind + ' injection creates a typed harness failure');
  check(formatHarnessFailure(failure).startsWith(kind + ' phase='), kind + ' error has an explicit category prefix');
}

const browserFailure = classifyInjectedFailure(HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE);
check(browserFailure.phase === 'devtools_endpoint', 'browser startup injection identifies the DevTools phase');
const applicationFailure = classifyInjectedFailure(HARNESS_FAILURE_KINDS.APPLICATION_FAILURE);
check(applicationFailure.phase === 'page_load', 'application injection identifies the page-load phase');
const environmentFailure = classifyInjectedFailure(HARNESS_FAILURE_KINDS.ENVIRONMENT_FAILURE);
check(environmentFailure.phase === 'environment', 'environment injection identifies the environment phase');

const sentMethods = [];
await enableCdpDomainsWithDiagnostics({ send: async method => sentMethods.push(method) }, ['Page.enable', 'Runtime.enable']);
check(sentMethods.join(',') === 'Page.enable,Runtime.enable', 'CDP domain bootstrap sends every requested domain');

await assert.rejects(
  () => enableCdpDomainsWithDiagnostics({ send: async () => { throw new Error('injected CDP domain failure'); } }, ['Runtime.enable'], { port: 9222 }),
  error => error instanceof HarnessFailure &&
    error.kind === HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE &&
    error.phase === 'devtools_handshake',
  'CDP domain bootstrap failures retain the browser-startup category'
);

const cleanupProfile = await mkdtemp(path.join(tmpdir(), 'harness-diagnostics-regression-'));
const portProfile = await mkdtemp(path.join(tmpdir(), 'harness-devtools-port-regression-'));
const fakeBrowserProcess = { exitCode: null, signalCode: null };
const delayedPortWrite = new Promise((resolve, reject) => {
  setTimeout(() => {
    writeFile(path.join(portProfile, 'DevToolsActivePort'), '43210\n/devtools/browser/regression-test\n')
      .then(resolve, reject);
  }, 6_250);
});
const detectedPort = await waitForDevToolsPort({
  profileDir: portProfile,
  browserProcess: fakeBrowserProcess,
  timeoutMs: 8_000
});
await delayedPortWrite;
check(detectedPort === 43210, 'DevToolsActivePort polling survives CI startup delays beyond the old six-second cutoff');

await writeFile(path.join(portProfile, 'DevToolsActivePort'), '0\n/not-a-browser-websocket\n');
await assert.rejects(
  () => waitForDevToolsPort({ profileDir: portProfile, browserProcess: fakeBrowserProcess, timeoutMs: 250 }),
  error => error instanceof HarnessFailure &&
    error.kind === HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE &&
    error.phase === 'devtools_port_file',
  'invalid DevToolsActivePort content fails with typed startup diagnostics'
);
check(true, 'invalid DevToolsActivePort content is rejected instead of accepting a bad port');

await assert.rejects(
  () => waitForDevToolsPort({ profileDir: portProfile, browserProcess: { exitCode: 1, signalCode: null } }),
  error => error instanceof HarnessFailure && error.phase === 'devtools_port_file',
  'Chrome process exit fails fast before waiting for DevToolsActivePort'
);
check(true, 'Chrome process exit is reported before port-file timeout');

const cleanupServer = await new Promise(resolve => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => resolve(server));
});
await cleanupHarnessResources({ browserExit: Promise.resolve(), servers: [cleanupServer], profileDirs: [cleanupProfile, portProfile] });
check(!cleanupServer.listening, 'setup cleanup closes a partially initialized static server');
check(!(await stat(cleanupProfile).catch(() => null)), 'setup cleanup removes a partially initialized browser profile');
check(!(await stat(portProfile).catch(() => null)), 'setup cleanup removes the DevToolsActivePort regression profile');

console.log('Harness Diagnostics Regression: PASS');
