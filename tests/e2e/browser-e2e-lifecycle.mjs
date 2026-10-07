#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const RUNNER = path.join(ROOT, 'tests', 'e2e', 'browser-real-user-scenario.mjs');
const CASE_TIMEOUT = 15_000;
const CHILD_EXIT_TIMEOUT = 8_000;
const PROFILE_PREFIX = 'prung-aksorn-e2e-';

function log(message) { console.log('[E2E-LIFECYCLE] ' + message); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    sleep(timeoutMs).then(() => { throw new Error('Lifecycle child did not exit within ' + timeoutMs + 'ms.'); })
  ]);
}

async function waitForMarker(output, marker, child, timeoutMs = CASE_TIMEOUT) {
  const start = Date.now();
  while (!output.value.includes(marker)) {
    if (child.exitCode !== null || child.signalCode !== null) break;
    if (Date.now() - start >= timeoutMs) {
      throw new Error('Timed out waiting for lifecycle marker: ' + marker + '\nOutput:\n' + output.value);
    }
    await sleep(100);
  }
}

function profileDirs() {
  try {
    return new Set(
      fs.readdirSync(os.tmpdir())
        .filter(name => name.startsWith(PROFILE_PREFIX))
    );
  } catch {
    return new Set();
  }
}

async function assertNoE2EProcesses(baselineProfiles) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < 5_000) {
    const result = await new Promise(resolve => {
      const child = spawn('bash', ['-lc', "pgrep -af -- '(^|/)(google-chrome|chromium|chromium-browser|chrome|msedge)( |$).*--user-data-dir=[^ ]*prung-aksorn-e2e-' || true"], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      child.stdout.on('data', chunk => { stdout += String(chunk); });
      child.once('exit', () => resolve(stdout.trim()));
      child.once('error', () => resolve(''));
    });
    last = result;
    const currentProfiles = profileDirs();
    const unexpectedProfiles = [...currentProfiles].filter(name => !baselineProfiles.has(name));
    if (!result && unexpectedProfiles.length === 0) return;
    await sleep(250);
  }
  throw new Error('E2E resources remain after teardown. processes=' + JSON.stringify(last) + ' profiles=' + JSON.stringify([...profileDirs()]));
}

async function runCase(name, env, expectedCode, expectedText) {
  log('START ' + name);
  const baselineProfiles = profileDirs();
  const child = spawn(process.execPath, [RUNNER], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const output = { value: '' };
  let stderr = '';
  child.stdout.on('data', chunk => { output.value += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });

  try {
    await waitForMarker(output, env.E2E_LIFECYCLE_TEST === 'signal'
      ? 'Lifecycle test hook armed: signal'
      : 'Lifecycle test hook armed: ' + env.E2E_LIFECYCLE_TEST, child);

    if (env.E2E_LIFECYCLE_TEST === 'signal') {
      child.kill(env.E2E_LIFECYCLE_SIGNAL);
    }

    await waitForExit(child, CHILD_EXIT_TIMEOUT);
    assert.equal(child.exitCode, expectedCode, name + ' exit code');
    const combinedOutput = output.value + '\\n' + stderr;
    assert.match(combinedOutput, expectedText, name + ' output contains the expected failure reason');
    await assertNoE2EProcesses(baselineProfiles);
    log('PASS ' + name);
  } catch (error) {
    try { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); } catch {}
    await sleep(250);
    throw new Error(name + ' failed: ' + (error.stack || error.message || error) + '\nSTDOUT:\n' + output.value + '\nSTDERR:\n' + stderr);
  }
}

await runCase(
  'setup exception cleanup',
  { E2E_LIFECYCLE_TEST: 'setup-exception' },
  1,
  /Injected setup exception/
);

await runCase(
  'global timeout cleanup',
  { E2E_LIFECYCLE_TEST: 'global-timeout', E2E_TEST_TIMEOUT_MS: '5000' },
  1,
  /Browser E2E global timeout after 5000ms/
);

await runCase(
  'SIGINT cleanup',
  { E2E_LIFECYCLE_TEST: 'signal', E2E_LIFECYCLE_SIGNAL: 'SIGINT' },
  130,
  /Browser E2E interrupted by SIGINT/
);

await runCase(
  'SIGTERM cleanup',
  { E2E_LIFECYCLE_TEST: 'signal', E2E_LIFECYCLE_SIGNAL: 'SIGTERM' },
  143,
  /Browser E2E interrupted by SIGTERM/
);

console.log('');
console.log('Browser E2E Lifecycle Adversarial Gate: PASS');
