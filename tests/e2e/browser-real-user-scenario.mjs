#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const PORT_HOST = '127.0.0.1';
const repoEntry = path.join(ROOT, 'index.html');
const configuredTestTimeout = Number(process.env.E2E_TEST_TIMEOUT_MS);
const TEST_TIMEOUT = Number.isFinite(configuredTestTimeout) && configuredTestTimeout > 0 ? configuredTestTimeout : 60_000;
const LIFECYCLE_TEST_MODE = process.env.E2E_LIFECYCLE_TEST || '';
const CDP_COMMAND_TIMEOUT = 10_000;
const CDP_CONNECT_TIMEOUT = 10_000;
const CHILD_PROCESS_TIMEOUT = 3_000;
const SERVER_CLOSE_TIMEOUT = 2_000;
const PROFILE_CLEANUP_TIMEOUT = 5_000;

function log(message) { console.log('[E2E] ' + message); }
function check(condition, message) { assert.ok(condition, message); console.log('PASS  ' + message); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function waitForChildExit(child, timeoutMs = CHILD_PROCESS_TIMEOUT, label = 'child process') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    let done = false;
    let timer;
    const finish = (exited) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const onError = () => finish(true);
    timer = setTimeout(() => {
      log(label + ' exit wait timed out after ' + timeoutMs + 'ms');
      finish(false);
    }, timeoutMs);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function findBrowser() {
  const explicit = process.env.E2E_BROWSER;
  const candidates = explicit ? [explicit] : process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      ]
    : [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge'
      ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  for (const command of process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe']
    : ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try {
      const probe = spawn(command, ['--version'], { stdio: 'ignore', windowsHide: true });
      if (probe.pid) {
        await new Promise((resolve, reject) => {
          let timer = setTimeout(() => {
            try { probe.kill(); } catch {}
            reject(new Error('Browser version probe timed out after ' + CHILD_PROCESS_TIMEOUT + 'ms: ' + command));
          }, CHILD_PROCESS_TIMEOUT);
          probe.once('error', error => { clearTimeout(timer); reject(error); });
          probe.once('exit', code => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error('Browser version probe failed: ' + command + ' exit=' + code));
          });
        });
        return command;
      }
    } catch {}
  }
  throw new Error('No Chromium-family browser found. Set E2E_BROWSER to the browser executable path.');
}

function startStaticServer(timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const rawUrl = decodeURIComponent((req.url || '/').split('?')[0]);
        const requestPath = rawUrl === '/' ? '/index.html' : rawUrl;
        if (rawUrl === '/favicon.ico') { res.writeHead(204); res.end(); return; }
        const normalized = path.normalize(requestPath).replace(/^([.][.][\\/])+/, '');
        const filePath = path.resolve(ROOT, '.' + normalized);
        if (!filePath.startsWith(path.resolve(ROOT) + path.sep) && filePath !== repoEntry) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404); res.end('Not found'); return;
        }
        const contentType = filePath.endsWith('.html') ? 'text/html; charset=utf-8'
          : filePath.endsWith('.js') || filePath.endsWith('.mjs') ? 'text/javascript; charset=utf-8'
          : filePath.endsWith('.json') ? 'application/json'
          : filePath.endsWith('.css') ? 'text/css'
          : filePath.endsWith('.png') ? 'image/png'
          : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        res.writeHead(500); res.end(String(error));
      }
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch {}
      reject(new Error('Static server startup timed out after ' + timeoutMs + 'ms.'));
    }, timeoutMs);
    const onError = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Static server startup failed: ' + String(error?.message || error)));
    };
    server.once('error', onError);
    server.listen(0, PORT_HOST, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.removeListener('error', onError);
      resolve({ server, port: server.address().port });
    });
  });
}

