import net from 'node:net';
import { rm } from 'node:fs/promises';

export const HARNESS_FAILURE_KINDS = Object.freeze({
  APPLICATION_FAILURE: 'APPLICATION_FAILURE',
  BROWSER_STARTUP_FAILURE: 'BROWSER_STARTUP_FAILURE',
  ENVIRONMENT_FAILURE: 'ENVIRONMENT_FAILURE'
});

export const DEVTOOLS_RETRY_POLICY = Object.freeze({
  maxAttempts: 20,
  backoffMs: 100,
  requestTimeoutMs: 1_000,
  portProbeTimeoutMs: 250
});

export class HarnessFailure extends Error {
  constructor(kind, phase, message, details = {}) {
    super(`${kind} phase=${phase}: ${message}`);
    this.name = 'HarnessFailure';
    this.kind = kind;
    this.phase = phase;
    this.details = details;
  }
}

export function asApplicationFailure(error, phase = 'page_load') {
  if (error instanceof HarnessFailure) return error;
  return new HarnessFailure(
    HARNESS_FAILURE_KINDS.APPLICATION_FAILURE,
    phase,
    error?.message || String(error),
    { originalName: error?.name || 'Error' }
  );
}

export function asEnvironmentFailure(error, phase = 'environment') {
  if (error instanceof HarnessFailure) return error;
  return new HarnessFailure(
    HARNESS_FAILURE_KINDS.ENVIRONMENT_FAILURE,
    phase,
    error?.message || String(error),
    { originalName: error?.name || 'Error' }
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function probePort(host, port, timeoutMs) {
  return await new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => finish({ open: false, reason: 'timeout' }));
    socket.once('connect', () => finish({ open: true }));
    socket.once('error', error => finish({ open: false, reason: error.message }));
  });
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function processState(browserProcess) {
  if (!browserProcess) return { exitCode: null, signal: null, running: false };
  return {
    exitCode: browserProcess.exitCode,
    signal: browserProcess.signalCode,
    running: browserProcess.exitCode === null && browserProcess.signalCode === null
  };
}

function stderrTail(getStderr) {
  const value = typeof getStderr === 'function' ? getStderr() : '';
  return String(value || '').trim().slice(-4_000);
}

async function waitForEndpoint({ host, port, path, phase, browserProcess, getStderr, getSpawnError }) {
  const url = `http://${host}:${port}${path}`;
  let portOpen = false;
  let lastError = 'not attempted';
  for (let attempt = 1; attempt <= DEVTOOLS_RETRY_POLICY.maxAttempts; attempt += 1) {
    const spawnError = typeof getSpawnError === 'function' ? getSpawnError() : null;
    if (spawnError) {
      throw new HarnessFailure(
        HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
        phase,
        `Chrome spawn failed before ${path} became ready`,
        { url, attempt, portOpen, spawnError: spawnError.message || String(spawnError), stderr: stderrTail(getStderr) }
      );
    }
    const state = processState(browserProcess);
    if (!state.running) {
      throw new HarnessFailure(
        HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
        phase,
        `Chrome exited before ${path} became ready`,
        { url, attempt, portOpen, exitCode: state.exitCode, signal: state.signal, stderr: stderrTail(getStderr) }
      );
    }
    const portProbe = await probePort(host, port, DEVTOOLS_RETRY_POLICY.portProbeTimeoutMs);
    portOpen ||= portProbe.open;
    try {
      return await fetchJson(url, DEVTOOLS_RETRY_POLICY.requestTimeoutMs);
    } catch (error) {
      lastError = error?.message || String(error);
    }
    if (attempt < DEVTOOLS_RETRY_POLICY.maxAttempts) await sleep(DEVTOOLS_RETRY_POLICY.backoffMs);
  }
  const state = processState(browserProcess);
  throw new HarnessFailure(
    HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
    phase,
    `Timed out waiting for ${url}`,
    {
      url,
      maxAttempts: DEVTOOLS_RETRY_POLICY.maxAttempts,
      backoffMs: DEVTOOLS_RETRY_POLICY.backoffMs,
      requestTimeoutMs: DEVTOOLS_RETRY_POLICY.requestTimeoutMs,
      portOpen,
      timeoutReason: portOpen ? 'devtools_endpoint' : 'port_readiness',
      lastError,
      exitCode: state.exitCode,
      signal: state.signal,
      processStillRunning: state.running,
      stderr: stderrTail(getStderr)
    }
  );
}

export async function waitForDevToolsTargets({ host, port, browserProcess, getStderr, getSpawnError }) {
  await waitForEndpoint({
    host,
    port,
    path: '/json/version',
    phase: 'devtools_endpoint',
    browserProcess,
    getStderr,
    getSpawnError
  });
  const targets = await waitForEndpoint({
    host,
    port,
    path: '/json',
    phase: 'page_target',
    browserProcess,
    getStderr,
    getSpawnError
  });
  const pageTarget = Array.isArray(targets)
    ? targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
    : null;
  if (!pageTarget) {
    throw new HarnessFailure(
      HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
      'page_target',
      'DevTools endpoint is ready but no page target is available',
      { portOpen: true, targetCount: Array.isArray(targets) ? targets.length : null, stderr: stderrTail(getStderr) }
    );
  }
  return { targets, pageTarget };
}

export async function connectCdpWithDiagnostics(connect, details = {}) {
  try {
    await connect();
  } catch (error) {
    throw new HarnessFailure(
      HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
      'devtools_handshake',
      error?.message || String(error),
      details
    );
  }
}

export async function enableCdpDomainsWithDiagnostics(cdp, methods, details = {}) {
  try {
    for (const method of methods) await cdp.send(method);
  } catch (error) {
    throw new HarnessFailure(
      HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
      'devtools_handshake',
      error?.message || String(error),
      details
    );
  }
}

export async function cleanupHarnessResources({ cdp, chrome, browserExit, servers = [], profileDirs = [] } = {}) {
  try { await cdp?.send('Browser.close'); } catch {}
  try { cdp?.close(); } catch {}
  try { if (chrome && chrome.exitCode === null) chrome.kill(); } catch {}
  if (browserExit && chrome?.pid) {
    try {
      await Promise.race([
        browserExit,
        new Promise(resolve => setTimeout(resolve, 3_000))
      ]);
    } catch {}
  }
  for (const server of servers) {
    try {
      if (server?.listening) await new Promise(resolve => server.close(() => resolve()));
    } catch {}
  }
  for (const profileDir of profileDirs) {
    try { if (profileDir) await rm(profileDir, { recursive: true, force: true }); } catch {}
  }
}

export function formatHarnessFailure(error) {
  const failure = error instanceof HarnessFailure ? error : asApplicationFailure(error);
  const details = Object.entries(failure.details || {})
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ');
  return `${failure.message}${details ? ` ${details}` : ''}`;
}

export function classifyInjectedFailure(kind) {
  if (kind === HARNESS_FAILURE_KINDS.APPLICATION_FAILURE) return asApplicationFailure(new Error('injected application failure'));
  if (kind === HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE) return new HarnessFailure(kind, 'devtools_endpoint', 'injected browser startup failure');
  if (kind === HARNESS_FAILURE_KINDS.ENVIRONMENT_FAILURE) return asEnvironmentFailure(new Error('injected environment failure'));
  throw new Error('unknown injected failure kind: ' + kind);
}
