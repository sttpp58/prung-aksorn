#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const HOST = '127.0.0.1';

function pass(message) { console.log('PASS  ' + message); }
function check(condition, message) { assert.ok(condition, message); pass(message); }

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
      await new Promise((resolve, reject) => {
        probe.once('error', reject);
        probe.once('exit', code => code === 0 ? resolve() : reject(new Error('version probe failed')));
      });
      return command;
    } catch {}
  }
  throw new Error('No Chromium-family browser found. Set E2E_BROWSER to a browser executable path.');
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const rawUrl = decodeURIComponent((req.url || '/').split('?')[0]);
        if (rawUrl === '/favicon.ico') { res.writeHead(204); res.end(); return; }
        const requestPath = rawUrl === '/' ? '/index.html' : rawUrl;
        const root = path.resolve(ROOT);
        const filePath = path.resolve(ROOT, '.' + path.normalize(requestPath));
        if (!filePath.startsWith(root + path.sep)) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404); res.end('Not found'); return;
        }
        const contentType = filePath.endsWith('.html') ? 'text/html; charset=utf-8'
          : filePath.endsWith('.js') || filePath.endsWith('.mjs') ? 'text/javascript; charset=utf-8'
          : filePath.endsWith('.json') ? 'application/json; charset=utf-8'
          : filePath.endsWith('.css') ? 'text/css; charset=utf-8'
          : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        res.writeHead(500); res.end(String(error));
      }
    });
    server.once('error', reject);
    server.listen(0, HOST, () => resolve({ server, port: server.address().port }));
  });
}

async function waitForUrl(url, timeoutMs = 10000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      lastError = new Error('HTTP ' + res.status);
    } catch (error) { lastError = error; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Timed out waiting for ' + url + ': ' + (lastError?.message || 'unknown error'));
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.events = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = e => { cleanup(); reject(new Error('CDP WebSocket failed: ' + String(e?.message || e))); };
      const cleanup = () => {
        this.ws.removeEventListener('open', onOpen);
        this.ws.removeEventListener('error', onError);
      };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error('CDP ' + message.error.code + ': ' + message.error.message));
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
    list.push(listener);
    this.events.set(method, list);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result?.value;
}

async function waitForFunction(cdp, expression, timeoutMs = 10000, intervalMs = 75) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await evaluate(cdp, expression);
    if (last === true) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Timeout waiting for condition: ' + expression + ' (last=' + JSON.stringify(last) + ')');
}

async function click(cdp, selector) {
  const ok = await evaluate(cdp, '(() => { const el=document.querySelector(' + JSON.stringify(selector) + '); if(!el)return false; el.click(); return true; })()');
  check(ok, 'click target exists: ' + selector);
}

async function clickText(cdp, selector, text) {
  const ok = await evaluate(cdp, '(() => { const el=[...document.querySelectorAll(' + JSON.stringify(selector) + ')].find(x=>x.textContent.includes(' + JSON.stringify(text) + ')); if(!el)return false; el.click(); return true; })()');
  check(ok, 'click visible control containing "' + text + '"');
}

async function typeInto(cdp, selector, value) {
  const type = await evaluate(cdp, '(() => { const el=document.querySelector(' + JSON.stringify(selector) + '); return el ? (el.type || el.tagName.toLowerCase()) : null; })()');
  const ready = await evaluate(cdp, '(() => { const el=document.querySelector(' + JSON.stringify(selector) + '); if(!el)return false; el.focus(); if("value" in el){ el.value=""; el.dispatchEvent(new Event("input",{bubbles:true})); } return true; })()');
  check(ready, 'input target exists: ' + selector);
  if (type === 'password') {
    const set = await evaluate(cdp, '(() => { const el=document.querySelector(' + JSON.stringify(selector) + '); if(!el)return false; el.value=' + JSON.stringify(value) + '; el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true})); return el.value === ' + JSON.stringify(value) + '; })()');
    check(set, 'test credential field accepts browser-side value');
    return;
  }
  await cdp.send('Input.insertText', { text: value });
}