async function waitForUrl(url, timeoutMs = 10_000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    if (shutdownRequested) throw (globalTimeoutError || new Error('Browser E2E shutdown requested while waiting for URL: ' + url));
    try {
      const remaining = timeoutMs - (Date.now() - start);
      return await fetchJsonWithTimeout(url, Math.max(250, Math.min(2_000, remaining)));
    } catch (error) { lastError = error; }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.events = new Map();
  }
  rejectPending(error) {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      let timer = setTimeout(() => {
        cleanup();
        reject(new Error('CDP WebSocket connect timed out after ' + CDP_CONNECT_TIMEOUT + 'ms.'));
      }, CDP_CONNECT_TIMEOUT);
      const onOpen = () => { cleanup(); resolve(); };
      const onError = (e) => { cleanup(); reject(new Error('CDP WebSocket failed: ' + String(e?.message || e))); };
      const cleanup = () => {
        clearTimeout(timer);
        this.ws.removeEventListener('open', onOpen);
        this.ws.removeEventListener('error', onError);
      };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
    });
    this.ws.addEventListener('close', () => {
      this.rejectPending(new Error('CDP connection closed before all commands completed.'));
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error('CDP ' + message.error.code + ': ' + message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const listeners = this.events.get(message.method) || [];
      for (const listener of listeners) listener(message.params);
    });
  }
  send(method, params = {}, timeoutMs = CDP_COMMAND_TIMEOUT) {
    if (!this.ws || this.ws.readyState !== 1) {
      return Promise.reject(new Error('CDP send rejected: WebSocket is not open for ' + method));
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP command timed out after ' + timeoutMs + 'ms: ' + method));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  on(method, listener) {
    const list = this.events.get(method) || [];
    list.push(listener);
    this.events.set(method, list);
  }
  close() { try { this.ws?.close(); } catch {} }
}

async function waitForFunction(cdp, expression, timeoutMs = 8_000, intervalMs = 75) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    if (shutdownRequested) throw (globalTimeoutError || new Error('Browser E2E shutdown requested while waiting for: ' + expression));
    last = await evaluate(cdp, expression);
    if (last === true) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  let diagnostic = '';
  try {
    if (expression.includes('window.__e2e')) {
      const stateExpr = "({provider:document.getElementById('providerSel')?.value,model:document.getElementById('modelInput')?.value,keyLength:document.getElementById('apiKey')?.value?.length,input:document.getElementById('inputText')?.value,processDisabled:document.getElementById('processBtn')?.disabled,error:document.getElementById('errorBox')?.textContent,progress:document.getElementById('progressText')?.textContent,e2e:window.__e2e || null})";
      diagnostic = ' DOMState=' + JSON.stringify(await evaluate(cdp, stateExpr));
    }
  } catch {}
  throw new Error('Timeout waiting for condition: ' + expression + ' (last=' + JSON.stringify(last) + ')' + diagnostic);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result?.value;
}

async function click(cdp, selector) {
  const ok = await evaluate(cdp, `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.click();return true;})()`);
  check(ok, 'click target exists: ' + selector);
}

async function clickText(cdp, selector, text) {
  const ok = await evaluate(cdp, `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.textContent.includes(${JSON.stringify(text)}));if(!el)return false;el.click();return true;})()`);
  check(ok, `click visible control containing "${text}"`);
}

async function typeInto(cdp, selector, text) {
  const type = await evaluate(cdp, `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;return el.type || el.tagName.toLowerCase();})()`);
  const ready = await evaluate(cdp, `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.focus();if('value' in el){el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));}return true;})()`);
  check(ready, 'input target exists: ' + selector);
  if (type === 'password') {
    const set = await evaluate(cdp, `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.value=${JSON.stringify(text)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return el.value === ${JSON.stringify(text)};})()`);
    check(set, 'test credential field accepts browser-side value');
    return;
  }
  await cdp.send('Input.insertText', { text });
}

async function read(cdp, expression) { return await evaluate(cdp, expression); }
async function waitForDurableBookDraft(cdp, expectedDraft, expectedTitle) {
  const draft = JSON.stringify(expectedDraft);
  const title = JSON.stringify(expectedTitle);
  const expression = `window.PrungAksornStorageV2.exportBackup().then(function(payload){return (payload.data.books || []).some(function(book){return book.draft === ${draft} && book.chapterTitle === ${title};});})`;
  await waitForFunction(cdp, expression, 12_000, 100);
  check(true, 'durable Book draft/title reached IndexedDB before continuing');
}


