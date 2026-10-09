#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const RUNNER = path.join(ROOT, 'tests', 'e2e', 'browser-real-user-scenario.mjs');
const CASE_TIMEOUT = 15_000;
const CHILD_EXIT_TIMEOUT = 20_000;
const PROFILE_PREFIX = 'prung-aksorn-e2e-';

function log(message) { console.log('[E2E-LIFECYCLE] ' + message); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForExit(childCompletion, timeoutMs) {
  let timer;
  try {
    const result = await Promise.race([
      childCompletion,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Lifecycle child did not close within ' + timeoutMs + 'ms.')), timeoutMs);
      })
    ]);
    if (result.error) throw new Error('Lifecycle child process error: ' + result.error.message);
    return result;
  } finally {
    clearTimeout(timer);
  }
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
  return new Set(
    fs.readdirSync(os.tmpdir())
      .filter(name => name.startsWith(PROFILE_PREFIX))
  );
}

function processScanCommand(platform = process.platform) {
  if (platform === 'win32') {
    const powershell = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe';
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$profileToken = 'prung-aksorn-e2e-'",
      "Get-CimInstance -ClassName Win32_Process | Where-Object { $_.Name -match '^(chrome|msedge|chromium)(\\.exe)?$' -and $_.CommandLine -and $_.CommandLine.IndexOf($profileToken, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object { [Console]::Out.WriteLine(('{0} {1} {2}' -f $_.ProcessId, $_.Name, $_.CommandLine)) }"
    ].join('; ');
    return { command: powershell, args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script] };
  }
  return platform === 'darwin'
    ? { command: 'ps', args: ['-ax', '-o', 'pid=,command='] }
    : { command: 'ps', args: ['-eo', 'pid=,args='] };
}

function matchingE2EBrowserProcesses(snapshot) {
  return snapshot.split(/\r?\n/).map(line => line.trim()).filter(Boolean).filter(line => {
    const browserName = /(?:^|[\/\\\s])(?:google-chrome|chromium|chromium-browser|chrome|msedge)(?:\.exe)?(?:\s|$)/i.test(line);
    const profileFlag = /--user-data-dir(?:=|\s+)(?:"[^"]*prung-aksorn-e2e-[^"]*"|[^\s"]*prung-aksorn-e2e-[^\s"]*)/i.test(line);
    return browserName && profileFlag;
  });
}

function assertProcessScannerContracts() {
  const windowsScan = processScanCommand('win32');
  assert.match(windowsScan.command, /powershell/i, 'Windows process checks use PowerShell');
  assert.ok(windowsScan.args.join(' ').includes('Win32_Process'), 'Windows process checks inspect Win32 process command lines');
  const linuxScan = processScanCommand('linux');
  assert.equal(linuxScan.command, 'ps', 'Linux process checks use ps without requiring bash/pgrep');
  const macScan = processScanCommand('darwin');
  assert.ok(macScan.args.includes('-ax') && macScan.args.includes('pid=,command='), 'macOS process checks use BSD-compatible ps arguments');

  const windowsChrome = String.raw`123 chrome.exe "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\Users\runner user\AppData\Local\Temp\prung-aksorn-e2e-win-fixture"`;
  const posixChrome = String.raw`124 /usr/bin/chromium --user-data-dir=/tmp/prung-aksorn-e2e-posix-fixture --headless`;
  const unrelatedBrowser = String.raw`125 /usr/bin/chromium --user-data-dir=/tmp/other-browser-profile --headless`;
  assert.equal(matchingE2EBrowserProcesses([windowsChrome, posixChrome].join('\n')).length, 2, 'quoted Windows and POSIX Chrome command lines are recognized');
  assert.equal(matchingE2EBrowserProcesses(unrelatedBrowser).length, 0, 'unrelated browser profiles are not treated as leaked E2E processes');
  log('PASS cross-platform process scanner contract fixtures');
}

assertProcessScannerContracts();

