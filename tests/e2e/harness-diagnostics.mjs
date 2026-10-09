import net from 'node:net';
import path from 'node:path';
import { readFile, rm } from 'node:fs/promises';

export const HARNESS_FAILURE_KINDS = Object.freeze({
  APPLICATION_FAILURE: 'APPLICATION_FAILURE',
  BROWSER_STARTUP_FAILURE: 'BROWSER_STARTUP_FAILURE',
  ENVIRONMENT_FAILURE: 'ENVIRONMENT_FAILURE'
});

export const DEVTOOLS_RETRY_POLICY = Object.freeze({
  maxAttempts: 300,
  backoffMs: 100,
  requestTimeoutMs: 1_000,
  portProbeTimeoutMs: 250,
  startupTimeoutMs: 30_000
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

export async function waitForDevToolsPort({
  profileDir,
  browserProcess,
  getStderr,
  getSpawnError,
  timeoutMs = DEVTOOLS_RETRY_POLICY.startupTimeoutMs
}) {
  if (typeof profileDir !== 'string' || !profileDir) {
    throw new HarnessFailure(
      HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
      'devtools_port_file',
      'Chrome profile directory is required to discover the ephemeral DevTools port.'
    );
  }

  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let lastError = 'DevToolsActivePort has not been created';

  while (attempts < DEVTOOLS_RETRY_POLICY.maxAttempts && Date.now() < deadline) {
    attempts += 1;

    const spawnError = typeof getSpawnError === 'function' ? getSpawnError() : null;
    if (spawnError) {
      throw new HarnessFailure(
        HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
        'devtools_port_file',
        'Chrome spawn failed before DevToolsActivePort became ready',
        {
          portFile,
          attempt: attempts,
          spawnError: spawnError.message || String(spawnError),
          stderr: stderrTail(getStderr)
        }
      );
    }

    const state = processState(browserProcess);
    if (!state.running) {
      throw new HarnessFailure(
        HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
        'devtools_port_file',
        'Chrome exited before DevToolsActivePort became ready',
        {
          portFile,
          attempt: attempts,
          exitCode: state.exitCode,
          signal: state.signal,
          stderr: stderrTail(getStderr)
        }
      );
    }

    try {
      const lines = (await readFile(portFile, 'utf8')).split(/\r?\n/).map(line => line.trim());
      const port = Number(lines[0]);
      if (
        Number.isInteger(port) &&
        port > 0 &&
        port <= 65535 &&
        /^\/devtools\/browser\/[^/]+$/.test(lines[1] || '')
      ) {
        return port;
      }
      lastError = 'DevToolsActivePort contains an invalid or incomplete port/websocket path';
    } catch (error) {
      lastError = error?.code === 'ENOENT'
        ? 'DevToolsActivePort has not been created yet'
        : error?.message || String(error);
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await sleep(Math.min(DEVTOOLS_RETRY_POLICY.backoffMs, remaining));
    }
  }

  const state = processState(browserProcess);
  throw new HarnessFailure(
    HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
    'devtools_port_file',
    `Timed out waiting for ${portFile}`,
    {
      portFile,
      timeoutMs,
      attempts,
      backoffMs: DEVTOOLS_RETRY_POLICY.backoffMs,
      lastError,
      exitCode: state.exitCode,
      signal: state.signal,
      processStillRunning: state.running,
      stderr: stderrTail(getStderr)
    }
  );
}

async function waitForEndpoint({ host, port, path: endpointPath, phase, browserProcess, getStderr, getSpawnError }) {
  const url = `http://${host}:${port}${endpointPath}`;
  const deadline = Date.now() + DEVTOOLS_RETRY_POLICY.startupTimeoutMs;
  let portOpen = false;
  let lastError = 'not attempted';
  let attempts = 0;

  while (attempts < DEVTOOLS_RETRY_POLICY.maxAttempts && Date.now() < deadline) {
    attempts += 1;
    const spawnError = typeof getSpawnError === 'function' ? getSpawnError() : null;
    if (spawnError) {
      throw new HarnessFailure(
        HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
        phase,
        `Chrome spawn failed before ${endpointPath} became ready`,
        { url, attempt: attempts, portOpen, spawnError: spawnError.message || String(spawnError), stderr: stderrTail(getStderr) }
      );
    }
    const state = processState(browserProcess);
    if (!state.running) {
      throw new HarnessFailure(
        HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
        phase,
        `Chrome exited before ${endpointPath} became ready`,
        { url, attempt: attempts, portOpen, exitCode: state.exitCode, signal: state.signal, stderr: stderrTail(getStderr) }
      );
    }
    const portProbe = await probePort(host, port, DEVTOOLS_RETRY_POLICY.portProbeTimeoutMs);
    portOpen ||= portProbe.open;
    try {
      return await fetchJson(url, Math.min(
        DEVTOOLS_RETRY_POLICY.requestTimeoutMs,
        Math.max(1, deadline - Date.now())
      ));
    } catch (error) {
      lastError = error?.message || String(error);
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await sleep(Math.min(DEVTOOLS_RETRY_POLICY.backoffMs, remaining));
    }
  }

  const state = processState(browserProcess);
  throw new HarnessFailure(
    HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE,
    phase,
    `Timed out waiting for ${url}`,
    {
      url,
      timeoutMs: DEVTOOLS_RETRY_POLICY.startupTimeoutMs,
      attempts,
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

export async function waitForDevToolsTargets({ host, port, profileDir, browserProcess, getStderr, getSpawnError }) {
  const resolvedPort = Number.isInteger(port) && port > 0
    ? port
    : await waitForDevToolsPort({ profileDir, browserProcess, getStderr, getSpawnError });

  await waitForEndpoint({
    host,
    port: resolvedPort,
    path: '/json/version',
    phase: 'devtools_endpoint',
    browserProcess,
    getStderr,
    getSpawnError
  });
  const targets = await waitForEndpoint({
    host,
    port: resolvedPort,
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
  return { targets, pageTarget, port: resolvedPort };
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