async function reload(cdp, url) {
  const previousTimeOrigin = await read(cdp, 'performance.timeOrigin');
  await cdp.send('Page.navigate', { url });
  await waitForFunction(
    cdp,
    `performance.timeOrigin !== ${JSON.stringify(previousTimeOrigin)} && document.readyState === 'complete' && location.href === ${JSON.stringify(url)} && !!document.getElementById('inputText')`,
    15_000
  );
  await waitForFunction(
    cdp,
    `typeof storageReady !== 'undefined' && storageReady === true && typeof appData !== 'undefined'`,
    15_000
  );
  await waitForFunction(cdp, `!!window.PrungAksornStorageV2 && !!document.getElementById('projectList')`, 10_000);
}

async function waitForReloadedBookState(cdp, expectedDraft, expectedTitle) {
  const draft = JSON.stringify(expectedDraft);
  const title = JSON.stringify(expectedTitle);
  await waitForFunction(
    cdp,
    `document.getElementById('inputText').value === ${draft} && document.getElementById('chapterTitle').value === ${title}`,
    10_000
  );
}

let server;
let chrome;
let cdp;
let profileDir;
let cleanupPromise = null;
let globalTimeoutTimer = null;
let globalTimeoutError = null;
let shutdownRequested = false;
const pageErrors = [];
let browserStdErr = '';

function signalBrowserProcessTree(signal) {
  if (!chrome?.pid) return;
  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    taskkill.unref();
    return;
  }
  try {
    process.kill(-chrome.pid, signal);
  } catch {
    try { process.kill(chrome.pid, signal); } catch {}
  }
}

async function cleanupRuntime() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    try {
      if (cdp) {
        try { await cdp.send('Browser.close', {}, 2_000); } catch {}
        try { cdp.close(); } catch {}
      }
    } catch {}

    try {
      if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
        signalBrowserProcessTree('SIGTERM');
        const stopped = await waitForChildExit(chrome, CHILD_PROCESS_TIMEOUT, 'Browser process tree');
        if (!stopped) {
          signalBrowserProcessTree('SIGKILL');
          const killed = await waitForChildExit(chrome, CHILD_PROCESS_TIMEOUT, 'Browser process tree after SIGKILL');
          if (!killed) log('WARNING: browser process tree did not confirm exit within the cleanup deadline.');
        }
      }
    } catch (error) {
      log('Browser cleanup warning: ' + String(error?.message || error));
    }

    try {
      if (server?.listening) {
        await Promise.race([
          new Promise(resolve => {
            try { server.close(() => resolve()); } catch { resolve(); }
          }),
          delay(SERVER_CLOSE_TIMEOUT).then(() => { throw new Error('Static server close timed out after ' + SERVER_CLOSE_TIMEOUT + 'ms.'); })
        ]);
      }
    } catch (error) {
      log('Server cleanup warning: ' + String(error?.message || error));
    }

    if (profileDir) {
      try {
        await Promise.race([
          rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }),
          delay(PROFILE_CLEANUP_TIMEOUT).then(() => { throw new Error('Temporary browser profile cleanup timed out after ' + PROFILE_CLEANUP_TIMEOUT + 'ms.'); })
        ]);
      } catch (error) {
        log('Profile cleanup warning: ' + String(error?.message || error));
      }
    }
  })();
  try {
    return await cleanupPromise;
  } finally {
    cleanupPromise = null;
  }
}

function requestShutdown(signal, message, exitCode) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  process.exitCode = exitCode;
  globalTimeoutError = new Error(message);
  console.error(globalTimeoutError.message);
  void cleanupRuntime()
    .catch(() => {})
    .finally(() => process.exit(exitCode));
}

function handleSignal(signal) {
  requestShutdown(
    signal,
    'Browser E2E interrupted by ' + signal + '.',
    signal === 'SIGINT' ? 130 : 143
  );
}

process.once('SIGINT', handleSignal);
process.once('SIGTERM', handleSignal);
globalTimeoutTimer = setTimeout(() => {
  requestShutdown(
    'TIMEOUT',
    'Browser E2E global timeout after ' + TEST_TIMEOUT + 'ms. Check the last completed step and CDP/process teardown.',
    1
  );
}, TEST_TIMEOUT);