async function listE2EBrowserProcesses() {
  const { command, args } = processScanCommand();
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        try { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); } catch {}
        reject(error);
      } else {
        resolve(value);
      }
    };
    const timer = setTimeout(() => finish(new Error('Browser process scan timed out: ' + command)), 5_000);
    child.stdout?.on('data', chunk => { stdout += String(chunk); });
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    child.once('error', error => finish(new Error('Unable to inspect browser processes using ' + command + ': ' + error.message)));
    child.once('close', (code, signal) => {
      if (code !== 0) {
        finish(new Error('Browser process scan failed using ' + command + ' exit=' + code + ' signal=' + signal + (stderr.trim() ? ' stderr=' + stderr.trim() : '')));
        return;
      }
      const snapshot = process.platform === 'win32'
        ? stdout
        : matchingE2EBrowserProcesses(stdout).join('\n');
      finish(null, snapshot.trim());
    });
  });
}

async function assertNoE2EProcesses(baselineProfiles) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < 5_000) {
    last = await listE2EBrowserProcesses();
    const currentProfiles = profileDirs();
    const unexpectedProfiles = [...currentProfiles].filter(name => !baselineProfiles.has(name));
    const lingeringProcesses = process.platform === 'win32'
      ? matchingE2EBrowserProcesses(last).join('\n')
      : last;
    if (!lingeringProcesses && unexpectedProfiles.length === 0) return;
    await sleep(250);
  }
  throw new Error('E2E resources remain after teardown. processes=' + JSON.stringify(last) + ' profiles=' + JSON.stringify([...profileDirs()]));
}

async function runCase(name, env, expectedCode, expectedText) {
  log('START ' + name);
  const baselineProfiles = profileDirs();
  const childEnv = { ...process.env, ...env };
  const usesHandlerDelivery = process.platform === 'win32' && env.E2E_LIFECYCLE_TEST === 'signal';
  if (env.E2E_LIFECYCLE_TEST === 'signal') {
    childEnv.E2E_LIFECYCLE_SIGNAL_DELIVERY = usesHandlerDelivery ? 'handler' : 'process';
  }
  const child = spawn(process.execPath, [RUNNER], {
    cwd: ROOT,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const childCompletion = new Promise(resolve => {
    child.once('error', error => resolve({ error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const output = { value: '' };
  let stderr = '';
  child.stdout.on('data', chunk => { output.value += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });

  try {
    await waitForMarker(output, env.E2E_LIFECYCLE_TEST === 'signal'
      ? 'Lifecycle test hook armed: signal'
      : 'Lifecycle test hook armed: ' + env.E2E_LIFECYCLE_TEST, child);

    if (env.E2E_LIFECYCLE_TEST === 'signal' && !usesHandlerDelivery) {
      const delivered = child.kill(env.E2E_LIFECYCLE_SIGNAL);
      assert.equal(delivered, true, name + ' signal delivery was accepted');
    } else if (usesHandlerDelivery) {
      log(name + ' uses in-process handler delivery on Windows; child_process.kill(SIGINT/SIGTERM) force-terminates instead of invoking Node signal listeners.');
    }

    const completion = await waitForExit(childCompletion, CHILD_EXIT_TIMEOUT);
    assert.equal(completion.code, expectedCode, name + ' closed with the expected exit code');
    assert.equal(completion.signal, null, name + ' completed through its cleanup handler rather than abrupt signal termination');
    const combinedOutput = output.value + '\n' + stderr;
    assert.match(combinedOutput, expectedText, name + ' output contains the expected failure reason');
    if (usesHandlerDelivery) {
      assert.match(combinedOutput, /Lifecycle test signal handler simulation:/, name + ' confirms the Windows signal-handler test path');
    }
    await assertNoE2EProcesses(baselineProfiles);
    log('PASS ' + name);
  } catch (error) {
    try { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); } catch {}
    try { await waitForExit(childCompletion, 5_000); } catch {}
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