async function setupBrowser() {
  const browser = await findBrowser();
  const started = await startStaticServer();
  const url = 'http://' + HOST + ':' + started.port + '/index.html';
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'prung-aksorn-backup-e2e-'));
  const downloadDir = await mkdtemp(path.join(os.tmpdir(), 'prung-aksorn-backup-download-'));
  const debugPort = await new Promise((resolve, reject) => {
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
    '--window-size=1440,1200',
    url
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const browserExit = new Promise(resolve => chrome.once('exit', resolve));
  const targets = await waitForUrl('http://' + HOST + ':' + debugPort + '/json', 15000);
  const pageTarget = Array.isArray(targets) ? targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl) : null;
  if (!pageTarget) throw new Error('No browser page target available for CDP.');
  const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  try { await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }); } catch {}
  const pageErrors = [];
  cdp.on('Runtime.exceptionThrown', params => {
    const detail = params?.exceptionDetails;
    pageErrors.push(detail?.exception?.description || detail?.text || 'unknown exception');
  });
  cdp.on('Log.entryAdded', params => {
    if (params.entry?.level === 'error') pageErrors.push(params.entry.text || 'browser log error');
  });
  await waitForFunction(cdp, "document.readyState === 'complete' && !!document.getElementById('addProjBtn')", 15000);
  await waitForFunction(cdp, '!!window.PrungAksornStorageV2', 15000);
  await evaluate(cdp, "navigator.serviceWorker ? navigator.serviceWorker.ready.then(()=>true).catch(()=>false) : false");
  check(await evaluate(cdp, "document.querySelectorAll('.project-row').length === 0"), 'clean backup-validation profile starts empty');
  return { browser, url, server: started.server, chrome, browserExit, cdp, profileDir, downloadDir, pageErrors };
}

async function cleanupBrowser(ctx) {
  try { await ctx.cdp?.send('Browser.close'); } catch {}
  try { ctx.cdp?.close(); } catch {}
  try { if (ctx.chrome && ctx.chrome.exitCode === null) ctx.chrome.kill(); } catch {}
  try { await Promise.race([ctx.browserExit, new Promise(resolve => setTimeout(resolve, 3000))]); } catch {}
  try { ctx.server?.close(); } catch {}
  try { await rm(ctx.profileDir, { recursive: true, force: true }); } catch {}
  try { await rm(ctx.downloadDir, { recursive: true, force: true }); } catch {}
}

async function createProject(cdp, name, expectedCount = 1) {
  await click(cdp, '#addProjBtn');
  await waitForFunction(cdp, "document.getElementById('appDialogOverlay').classList.contains('show')");
  await typeInto(cdp, '#appDialogInput', name);
  await click(cdp, '#appDialogConfirmBtn');
  await waitForFunction(cdp, "[...document.querySelectorAll('.project-row')].some(x=>x.textContent.includes(" + JSON.stringify(name) + "))");
  check(await evaluate(cdp, "document.querySelectorAll('.project-row').length === " + expectedCount), 'expected Project count after UI creation: ' + expectedCount);
}

async function ensureProjectExpanded(cdp, projectName) {
  const open = await evaluate(cdp, "!!document.querySelector('.book-list.open')");
  if (!open) await clickText(cdp, '.project-row', projectName);
  await waitForFunction(cdp, "document.querySelector('.book-list.open') && [...document.querySelectorAll('.book-title-text')].length >= 1");
}

async function createBook(cdp, name) {
  await click(cdp, '.book-list.open .utility-btn');
  await waitForFunction(cdp, "document.getElementById('appDialogOverlay').classList.contains('show')");
  await typeInto(cdp, '#appDialogInput', name);
  await click(cdp, '#appDialogConfirmBtn');
  await waitForFunction(cdp, "[...document.querySelectorAll('.book-title-text')].some(x=>x.textContent.includes(" + JSON.stringify(name) + "))");
}

async function importFileIntoUi(cdp, rawText, filename) {
  const injected = await evaluate(cdp, "(() => { const text=" + JSON.stringify(rawText) + "; const input=document.getElementById('backupFile'); const file=new File([text]," + JSON.stringify(filename) + ",{type:'application/json'}); const dt=new DataTransfer(); dt.items.add(file); input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true})); return true; })()");
  check(injected, 'backup file supplied through the real file-input boundary');
}

async function confirmDialog(cdp, expectedTitle, waitAfter = 150) {
  await waitForFunction(cdp, "document.getElementById('appDialogOverlay').classList.contains('show') && document.getElementById('appDialogTitle').textContent.includes(" + JSON.stringify(expectedTitle) + ")");
  await click(cdp, '#appDialogConfirmBtn');
  await new Promise(r => setTimeout(r, waitAfter));
}

