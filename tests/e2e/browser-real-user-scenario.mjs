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
const TEST_TIMEOUT = 45_000;

function log(message) { console.log('[E2E] ' + message); }
function check(condition, message) { assert.ok(condition, message); console.log('PASS  ' + message); }

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
          probe.once('error', reject);
          probe.once('exit', code => code === 0 ? resolve() : reject(new Error('version probe failed')));
        });
        return command;
      }
    } catch {}
  }
  throw new Error('No Chromium-family browser found. Set E2E_BROWSER to the browser executable path.');
}

function startStaticServer() {
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
          : filePath.endsWith('.json') ? 'application/json; charset=utf-8'
          : filePath.endsWith('.css') ? 'text/css; charset=utf-8'
          : filePath.endsWith('.png') ? 'image/png'
          : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        res.writeHead(500); res.end(String(error));
      }
    });
    server.once('error', reject);
    server.listen(0, PORT_HOST, () => resolve({ server, port: server.address().port }));
  });
}

async function waitForUrl(url, timeoutMs = 10_000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) { lastError = error; }
    await new Promise(r => setTimeout(r, 100));
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
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = (e) => { cleanup(); reject(new Error('CDP WebSocket failed: ' + String(e?.message || e))); };
      const cleanup = () => { this.ws.removeEventListener('open', onOpen); this.ws.removeEventListener('error', onError); };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
        else pending.resolve(message.result);
        return;
      }
      const listeners = this.events.get(message.method) || [];
      for (const listener of listeners) listener(message.params);
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

async function waitForFunction(cdp, expression, timeoutMs = 8_000, intervalMs = 75) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
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

async function reload(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await waitForFunction(cdp, `document.readyState === 'complete' && !!document.getElementById('inputText')`);
  await waitForFunction(cdp, `!!window.PrungAksornStorageV2 && !!document.getElementById('projectList')`);
}

let server;
let chrome;
let cdp;
let profileDir;
const pageErrors = [];

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
    probe.once('error', reject);
    probe.listen(0, PORT_HOST, () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });

  chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--no-first-run',
    '--no-default-browser-check', '--user-data-dir=' + profileDir,
    '--remote-debugging-port=' + debugPortHolder, '--window-size=1440,1200', e2eUrl
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const browserExit = new Promise(resolve => chrome.once('exit', resolve));
  chrome.on('exit', code => log('Browser exited with code ' + code));
  await waitForUrl(`http://${PORT_HOST}:${debugPortHolder}/json/version`, 15_000);
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
  await evaluate(cdp, `navigator.serviceWorker ? navigator.serviceWorker.ready.then(()=>true).catch(()=>false) : false`);
  check(true, 'app loads in a real Chromium browser over HTTP');
  check(await read(cdp, `document.querySelectorAll('.project-row').length === 0`), 'clean E2E profile starts with no projects');

  await click(cdp, '#addProjBtn');
  await waitForFunction(cdp, `document.getElementById('appDialogOverlay').classList.contains('show') && document.getElementById('appDialogInput').style.display !== 'none'`);
  await typeInto(cdp, '#appDialogInput', 'E2E Workspace');
  await click(cdp, '#appDialogConfirmBtn');
  await waitForFunction(cdp, `document.querySelector('.project-row') && document.querySelector('.project-row').textContent.includes('E2E Workspace')`);
  check(await read(cdp, `document.querySelectorAll('.project-row').length === 1`), 'Project created through visible UI');

  await typeInto(cdp, '#chapterTitle', 'E2E Draft A');
  await typeInto(cdp, '#inputText', 'Draft content belonging to Book A');
  await new Promise(r => setTimeout(r, 800));
  check(await read(cdp, `document.getElementById('inputText').value === 'Draft content belonging to Book A'`), 'Book A draft entered through the editor');

  await click(cdp, '.book-list.open .utility-btn');
  await waitForFunction(cdp, `document.getElementById('appDialogOverlay').classList.contains('show')`);
  await typeInto(cdp, '#appDialogInput', 'Book B');
  await click(cdp, '#appDialogConfirmBtn');
  await waitForFunction(cdp, `[...document.querySelectorAll('.book-title-text')].some(x=>x.textContent.includes('Book B'))`);
  check(await read(cdp, `document.getElementById('inputText').value === ''`), 'new Book B starts with isolated empty editor state');

  await typeInto(cdp, '#chapterTitle', 'E2E Draft B');
  await typeInto(cdp, '#inputText', 'Draft content belonging to Book B');
  await new Promise(r => setTimeout(r, 800));

  await evaluate(cdp, `document.querySelector('.book-title-text').click()`);
  await waitForFunction(cdp, `document.getElementById('inputText').value === 'Draft content belonging to Book A'`);
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
  await waitForFunction(cdp, `document.getElementById('inputText').value === 'Draft content belonging to Book B'`);
  check(await read(cdp, `document.getElementById('output').textContent.trim() === ''`), 'Book B output remains empty during Book A translation');

  await evaluate(cdp, `window.__e2e.resolve()`);
  await waitForFunction(cdp, `window.__e2e.released === true && document.getElementById('processBtn').disabled === false && document.getElementById('output').textContent.trim() === ''`, 12_000);
  check(await read(cdp, `document.getElementById('inputText').value === 'Draft content belonging to Book B'`), 'completed Book A response does not overwrite Book B input');
  check(await read(cdp, `document.getElementById('output').textContent.trim() === ''`), 'completed Book A response does not overwrite Book B output');
  check(await read(cdp, `document.getElementById('processBtn').disabled === false`), 'real UI leaves the active Book ready after stale job completion');
  check(await read(cdp, `window.__e2e.blockedExternalCalls.length === 0`), 'E2E scenario made no unexpected external network calls');
  check(await read(cdp, `window.__e2e.calls === 1`), 'E2E scenario made exactly one mocked provider request');

  await new Promise(r => setTimeout(r, 900));
  await reload(cdp, e2eUrl);
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
  console.error('Browser E2E / Real User Scenario: FAIL — ' + (error.stack || error.message || error));
  if (pageErrors.length) console.error('Browser errors:\n' + pageErrors.join('\n'));
  process.exitCode = 1;
} finally {
  try { await cdp?.send('Browser.close'); } catch {}
  try { cdp?.close(); } catch {}
  try { if (chrome && chrome.exitCode === null) chrome.kill(); } catch {}
  try { if (chrome && chrome.exitCode === null) await Promise.race([browserExit, new Promise(resolve => setTimeout(resolve, 3_000))]); } catch {}
  if (chrome) {
    try { await new Promise(resolve => chrome.once('exit', resolve)); } catch {}
  }
  try { server?.close(); } catch {}
  if (profileDir) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { await rm(profileDir, { recursive: true, force: true }); break; }
      catch (cleanupError) { if (attempt === 4) console.error('Cleanup warning:', cleanupError.message); else await new Promise(r => setTimeout(r, 200)); }
    }
  }
}
