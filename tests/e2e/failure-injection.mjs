#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const HOST = '127.0.0.1';

function pass(message) { console.log('PASS  ' + message); }
function check(condition, message) {
  assert.ok(condition, message);
  pass(message);
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
    : [        '/usr/bin/google-chrome',
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
          probe.once('error', reject);
          probe.once('exit', code => code === 0 ? resolve() : reject(new Error('version probe failed')));
        });
        return command;
      }
    } catch {}
  }  throw new Error('No Chromium-family browser found. Set E2E_BROWSER to a browser executable path.');
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const rawUrl = decodeURIComponent((req.url || '/').split('?')[0]);
        const requestPath = rawUrl === '/' ? '/index.html' : rawUrl;
        if (rawUrl === '/favicon.ico') {
          res.writeHead(204); res.end(); return;
        }
        const root = path.resolve(ROOT);
        const normalized = path.normalize(requestPath).replace(/^([.][.][\\/])+/, '');
        const filePath = path.resolve(ROOT, '.' + normalized);
        if (!filePath.startsWith(root + path.sep)) {
          res.writeHead(403); res.end('Forbidden'); return;
        }        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404); res.end('Not found'); return;
        }
        const type = filePath.endsWith('.html') ? 'text/html; charset=utf-8'
          : filePath.endsWith('.js') || filePath.endsWith('.mjs') ? 'text/javascript; charset=utf-8'
          : filePath.endsWith('.json') ? 'application/json; charset=utf-8'
          : filePath.endsWith('.css') ? 'text/css; charset=utf-8'
          : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        res.writeHead(500); res.end(String(error));
      }
    });
    server.once('error', reject);
    server.listen(0, HOST, () => resolve({ server, port: server.address().port }));
  });
}async function waitForUrl(url, timeoutMs = 10000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      lastError = new Error('HTTP ' + res.status);
    } catch (error) {
      lastError = error;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Timed out waiting for ' + url + ': ' + (lastError?.message || 'unknown error'));
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();    this.events = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = event => {
        cleanup();
        reject(new Error('CDP WebSocket failed: ' + String(event?.message || event)));
      };
      const cleanup = () => {
        this.ws.removeEventListener('open', onOpen);
        this.ws.removeEventListener('error', onError);
      };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
    });    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(
          'CDP ' + message.error.code + ': ' + message.error.message
        ));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.events.get(message.method) || []) listener(message.params);
    });
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, listener) {
    const list = this.events.get(method) || [];
    list.push(listener);    this.events.set(method, list);
  }
  close() { try { this.ws?.close(); } catch {} }
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

async function waitForFunction(cdp, expression, timeoutMs = 8000, intervalMs = 75) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await evaluate(cdp, expression);
    if (last === true) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }  throw new Error('Timeout waiting for condition: ' + expression +
    ' (last=' + JSON.stringify(last) + ')');
}

async function click(cdp, selector) {
  const ok = await evaluate(cdp, '(() => {' +
    'const el = document.querySelector(' + JSON.stringify(selector) + ');' +
    'if (!el) return false; el.click(); return true;' +
    '})()');
  check(ok, 'click target exists: ' + selector);
}

async function typeInto(cdp, selector, value) {
  const kind = await evaluate(cdp, '(() => {' +
    'const el = document.querySelector(' + JSON.stringify(selector) + ');' +
    'return el ? (el.type || el.tagName.toLowerCase()) : null;' +
    '})()');
  const ready = await evaluate(cdp, '(() => {' +
    'const el = document.querySelector(' + JSON.stringify(selector) + ');' +
    "if (!el) return false; el.focus(); if ('value' in el) { el.value=''; el.dispatchEvent(new Event('input',{bubbles:true})); }" +
    'return true; })()');  check(ready, 'input target exists: ' + selector);
  if (kind === 'password') {
    const set = await evaluate(cdp, '(() => {' +
      'const el = document.querySelector(' + JSON.stringify(selector) + ');' +
      'if (!el) return false;' +
      'el.value = ' + JSON.stringify(value) + ';' +
      "el.dispatchEvent(new Event('input',{bubbles:true}));" +
      "el.dispatchEvent(new Event('change',{bubbles:true}));" +
      'return el.value === ' + JSON.stringify(value) + ';' +
      '})()');
    check(set, 'test credential accepted');
    return;
  }
  await cdp.send('Input.insertText', { text: value });
}