async function waitForDownloadedJson(dir, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const files = fs.readdirSync(dir).filter(name => name.endsWith('.json') && !name.endsWith('.crdownload'));
    if (files.length) return path.join(dir, files[0]);
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Timed out waiting for downloaded Backup JSON artifact.');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function verifyBackupArtifact(rawText, expectedProjectName) {
  const payload = JSON.parse(rawText);
  check(payload.format === 'prung-aksorn-backup', 'downloaded artifact has Backup V2 format marker');
  check(Number(payload.formatVersion) === 2 && Number(payload.schemaVersion) === 2, 'downloaded artifact declares supported V2/schema 2');
  check(payload.integrity?.algorithm === 'SHA-256' && /^[0-9a-f]{64}$/.test(payload.integrity?.checksum || ''), 'downloaded artifact carries a valid SHA-256 checksum');
  const withoutIntegrity = {
    format: payload.format,
    formatVersion: payload.formatVersion,
    schemaVersion: payload.schemaVersion,
    appVersion: payload.appVersion,
    createdAt: payload.createdAt,
    data: payload.data
  };
  check(sha256(withoutIntegrity) === payload.integrity.checksum, 'downloaded artifact checksum matches an independent Node.js calculation');
  check(Array.isArray(payload.data?.projects) && payload.data.projects.some(p => p.name === expectedProjectName), 'downloaded artifact contains the real project state');
  check(Array.isArray(payload.data?.books) && payload.data.books.length >= 2, 'downloaded artifact contains both real Books');
  check(Array.isArray(payload.data?.translationJobs) && payload.data.translationJobs.some(j => j.status === 'completed'), 'downloaded artifact contains a completed Translation Job');
  const serialized = JSON.stringify(payload);
  check(!serialized.includes('e2e-only-test-key'), 'downloaded artifact excludes the browser-only API credential');
  check(!serialized.includes('apiKey'), 'downloaded artifact does not persist an apiKey field');
  return payload;
}

async function setupRealisticState(ctx) {
  const cdp = ctx.cdp;
  await createProject(cdp, 'Backup Validation Workspace');
  await typeInto(cdp, '#chapterTitle', 'Book A Draft');
  await typeInto(cdp, '#inputText', 'Book A persistent draft before backup');
  await new Promise(r => setTimeout(r, 800));
  await createBook(cdp, 'Book B');
  await typeInto(cdp, '#chapterTitle', 'Book B Draft');
  await typeInto(cdp, '#inputText', 'Book B persistent draft before backup');
  await new Promise(r => setTimeout(r, 800));
  await click(cdp, '.book-title-text');
  await waitForFunction(cdp, "document.getElementById('inputText').value === 'Book A persistent draft before backup'");

  await evaluate(cdp, "(() => { const originalFetch=window.fetch.bind(window); window.__backupE2E={calls:0,pending:false,resolve:null,external:[]}; window.fetch=function(url,options){ const target=String(url); if(target.includes('api.openai.com/v1/chat/completions')){ window.__backupE2E.calls += 1; window.__backupE2E.pending=true; return new Promise(resolve => { window.__backupE2E.resolve=()=>{ window.__backupE2E.pending=false; resolve(new Response(JSON.stringify({choices:[{message:{content:'Backup round-trip translated result'}}],usage:{prompt_tokens:2,completion_tokens:2}}),{status:200,headers:{'Content-Type':'application/json'}})); }; }); } if(/^https?:/i.test(target) && !target.startsWith(window.location.origin)){ window.__backupE2E.external.push(target); return Promise.reject(new Error('Unexpected external network call blocked by backup validation harness')); } return originalFetch(url,options); }; })()");
  await typeInto(cdp, '#apiKey', 'e2e-only-test-key');
  await typeInto(cdp, '#chapterTitle', 'Backup Translation A');
  await typeInto(cdp, '#inputText', 'Source for the backup round-trip translation');
  await click(cdp, '#processBtn');
  await waitForFunction(cdp, "window.__backupE2E.pending === true && window.__backupE2E.calls === 1", 8000);
  check(await evaluate(cdp, "document.getElementById('cancelBtn').classList.contains('show')"), 'translation reaches the live in-flight UI boundary before backup validation');
  await clickText(cdp, '.book-title-text', 'Book B');
  await evaluate(cdp, "window.__backupE2E.resolve()");
  await waitForFunction(cdp, "document.getElementById('processBtn').disabled === false && window.__backupE2E.pending === false", 12000);
  check(await evaluate(cdp, "document.getElementById('inputText').value === 'Book B persistent draft before backup'"), 'Book B draft remains isolated while Book A translation completes');
  check(await evaluate(cdp, "window.__backupE2E.external.length === 0"), 'real-world backup scenario made no unexpected external calls');
}