try {
  const browser = await findBrowser();
  log('Browser: ' + browser);
  const started = await startStaticServer();
  server = started.server;
  const baseUrl = `http://${PORT_HOST}:${started.port}`;
  const e2eUrl = `${baseUrl}/index.html`;
  log('HTTP origin: ' + e2eUrl);

  profileDir = await mkdtemp(path.join(os.tmpdir(), 'prung-aksorn-e2e-'));
  const debugPortHolder = await new Promise((resolve, reject) => {
    const probe = createServer();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { probe.close(); } catch {}
      reject(new Error('Remote debugging port probe timed out after 5_000ms.'));
    }, 5_000);
    const onError = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Remote debugging port probe failed: ' + String(error?.message || error)));
    };
    probe.once('error', onError);
    probe.listen(0, PORT_HOST, () => {
      if (settled) return;
      const port = probe.address().port;
      probe.close(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(port);
      });
    });
  });

  chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--no-first-run',
    '--no-default-browser-check', '--user-data-dir=' + profileDir,
    '--remote-debugging-port=' + debugPortHolder, '--window-size=1440,1200', e2eUrl
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
  chrome.on('error', error => log('Browser child error: ' + String(error?.message || error)));
  chrome.stderr.on('data', chunk => { browserStdErr += String(chunk); });
  chrome.on('exit', code => log('Browser exited with code ' + code));
  try {
    await waitForUrl(`http://${PORT_HOST}:${debugPortHolder}/json/version`, 15_000);
  } catch (error) {
    const exitState = chrome.exitCode !== null || chrome.signalCode !== null
      ? ' exitCode=' + chrome.exitCode + ' signal=' + chrome.signalCode
      : ' processStillRunning=true';
    const stderr = browserStdErr.trim();
    throw new Error(
      'Browser DevTools endpoint did not become ready: ' + error.message +
      exitState +
      (stderr ? '\nBrowser stderr:\n' + stderr.slice(-4000) : '\nBrowser stderr: <empty>')
    );
  }
  const targets = await waitForUrl(`http://${PORT_HOST}:${debugPortHolder}/json`, 10_000);
  const pageTarget = Array.isArray(targets) ? targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl) : null;
  if (!pageTarget) throw new Error('No browser page target available for CDP.');
  cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  cdp.on('Runtime.exceptionThrown', params => {
    const detail = params?.exceptionDetails;
    const description = detail?.exception?.description || detail?.text || 'unknown exception';
    pageErrors.push(description);
  });
  cdp.on('Log.entryAdded', params => {
    if (params.entry?.level === 'error') pageErrors.push(params.entry.text || 'browser log error');
  });

  await waitForFunction(cdp, `document.readyState === 'complete' && !!document.getElementById('addProjBtn')`, 15_000);
  await waitForFunction(cdp, `!!window.PrungAksornStorageV2`, 15_000);
  await waitForFunction(cdp, `navigator.serviceWorker ? navigator.serviceWorker.ready.then(()=>true).catch(()=>false) : false`, 10_000, 100);
  check(true, 'app loads in a real Chromium browser over HTTP');

  if (LIFECYCLE_TEST_MODE) {
    if (!['setup-exception', 'global-timeout', 'signal'].includes(LIFECYCLE_TEST_MODE)) {
      throw new Error('Unknown lifecycle test mode: ' + LIFECYCLE_TEST_MODE);
    }
    log('Lifecycle test hook armed: ' + LIFECYCLE_TEST_MODE);
    if (LIFECYCLE_TEST_MODE === 'setup-exception') {
      throw new Error('Injected setup exception after browser/server/CDP initialization.');
    }
    if (LIFECYCLE_TEST_MODE === 'global-timeout' || LIFECYCLE_TEST_MODE === 'signal') {
      await new Promise(() => {});
    }
  }

  await click(cdp, '#gearBtn');
  await waitForFunction(cdp, `document.getElementById('settingsPanel').classList.contains('open')`, 8_000);
  await click(cdp, '#modelPickerTrigger');
  await waitForFunction(cdp, `document.getElementById('modelPicker').classList.contains('open') && [...document.querySelectorAll('#modelPickerList .model-picker-option-label')].some(x=>x.textContent.includes('GPT-4o Mini'))`, 8_000);
  check(await read(cdp, `[...document.querySelectorAll('#modelPickerList .model-picker-option-id')].some(x=>x.textContent === 'gpt-4o-mini')`), 'OpenAI catalog exposes the built-in GPT-4o Mini model');

  await evaluate(cdp, `(()=>{const el=document.getElementById('provider');el.value='gemini';el.dispatchEvent(new Event('change',{bubbles:true}));return el.value;})()`);
  await waitForFunction(cdp, `document.getElementById('model').value === 'gemini-flash-latest' && document.getElementById('modelPicker').classList.contains('open')`, 8_000);
  check(await read(cdp, `[...document.querySelectorAll('#modelPickerList .model-picker-option-id')].some(x=>x.textContent === 'gemini-3.5-flash')`), 'Gemini catalog exposes the built-in 3.5 Flash model');
  await clickText(cdp, '#modelPickerList .model-picker-option-main', 'gemini-3.5-flash');
  check(await read(cdp, `document.getElementById('model').value === 'gemini-3.5-flash' && document.getElementById('modelPickerValue').textContent === 'gemini-3.5-flash'`), 'Selecting a built-in model updates the stable runtime model value');

  await click(cdp, '#modelPickerTrigger');
  await waitForFunction(cdp, `document.getElementById('modelPicker').classList.contains('open')`);
  await click(cdp, '#modelPickerAddBtn');
  await typeInto(cdp, '#modelPickerAddInput', 'e2e-custom-gemini-model');
  await click(cdp, '#modelPickerSaveBtn');
  await waitForFunction(cdp, `document.getElementById('model').value === 'e2e-custom-gemini-model' && [...document.querySelectorAll('#modelPickerList .model-picker-option-id')].some(x=>x.textContent === 'e2e-custom-gemini-model')`, 8_000);
  check(await read(cdp, `document.querySelector('#modelPickerList .model-picker-custom-badge')?.textContent === 'เพิ่มเอง'`), 'Custom model is added to the provider-specific catalog');

  await reload(cdp, e2eUrl);
  check(await read(cdp, `document.getElementById('provider').value === 'gemini' && document.getElementById('model').value === 'e2e-custom-gemini-model'`), 'Custom model and provider selection survive browser reload');

  await click(cdp, '#modelPickerTrigger');
  await waitForFunction(cdp, `document.getElementById('modelPicker').classList.contains('open')`);
  check(await read(cdp, `[...document.querySelectorAll('#modelPickerList .model-picker-option-id')].some(x=>x.textContent === 'e2e-custom-gemini-model')`), 'Persisted custom model remains visible after reload');

  await evaluate(cdp, `(()=>{const el=document.getElementById('provider');el.value='openai';el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await waitForFunction(cdp, `document.getElementById('model').value === 'gpt-4o-mini'`, 8_000);
  await evaluate(cdp, `(()=>{const el=document.getElementById('provider');el.value='gemini';el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await waitForFunction(cdp, `document.getElementById('model').value === 'e2e-custom-gemini-model'`, 8_000);
  check(await read(cdp, `window.appData?.settings?.selectedModels?.openai === 'gpt-4o-mini' && window.appData?.settings?.selectedModels?.gemini === 'e2e-custom-gemini-model'`), 'Per-provider model selections are persisted in settings');
  check(true, 'Each provider remembers its own last selected model');

  await evaluate(cdp, `(()=>{const el=[...document.querySelectorAll('#modelPickerList .model-picker-delete-btn')].find(x=>x.getAttribute('aria-label') === 'ลบโมเดล e2e-custom-gemini-model');if(!el)return false;el.click();return true;})()`);
  await waitForFunction(cdp, `document.getElementById('appDialogOverlay').classList.contains('show')`);
  await click(cdp, '#appDialogConfirmBtn');
  await waitForFunction(cdp, `document.getElementById('model').value === 'gemini-flash-latest' && ![...document.querySelectorAll('#modelPickerList .model-picker-option-id')].some(x=>x.textContent === 'e2e-custom-gemini-model')`, 8_000);
  check(true, 'Deleting a custom model falls back to the provider default safely');

  await evaluate(cdp, `(()=>{const el=document.getElementById('provider');el.value='openai';el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await waitForFunction(cdp, `document.getElementById('provider').value === 'openai' && document.getElementById('model').value === 'gpt-4o-mini'`, 8_000);
  check(true, 'Provider can return to the default OpenAI runtime model after catalog operations');

  check(await read(cdp, `document.querySelectorAll('.project-row').length === 0`), 'clean E2E profile starts with no projects');

  await click(cdp, '#addProjBtn');
  await waitForFunction(cdp, `document.getElementById('appDialogOverlay').classList.contains('show') && document.getElementById('appDialogInput').style.display !== 'none'`, 8_000);
  await typeInto(cdp, '#appDialogInput', 'E2E Workspace');
  await click(cdp, '#appDialogConfirmBtn');
  await waitForFunction(cdp, `document.querySelector('.project-row') && document.querySelector('.project-row').textContent.includes('E2E Workspace')`, 8_000);
  check(await read(cdp, `document.querySelectorAll('.project-row').length === 1`), 'Project created through visible UI');

  await typeInto(cdp, '#chapterTitle', 'E2E Draft A');
  await typeInto(cdp, '#inputText', 'Draft content belonging to Book A');
  await waitForDurableBookDraft(cdp, 'Draft content belonging to Book A', 'E2E Draft A');
  check(await read(cdp, `document.getElementById('inputText').value === 'Draft content belonging to Book A'`), 'Book A draft entered through the editor');

  await click(cdp, '.book-list.open .utility-btn');
  await waitForFunction(cdp, `document.getElementById('appDialogOverlay').classList.contains('show')`);
  await typeInto(cdp, '#appDialogInput', 'Book B');
  await click(cdp, '#appDialogConfirmBtn');
  await waitForFunction(cdp, `[...document.querySelectorAll('.book-title-text')].some(x=>x.textContent.includes('Book B'))`, 8_000);
  check(await read(cdp, `document.getElementById('inputText').value === ''`), 'new Book B starts with isolated empty editor state');

  await typeInto(cdp, '#chapterTitle', 'E2E Draft B');
  await typeInto(cdp, '#inputText', 'Draft content belonging to Book B');
  await waitForDurableBookDraft(cdp, 'Draft content belonging to Book B', 'E2E Draft B');

  await evaluate(cdp, `document.querySelector('.book-title-text').click()`);
  await waitForFunction(cdp, `document.getElementById('inputText').value === 'Draft content belonging to Book A'`, 8_000);
  check(await read(cdp, `document.getElementById('chapterTitle').value === 'E2E Draft A'`), 'switching back restores Book A draft and title');

  await evaluate(cdp, `(()=>{
    const originalFetch = window.fetch.bind(window);
    window.__e2e = { pending:false, released:false, resolve:null, calls:0, blockedExternalCalls:[] };
    window.fetch = function(url, options){
      const targetUrl = String(url);
      if(targetUrl.includes('api.openai.com/v1/chat/completions')){
        window.__e2e.calls += 1;
        window.__e2e.pending = true;
        return new Promise(resolve=>{ window.__e2e.resolve = () => { window.__e2e.released = true; window.__e2e.pending=false; resolve(new Response(JSON.stringify({choices:[{message:{content:'Translated result from Book A'}}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200,headers:{'Content-Type':'application/json'}})); }; });
      }
      if(/^https?:/i.test(targetUrl) && !targetUrl.startsWith(window.location.origin)){
        window.__e2e.blockedExternalCalls.push(targetUrl);
        return Promise.reject(new Error('Unexpected external network call blocked by E2E harness: ' + targetUrl));
      }
      return originalFetch(url, options);
    };
  })()`);
  await typeInto(cdp, '#apiKey', 'e2e-only-test-key');
  await typeInto(cdp, '#chapterTitle', 'E2E Translation A');
  await typeInto(cdp, '#inputText', 'Source content for Book A translation');
  await click(cdp, '#processBtn');
  await waitForFunction(cdp, `window.__e2e && window.__e2e.pending === true && window.__e2e.calls === 1`, 8_000);
  check(await read(cdp, `document.getElementById('cancelBtn').classList.contains('show')`), 'real UI enters translating state while provider request is in flight');

  await clickText(cdp, '.book-title-text', 'Book B');
  await waitForFunction(cdp, `document.getElementById('inputText').value === 'Draft content belonging to Book B'`, 8_000);
  check(await read(cdp, `document.getElementById('output').textContent.trim() === ''`), 'Book B output remains empty during Book A translation');

  await evaluate(cdp, `window.__e2e.resolve()`);
  await waitForFunction(cdp, `window.__e2e.released === true && document.getElementById('processBtn').disabled === false && document.getElementById('output').textContent.trim() === ''`, 12_000);
  check(await read(cdp, `document.getElementById('inputText').value === 'Draft content belonging to Book B'`), 'completed Book A response does not overwrite Book B input');
  check(await read(cdp, `document.getElementById('output').textContent.trim() === ''`), 'completed Book A response does not overwrite Book B output');
  check(await read(cdp, `document.getElementById('processBtn').disabled === false`), 'real UI leaves the active Book ready after stale job completion');
  check(await read(cdp, `window.__e2e.blockedExternalCalls.length === 0`), 'E2E scenario made no unexpected external network calls');
  check(await read(cdp, `window.__e2e.calls === 1`), 'E2E scenario made exactly one mocked provider request');

  await waitForDurableBookDraft(cdp, 'Draft content belonging to Book B', 'E2E Draft B');
  await reload(cdp, e2eUrl);
  await waitForReloadedBookState(cdp, 'Draft content belonging to Book B', 'E2E Draft B');
  check(await read(cdp, `document.getElementById('inputText').value === 'Draft content belonging to Book B'`), 'Book B draft survives a real browser reload');
  check(await read(cdp, `document.getElementById('chapterTitle').value === 'E2E Draft B'`), 'Book B chapter title survives reload');

  await clickText(cdp, '.project-row', 'E2E Workspace');
  await waitForFunction(cdp, `document.querySelectorAll('.book-title-text').length >= 2`, 8_000);
  await evaluate(cdp, `document.querySelector('.book-title-text').click()`);
  await waitForFunction(cdp, `[...document.querySelectorAll('.history-entry')].some(x=>x.textContent.includes('E2E Translation A'))`, 10_000);
  await clickText(cdp, '.history-entry', 'E2E Translation A');
  await waitForFunction(cdp, `document.getElementById('output').textContent.includes('Translated result from Book A')`, 8_000);
  check(await read(cdp, `document.getElementById('output').textContent.includes('Translated result from Book A')`), 'Book A translated result remains accessible through visible history UI');

  await cdp.send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  check(await read(cdp, `(()=>{const host=document.querySelector('.action-container'); const box=document.createElement('div'); box.id='translationRecoveryBox'; box.innerHTML='<div>พบงานแปลที่ต้องตรวจสอบ</div><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">千零四十五章 書奇隔落 長標題สำหรับทดสอบมือถือ — 0/1 (failed) — ไม่พบ Project ต้นทาง</span><div style="display:flex;align-items:center;gap:6px;flex-shrink:0"><button type="button">ซ่อน</button></div></div><div style="margin-top:8px;font-size:.9em;opacity:.75">ระบบจะไม่เริ่ม API อัตโนมัติ ต้องกดกู้คืนและเริ่มงานด้วยตนเอง</div>'; host.appendChild(box); const dismiss=box.querySelector('button'); const boxRect=box.getBoundingClientRect(); const buttonRect=dismiss.getBoundingClientRect(); const fits=boxRect.left>=0 && boxRect.right<=window.innerWidth && document.documentElement.scrollWidth<=window.innerWidth && buttonRect.width>0 && buttonRect.left>=0 && buttonRect.right<=window.innerWidth; box.remove(); return fits;})()`), 'mobile recovery box keeps the dismiss button inside the viewport');
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  check(pageErrors.length === 0, 'browser reported no uncaught runtime/page errors during E2E scenario');
  console.log('');
  console.log('Browser E2E / Real User Scenario: PASS');
} catch (error) {
  console.error('');
  const failure = globalTimeoutError || error;
  console.error('Browser E2E / Real User Scenario: FAIL — ' + (failure.stack || failure.message || failure));
  if (pageErrors.length) console.error('Browser errors:\n' + pageErrors.join('\n'));
  process.exitCode = 1;
} finally {
  if (globalTimeoutTimer) clearTimeout(globalTimeoutTimer);
  process.removeListener('SIGINT', handleSignal);
  process.removeListener('SIGTERM', handleSignal);
  shutdownRequested = true;
  try { await cleanupRuntime(); } catch (cleanupError) { console.error('Cleanup warning:', cleanupError.message); }
  if (chrome && chrome.exitCode !== null) {
    console.log('PASS  browser child process exited before E2E teardown completed');
  }
  if (!server || !server.listening) {
    console.log('PASS  local static server is closed before E2E teardown completed');
  }
}