async function setupBrowser() {
  const browser = await findBrowser();
  const started = await startStaticServer();
  const url = 'http://' + HOST + ':' + started.port + '/index.html';
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'prung-aksorn-fi-'));  const debugPort = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
  const chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update',
    '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profileDir,
    '--remote-debugging-port=' + debugPort,
    '--window-size=1440,1200', url
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const browserExit = new Promise(resolve => chrome.once('exit', resolve));  const targets = await waitForUrl('http://' + HOST + ':' + debugPort + '/json', 15000);
  const pageTarget = Array.isArray(targets)
    ? targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
    : null;
  if (!pageTarget) throw new Error('No browser page target available for CDP.');
  const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  const runtimeErrors = [];
  const logErrors = [];
  cdp.on('Runtime.exceptionThrown', params => {
    const d = params?.exceptionDetails;
    runtimeErrors.push(d?.exception?.description || d?.text || 'unknown exception');
  });  cdp.on('Log.entryAdded', params => {
    if (params.entry?.level === 'error') logErrors.push(params.entry.text || 'browser log error');
  });
  await waitForFunction(cdp,
    "document.readyState === 'complete' && !!document.getElementById('addProjBtn')", 15000);
  await waitForFunction(cdp, '!!window.PrungAksornStorageV2', 15000);
  await evaluate(cdp,
    "navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true).catch(() => false) : false");
  check(
    await evaluate(cdp, "document.querySelectorAll('.project-row').length === 0"),
    'clean FI profile starts empty'
  );
  return { browser, server: started.server, url, cdp, chrome, browserExit,
    profileDir, runtimeErrors, logErrors };
}async function cleanupBrowser(ctx) {
  try { await ctx.cdp?.send('Browser.close'); } catch {}
  try { ctx.cdp?.close(); } catch {}
  try { if (ctx.chrome && ctx.chrome.exitCode === null) ctx.chrome.kill(); } catch {}
  try {
    await Promise.race([
      ctx.browserExit,
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
  } catch {}
  try { ctx.server?.close(); } catch {}
  try { await rm(ctx.profileDir, { recursive: true, force: true }); } catch {}
}

async function createProject(ctx, name) {
  await click(ctx.cdp, '#addProjBtn');
  await waitForFunction(ctx.cdp,
    "document.getElementById('appDialogOverlay').classList.contains('show')");
  await typeInto(ctx.cdp, '#appDialogInput', name);
  await click(ctx.cdp, '#appDialogConfirmBtn');  await waitForFunction(ctx.cdp,
    "document.querySelector('.project-row')?.textContent.includes(" + JSON.stringify(name) + ")");
  check(
    await evaluate(ctx.cdp, "document.querySelectorAll('.project-row').length === 1"),
    'Project created for FI scenario'
  );
}

async function prepareTranslation(ctx, title, source) {
  await typeInto(ctx.cdp, '#apiKey', 'fi-only-test-key');
  await typeInto(ctx.cdp, '#chapterTitle', title);
  await typeInto(ctx.cdp, '#inputText', source);
}

async function installFetchFault(ctx, mode) {
  await evaluate(ctx.cdp, '(() => {' +
    'const originalFetch = window.fetch.bind(window);' +
    'window.__fi = { mode: ' + JSON.stringify(mode) +
      ', calls: 0, failures: 0, external: [], pending: false };' +
    'window.fetch = function(url, options) {' +
      'const target = String(url);' +
      "if (target.includes('api.openai.com/v1/chat/completions')) {" +
        'window.__fi.calls += 1;' +
        "if (window.__fi.mode === 'retry-success' && window.__fi.calls <= 2) {" +
          'window.__fi.failures += 1;' +
          'return Promise.resolve(new Response(' +
            "JSON.stringify({ error: { message: 'Injected HTTP 500' } })," +
            " { status: 500, headers: { 'Content-Type': 'application/json' } }));" +
        '}' +
        "if (window.__fi.mode === 'retry-success') {" +
          'window.__fi.pending = false;' +
          'return Promise.resolve(new Response(' +
            "JSON.stringify({ choices: [{ message: { content: 'Injected recovered translation' } }]," +
              ' usage: { prompt_tokens: 1, completion_tokens: 1 } }),' +
            " { status: 200, headers: { 'Content-Type': 'application/json' } }));" +
        '}' +
        "if (window.__fi.mode === 'permanent-network') {" +
          'window.__fi.failures += 1;' +
          "return Promise.reject(new TypeError('Injected network failure'));" +
        '}' +        "if (window.__fi.mode === 'cancel') {" +
          'window.__fi.pending = true;' +
          'return new Promise((resolve, reject) => {' +
            "const abort = () => reject(new DOMException('Injected cancellation', 'AbortError'));" +
            'if (options?.signal?.aborted) { abort(); return; }' +
            "options?.signal?.addEventListener('abort', abort, { once: true });" +
          '});' +
        '}' +
      '}' +
      "if (/^https?:/i.test(target) && !target.startsWith(window.location.origin)) {" +
        'window.__fi.external.push(target);' +
        "return Promise.reject(new Error('Unexpected external network call blocked by FI harness'));" +
      '}' +
      'return originalFetch(url, options);' +
    '};' +
  '})()');
}

async function latestJob(ctx) {
  return await evaluate(ctx.cdp, '(async () => {' +
    'const jobs = await window.PrungAksornStorageV2.listTranslationJobs();' +
    'return jobs[0] || null;' +
  '})()');
}

async function assertNoUnexpectedRuntimeErrors(ctx, allowedLogPrefixes = []) {
  const unexpectedLogs = ctx.logErrors.filter(entry =>
    !allowedLogPrefixes.some(prefix => entry.startsWith(prefix))
  );
  check(ctx.runtimeErrors.length === 0, 'no uncaught browser runtime exceptions: ' + JSON.stringify(ctx.runtimeErrors));
  check(unexpectedLogs.length === 0, 'no unexpected browser console errors: ' + JSON.stringify(unexpectedLogs));
  check(
    await evaluate(ctx.cdp, '!window.__fi || window.__fi.external.length === 0'),
    'no unexpected external calls'
  );
}

async function runScenario(name, allowedLogs, body) {
  console.log('\n=== ' + name + ' ===');
  const ctx = await setupBrowser();  try {
    await body(ctx);
    await assertNoUnexpectedRuntimeErrors(ctx, allowedLogs);
    pass(name + ' — PASS');
  } finally {
    await cleanupBrowser(ctx);
  }
}

async function scenarioCancelPersistenceFailure(ctx) {
  await createProject(ctx, 'FI Cancel Persistence Failure');
  await installFetchFault(ctx, 'cancel');
  await prepareTranslation(ctx, 'FI Cancel Persistence', 'Cancel persistence failure source');
  await click(ctx.cdp, '#processBtn');
  await waitForFunction(ctx.cdp,
    "window.__fi.pending === true && document.getElementById('cancelBtn').classList.contains('show')");
  await evaluate(ctx.cdp,
    "window.__origCancel=window.PrungAksornStorageV2.cancelTranslationJob;" +
    "window.PrungAksornStorageV2.cancelTranslationJob=async()=>{throw new Error('Injected cancelTranslationJob persistence failure')};"
  );
  await click(ctx.cdp, '#cancelBtn');
  await waitForFunction(ctx.cdp,
    "document.getElementById('processBtn').disabled === false && !document.getElementById('cancelBtn').classList.contains('show')");
  const job = await latestJob(ctx);
  check(job?.status === 'running', 'cancellation persistence failure leaves the Translation Job running and recoverable');
  check(
    await evaluate(ctx.cdp, "document.getElementById('resumeBtn').classList.contains('show')"),
    'cancellation persistence failure exposes same-session recovery control'
  );
  check(
    await evaluate(ctx.cdp, "document.getElementById('errorBox').classList.contains('show')"),
    'cancellation persistence failure surfaces a visible recovery warning'
  );
  check(
    await evaluate(ctx.cdp, "document.getElementById('errorBox').textContent.includes('บันทึกสถานะการยกเลิกไม่สำเร็จ')"),
    'cancellation persistence warning explains the durable-state failure'
  );
  check(
    await evaluate(ctx.cdp, "window.__fi.calls === 1"),
    'cancellation persistence failure does not retry or resend the provider request'
  );
  check(ctx.runtimeErrors.length === 0, 'cancellation persistence failure has no uncaught browser runtime exceptions');
  check(
    await evaluate(ctx.cdp, '!window.__fi || window.__fi.external.length === 0'),
    'cancellation persistence failure makes no unexpected external calls'
  );
  await evaluate(ctx.cdp, 'window.PrungAksornStorageV2.cancelTranslationJob=window.__origCancel');
  await ctx.cdp.send('Page.navigate', { url: ctx.url });
  await waitForFunction(ctx.cdp, "document.readyState === 'complete' && !!document.getElementById('translationRecoveryBox')", 10000);
  const recoveredJob = await latestJob(ctx);
  check(recoveredJob?.status === 'running', 'cancellation persistence failure remains recoverable after browser reload');
  check(
    await evaluate(ctx.cdp, "document.getElementById('translationRecoveryBox').textContent.includes('กู้คืน')"),
    'browser reload exposes the persistent Translation Job recovery control'
  );
}

async function scenarioDestructiveMutationGuard(ctx) {
  await createProject(ctx, 'FI Destructive Mutation Guard');
  await prepareTranslation(ctx, 'FI Guard Chapter', 'Block destructive mutation while translation is in flight');
  await installFetchFault(ctx, 'cancel');
  await click(ctx.cdp, '#processBtn');
  await waitForFunction(ctx.cdp,
    "window.__fi.pending === true && document.getElementById('cancelBtn').classList.contains('show')");
  await click(ctx.cdp, "button[title='ลบเรื่องนี้']");
  await new Promise(r => setTimeout(r, 150));
  check(
    await evaluate(ctx.cdp, "document.querySelectorAll('.project-row').length === 1"),
    'active Project remains while translation is in flight'
  );
  check(
    await evaluate(ctx.cdp, "!document.getElementById('appDialogOverlay').classList.contains('show')"),
    'Project delete confirmation is blocked while AI work is busy'
  );
  check(
    await evaluate(ctx.cdp, "document.getElementById('errorBox').classList.contains('show') && document.getElementById('errorBox').textContent.includes('กำลังมีงาน AI')"),
    'Project delete is rejected with the existing AI-busy guard message'
  );
  await click(ctx.cdp, "button[title='ลบเล่มนี้']");
  await new Promise(r => setTimeout(r, 150));
  check(
    await evaluate(ctx.cdp, "document.getElementById('appDialogOverlay').classList.contains('show') === false"),
    'Book delete confirmation is also blocked while AI work is busy'
  );
  check(
    await evaluate(ctx.cdp, "document.querySelectorAll('.project-row').length === 1"),
    'Project remains intact after blocked Project and Book delete attempts'
  );
  await click(ctx.cdp, '#cancelBtn');
  await waitForFunction(ctx.cdp,
    "document.getElementById('processBtn').disabled === false && !document.getElementById('cancelBtn').classList.contains('show')");
  const job = await latestJob(ctx);
  check(job?.status === 'cancelled', 'guard scenario can still cancel the translation normally');

  await evaluate(ctx.cdp,
    "window.__origShowConfirmDialog=window.showConfirmDialog;" +
    "window.showConfirmDialog=async function(){" +
      "window.__fi.toctouTriggered=true;" +
      "document.getElementById('processBtn').click();" +
      "await new Promise(r=>setTimeout(r,75));" +
      "return true;" +
    "};"
  );
  await click(ctx.cdp, "button[title='ลบเรื่องนี้']");
  await waitForFunction(ctx.cdp,
    "window.__fi.toctouTriggered === true && document.getElementById('cancelBtn').classList.contains('show')");
  await new Promise(r => setTimeout(r, 100));
  check(
    await evaluate(ctx.cdp, "document.querySelectorAll('.project-row').length === 1"),
    'Project remains intact when AI work starts during delete confirmation'
  );
  check(
    await evaluate(ctx.cdp, "!document.getElementById('appDialogOverlay').classList.contains('show')"),
    'Project mutation is blocked by the second AI-busy guard before commit'
  );
  await evaluate(ctx.cdp, "window.showConfirmDialog=window.__origShowConfirmDialog");
  await click(ctx.cdp, '#cancelBtn');
  await waitForFunction(ctx.cdp,
    "document.getElementById('processBtn').disabled === false && !document.getElementById('cancelBtn').classList.contains('show')");
  check(ctx.runtimeErrors.length === 0, 'destructive guard scenario has no uncaught browser runtime exceptions');
}

async function scenarioRetrySuccess(ctx) {
  await createProject(ctx, 'FI Retry Success');
  await installFetchFault(ctx, 'retry-success');
  await prepareTranslation(ctx, 'FI Retry Success Chapter', 'Failure injection retry source');
  await click(ctx.cdp, '#processBtn');
  await waitForFunction(ctx.cdp, 'window.__fi.calls >= 1');
  await waitForFunction(ctx.cdp,
    "window.__fi.calls === 3 && document.getElementById('processBtn').disabled === false", 12000);
  check(
    await evaluate(ctx.cdp, "document.getElementById('output').textContent.includes('Injected recovered translation')"),
    'HTTP 500 faults retry twice and recover on the third provider attempt'
  );  const job = await latestJob(ctx);
  check(job?.status === 'completed', 'recovered provider failure leaves Translation Job completed');
  check(
    job?.completedChunks === job?.totalChunks,
    'recovered Translation Job has complete checkpoint coverage'
  );
  check(
    await evaluate(ctx.cdp, 'window.__fi.failures === 2 && window.__fi.calls === 3'),
    'retry-success injection produced exactly two failures and three total attempts'
  );
}

async function scenarioPermanentNetwork(ctx) {
  await createProject(ctx, 'FI Permanent Network');
  await installFetchFault(ctx, 'permanent-network');  await prepareTranslation(ctx, 'FI Permanent Network Chapter', 'Permanent network failure source');
  await click(ctx.cdp, '#processBtn');
  await waitForFunction(ctx.cdp,
    "window.__fi.calls === 3 && document.getElementById('resumeBtn').classList.contains('show')", 12000);
  check(
    await evaluate(ctx.cdp, "document.getElementById('errorBox').classList.contains('show')"),
    'permanent network fault surfaces a visible translation error'
  );
  const job = await latestJob(ctx);
  check(job?.status === 'failed', 'permanent network fault persists a failed Translation Job');
  check(job?.completedChunks === 0, 'permanent network fault preserves zero completed chunks');
  check(
    await evaluate(ctx.cdp, "!document.getElementById('output').textContent.trim()"),
    'permanent network fault does not create partial output for an uncheckpointed chunk'
  );
  check(
    await evaluate(ctx.cdp, 'window.__fi.calls === 3 && window.__fi.failures === 3'),
    'permanent network fault exhausts the configured retry budget'
  );
}async function scenarioCancelInFlight(ctx) {
  await createProject(ctx, 'FI Cancel In Flight');
  await installFetchFault(ctx, 'cancel');
  await prepareTranslation(ctx, 'FI Cancel Chapter', 'Cancel while provider request is in flight');
  await click(ctx.cdp, '#processBtn');
  await waitForFunction(ctx.cdp,
    "window.__fi.pending === true && document.getElementById('cancelBtn').classList.contains('show')");
  check(
    await evaluate(ctx.cdp, 'window.__fi.calls === 1'),
    'cancel scenario has one active provider attempt before abort'
  );
  await click(ctx.cdp, '#cancelBtn');
  await waitForFunction(ctx.cdp,
    "document.getElementById('processBtn').disabled === false && !document.getElementById('resumeBtn').classList.contains('show')",
    8000);
  const job = await latestJob(ctx);
  check(job?.status === 'cancelled', 'in-flight cancellation persists a cancelled Translation Job');
  check(job?.completedChunks === 0, 'cancelled in-flight Job retains zero completed chunks');
  check(
    await evaluate(ctx.cdp, "!document.getElementById('errorBox').classList.contains('show')"),
    'user cancellation does not surface a failure error'
  );
  check(
    await evaluate(ctx.cdp, "!document.getElementById('output').textContent.trim()"),
    'cancelled in-flight Job does not create output'
  );
}

async function scenarioAutosaveTransient(ctx) {
  await createProject(ctx, 'FI Autosave Transient');
  await evaluate(ctx.cdp, '(() => {' +
    'const originalSave = window.PrungAksornStorageV2.save;' +
    'window.__fi = { saveAttempts: 0, saveFailures: 0, external: [], originalSave: originalSave };' +
    'window.PrungAksornStorageV2.save = function(app) {' +
      'window.__fi.saveAttempts += 1;' +
      'if (window.__fi.saveAttempts <= 2) {' +
        'window.__fi.saveFailures += 1;' +
        "return Promise.reject(new Error('Injected transient IndexedDB save failure'));" +
      '}' +
      'return originalSave(app);' +
    '};' +
  '})()');
  await typeInto(ctx.cdp, '#chapterTitle', 'FI Autosave Chapter');
  await typeInto(ctx.cdp, '#inputText', 'Draft before transient failure');
  await new Promise(r => setTimeout(r, 650));
  await typeInto(ctx.cdp, '#inputText', 'Draft after transient failure');
  await waitForFunction(ctx.cdp,
    "window.__fi.saveAttempts >= 3 && document.getElementById('saveStatusText').textContent.includes('บันทึกแล้ว')",
    8000);
  check(
    await evaluate(ctx.cdp, 'window.__fi.saveFailures === 2'),
    'autosave injection fails the first two save attempts'
  );
  check(
    await evaluate(ctx.cdp, 'window.__fi.saveAttempts >= 3'),
    'autosave retries after transient storage failures'
  );
  check(
    await evaluate(ctx.cdp, "!document.getElementById('errorBox').classList.contains('show')"),
    'transient autosave failure does not surface as an application error'
  );
  await ctx.cdp.send('Page.navigate', { url: ctx.url });
  await waitForFunction(ctx.cdp,
    "document.readyState === 'complete' && !!document.getElementById('inputText')", 10000);
  await waitForFunction(ctx.cdp, '!!window.PrungAksornStorageV2');
  check(
    await evaluate(ctx.cdp,
      "document.getElementById('inputText').value === 'Draft after transient failure'"),
    'newer draft content survives transient autosave failures and reload'
  );
}

const scenarios = [
  ['FI-05 Cancellation Persistence Failure', [], scenarioCancelPersistenceFailure],
  ['FI-06 Destructive Mutation Guard', [], scenarioDestructiveMutationGuard],
  ['FI-01 Provider HTTP 500 Retry → Recovery', [], scenarioRetrySuccess],
  ['FI-02 Provider Permanent Network Failure', [], scenarioPermanentNetwork],
  ['FI-03 In-Flight Cancellation', [], scenarioCancelInFlight],
  ['FI-04 Autosave Transient Storage Failure', ['IndexedDB V2 save failed:'], scenarioAutosaveTransient]
];

let failed = false;
for (const [name, allowedLogs, body] of scenarios) {
  try {
    await runScenario(name, allowedLogs, body);
  } catch (error) {
    failed = true;
    console.error('\nFAIL  ' + name + ' — ' + (error.stack || error.message || error));
  }
}
if (failed) {
  console.error('\nFailure Injection Matrix: FAIL');
  process.exitCode = 1;
} else {
  console.log('\nFailure Injection Matrix: PASS');
}