async function exportBackupFromUi(ctx) {
  await click(ctx.cdp, '#exportBackupBtn');
  const filePath = await waitForDownloadedJson(ctx.downloadDir, 12000);
  check(fs.statSync(filePath).size > 100, 'Backup UI produced a non-empty downloadable JSON artifact');
  const raw = fs.readFileSync(filePath, 'utf8');
  check(raw.includes('Backup Validation Workspace'), 'downloaded artifact is the file created by the real Backup UI path');
  return { filePath, raw, payload: verifyBackupArtifact(raw, 'Backup Validation Workspace') };
}

async function scenarioRoundTrip() {
  console.log('\n=== BR-01 Export + Full Restore Round-trip ===');
  const ctx = await setupBrowser();
  try {
    await setupRealisticState(ctx);
    const backup = await exportBackupFromUi(ctx);
    await createProject(ctx.cdp, 'Mutation Project Before Restore', 2);
    check(await evaluate(ctx.cdp, "document.querySelectorAll('.project-row').length === 2"), 'mutated state exists before restore');
    await importFileIntoUi(ctx.cdp, backup.raw, path.basename(backup.filePath));
    await confirmDialog(ctx.cdp, 'ยืนยันการกู้คืนข้อมูล', 500);
    await waitForFunction(ctx.cdp, "document.getElementById('appDialogOverlay').classList.contains('show') && document.getElementById('appDialogTitle').textContent.includes('กู้คืนสำเร็จ')", 10000);
    await click(ctx.cdp, '#appDialogConfirmBtn');
    await waitForFunction(ctx.cdp, "document.querySelectorAll('.project-row').length === 1", 10000);
    check(await evaluate(ctx.cdp, "document.querySelector('.project-row')?.textContent.includes('Backup Validation Workspace')"), 'restore replaces the mutated project state');
    await ensureProjectExpanded(ctx.cdp, 'Backup Validation Workspace');
    await waitForFunction(ctx.cdp, "[...document.querySelectorAll('.book-title-text')].some(x=>x.textContent.includes('Book B'))");
    await clickText(ctx.cdp, '.book-title-text', 'Book B');
    await waitForFunction(ctx.cdp, "document.getElementById('inputText').value === 'Book B persistent draft before backup'", 8000);
    check(await evaluate(ctx.cdp, "document.getElementById('chapterTitle').value === 'Book B Draft'"), 'restored Book B draft title survives round-trip');
    await click(ctx.cdp, '.book-title-text');
    await waitForFunction(ctx.cdp, "[...document.querySelectorAll('.history-entry')].some(x=>x.textContent.includes('Backup Translation A'))", 10000);
    await clickText(ctx.cdp, '.history-entry', 'Backup Translation A');
    await waitForFunction(ctx.cdp, "document.getElementById('output').textContent.includes('Backup round-trip translated result')", 8000);
    check(await evaluate(ctx.cdp, "document.getElementById('output').textContent.includes('Backup round-trip translated result')"), 'restored translated result remains accessible through visible history UI');
    check(await evaluate(ctx.cdp, "(async()=>{const jobs=await window.PrungAksornStorageV2.listTranslationJobs(); return jobs.some(j=>j.status==='completed' && j.bookId && j.chapterId);})()"), 'restored Translation Job remains queryable after round-trip');
    check(ctx.pageErrors.length === 0, 'round-trip has no uncaught browser/runtime errors');
    pass('BR-01 Export + Full Restore Round-trip — PASS');
  } finally {
    await cleanupBrowser(ctx);
  }
}

async function scenarioCorruption() {
  console.log('\n=== BR-02 Corrupted Backup Fail-Closed ===');
  const ctx = await setupBrowser();
  try {
    await setupRealisticState(ctx);
    const backup = await exportBackupFromUi(ctx);
    const corrupt = JSON.parse(backup.raw);
    corrupt.data.projects[0].name = 'Tampered Backup Name';
    const corruptText = JSON.stringify(corrupt, null, 2);
    await createProject(ctx.cdp, 'Mutation Project Kept After Rejection', 2);
    check(await evaluate(ctx.cdp, "document.querySelectorAll('.project-row').length === 2"), 'mutation state exists before corrupted restore attempt');
    await importFileIntoUi(ctx.cdp, corruptText, 'tampered-backup.json');
    await waitForFunction(ctx.cdp, "document.getElementById('appDialogOverlay').classList.contains('show') && document.getElementById('appDialogTitle').textContent.includes('ไฟล์สำรองไม่ถูกต้อง')", 10000);
    check(await evaluate(ctx.cdp, "document.getElementById('appDialogMessage').textContent.includes('checksum')"), 'corrupted backup fails on integrity verification before restore');
    await click(ctx.cdp, '#appDialogConfirmBtn');
    await waitForFunction(ctx.cdp, "document.querySelectorAll('.project-row').length === 2", 8000);
    check(await evaluate(ctx.cdp, "document.querySelectorAll('.project-row')[0].textContent.includes('Backup Validation Workspace') || document.querySelectorAll('.project-row')[1].textContent.includes('Backup Validation Workspace')"), 'original state remains present after rejected corrupted restore');
    check(await evaluate(ctx.cdp, "document.querySelectorAll('.project-row')[0].textContent.includes('Mutation Project Kept After Rejection') || document.querySelectorAll('.project-row')[1].textContent.includes('Mutation Project Kept After Rejection')"), 'current mutation remains untouched after rejected corrupted restore');
    check(ctx.pageErrors.length === 0, 'corrupted backup rejection has no uncaught browser/runtime errors');
    pass('BR-02 Corrupted Backup Fail-Closed — PASS');
  } finally {
    await cleanupBrowser(ctx);
  }
}

async function scenarioRepeatedRestore() {
  console.log('\n=== BR-03 Repeated Restore + Reload ===');
  const ctx = await setupBrowser();
  try {
    await setupRealisticState(ctx);
    const backup = await exportBackupFromUi(ctx);
    await createProject(ctx.cdp, 'Transient Mutation A', 2);
    await importFileIntoUi(ctx.cdp, backup.raw, 'round-one-backup.json');
    await confirmDialog(ctx.cdp, 'ยืนยันการกู้คืนข้อมูล', 400);
    await waitForFunction(ctx.cdp, "document.getElementById('appDialogOverlay').classList.contains('show') && document.getElementById('appDialogTitle').textContent.includes('กู้คืนสำเร็จ')", 10000);
    await click(ctx.cdp, '#appDialogConfirmBtn');
    await waitForFunction(ctx.cdp, "document.querySelectorAll('.project-row').length === 1", 10000);
    await createProject(ctx.cdp, 'Transient Mutation B', 2);
    await importFileIntoUi(ctx.cdp, backup.raw, 'round-two-backup.json');
    await confirmDialog(ctx.cdp, 'ยืนยันการกู้คืนข้อมูล', 400);
    await waitForFunction(ctx.cdp, "document.getElementById('appDialogOverlay').classList.contains('show') && document.getElementById('appDialogTitle').textContent.includes('กู้คืนสำเร็จ')", 10000);
    await click(ctx.cdp, '#appDialogConfirmBtn');
    await waitForFunction(ctx.cdp, "document.querySelectorAll('.project-row').length === 1", 10000);
    check(await evaluate(ctx.cdp, "document.querySelector('.project-row')?.textContent.includes('Backup Validation Workspace')"), 'second restore is idempotent against a new mutation state');
    await ctx.cdp.send('Page.navigate', { url: ctx.url });
    await waitForFunction(ctx.cdp, "document.readyState === 'complete' && !!document.getElementById('inputText')", 10000);
    await waitForFunction(ctx.cdp, '!!window.PrungAksornStorageV2', 10000);
    await ensureProjectExpanded(ctx.cdp, 'Backup Validation Workspace');
    await waitForFunction(ctx.cdp, "document.querySelectorAll('.book-title-text').length >= 2", 10000);
    await clickText(ctx.cdp, '.book-title-text', 'Book B');
    await waitForFunction(ctx.cdp, "document.getElementById('inputText').value === 'Book B persistent draft before backup'", 8000);
    check(await evaluate(ctx.cdp, "document.getElementById('chapterTitle').value === 'Book B Draft'"), 'repeated restore state survives a real browser reload');
    check(ctx.pageErrors.length === 0, 'repeated restore and reload have no uncaught browser/runtime errors');
    pass('BR-03 Repeated Restore + Reload — PASS');
  } finally {
    await cleanupBrowser(ctx);
  }
}

const scenarios = [
  scenarioRoundTrip,
  scenarioCorruption,
  scenarioRepeatedRestore
];

let failed = false;
for (const scenario of scenarios) {
  try {
    await scenario();
  } catch (error) {
    failed = true;
    console.error('\nFAIL  ' + (error.stack || error.message || error));
  }
}
if (failed) {
  console.error('\nBackup / Restore Real-world Validation: FAIL');
  process.exitCode = 1;
} else {
  console.log('\nBackup / Restore Real-world Validation: PASS');
}
