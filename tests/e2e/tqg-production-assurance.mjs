#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  asApplicationFailure,
  asEnvironmentFailure,
  connectCdpWithDiagnostics,
  enableCdpDomainsWithDiagnostics,
  formatHarnessFailure,
  waitForDevToolsTargets
} from './harness-diagnostics.mjs';

const ROOT = process.cwd();
const HOST = '127.0.0.1';
const TIMEOUT = 12_000;

function pass(message) { console.log('PASS  ' + message); }
function check(condition, message) { assert.ok(condition, message); pass(message); }

async function findBrowser() {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  throw asEnvironmentFailure(new Error('No Chromium-family browser found.'), 'browser_discovery');
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const requestPath = decodeURIComponent((req.url || '/').split('?')[0]) || '/';
        if (requestPath === '/favicon.ico') {
          res.writeHead(204); res.end(); return;
        }
        const normalized = path.normalize(requestPath === '/' ? '/index.html' : requestPath)
          .replace(/^([.][.][\\/])+/, '');
        const filePath = path.resolve(ROOT, '.' + normalized);
        if (!filePath.startsWith(path.resolve(ROOT) + path.sep)) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404); res.end('Not found'); return;
        }
        const type = filePath.endsWith('.html') ? 'text/html; charset=utf-8'
          : filePath.endsWith('.js') ? 'text/javascript; charset=utf-8'
          : filePath.endsWith('.json') ? 'application/json' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        fs.createReadStream(filePath).pipe(res);
      } catch (error) { res.writeHead(500); res.end(String(error)); }
    });
    server.once('error', reject);
    server.listen(0, HOST, () => resolve({ server, port: server.address().port }));
  });
}
async function waitJson(url) {
  const started = Date.now();
  while (Date.now() - started < TIMEOUT) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for ' + url);
}

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = error => { cleanup(); reject(error); };
      const cleanup = () => {
        this.ws.removeEventListener('open', onOpen);
        this.ws.removeEventListener('error', onError);
      };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const item = this.pending.get(message.id);
      if (!item) return;
      this.pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws?.close(); } catch {} }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result?.value;
}

async function waitFor(cdp, expression, timeout = TIMEOUT) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(cdp, expression)) return;
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  throw new Error('Timed out: ' + expression);
}
async function click(cdp, selector) {
  const expression = '(()=>{const el=document.querySelector(' + JSON.stringify(selector) +
    ');if(!el)return false;el.click();return true;})()';
  check(await evaluate(cdp, expression), 'click target exists: ' + selector);
}

async function setInput(cdp, selector, value) {
  const expression = '(()=>{const el=document.querySelector(' + JSON.stringify(selector) +
    ');if(!el)return false;el.focus();el.value=' + JSON.stringify(value) +
    ';el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));return true;})()';
  check(await evaluate(cdp, expression), 'input target exists: ' + selector);
}

async function waitOutput(cdp, expected) {
  await waitFor(cdp,
    'document.getElementById("processBtn").disabled === false && ' +
    'document.getElementById("output").textContent.includes(' + JSON.stringify(expected) + ')',
    15_000);
}

let server;
let chrome;
let cdp;
let profileDir;
let environmentSetup = true;
const pageErrors = [];

try {
  const browser = await findBrowser();
  const started = await startServer();
  server = started.server;
  const baseUrl = 'http://' + HOST + ':' + started.port;
  const appUrl = baseUrl + '/index.html';
  const debugPort = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
  profileDir = await mkdtemp(path.join(os.tmpdir(), 'prung-aksorn-tqg3-'));
  environmentSetup = false;
  chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--no-first-run',
    '--no-default-browser-check', '--user-data-dir=' + profileDir,
    '--remote-debugging-address=' + HOST,
    '--remote-debugging-port=' + debugPort, '--window-size=1440,1200', appUrl
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

  let browserStdErr = '';
  let browserSpawnError = null;
  chrome.on('error', error => { browserSpawnError = error; });
  chrome.stderr.on('data', chunk => { browserStdErr += String(chunk); });
  const { pageTarget } = await waitForDevToolsTargets({
    host: HOST,
    port: debugPort,
    browserProcess: chrome,
    getStderr: () => browserStdErr,
    getSpawnError: () => browserSpawnError
  });
  cdp = new Cdp(pageTarget.webSocketDebuggerUrl);
  await connectCdpWithDiagnostics(() => cdp.connect(), { port: debugPort, stderr: browserStdErr.slice(-4000) });
  await enableCdpDomainsWithDiagnostics(cdp, ['Page.enable', 'Runtime.enable', 'Log.enable'], { port: debugPort, stderr: browserStdErr.slice(-4000) });
  cdp.ws.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params?.exceptionDetails;
      pageErrors.push(detail?.exception?.description || detail?.text || 'unknown exception');
    }
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
      pageErrors.push(message.params.entry.text || 'browser log error');
    }
  });

  await waitFor(cdp, 'document.readyState === "complete" && !!document.getElementById("addProjBtn")', 15_000);
  check(await evaluate(cdp, '!!window.TQG && !!window.TQGIntegration && !!window.TQGQualityUI'),
    'browser loads the complete TQG runtime surface');
  check(await evaluate(cdp, 'document.getElementById("tqgQualityPanel").hidden === true'),
    'TQG quality panel starts hidden before completion');

  await click(cdp, '#addProjBtn');
  await waitFor(cdp, 'document.getElementById("appDialogOverlay").classList.contains("show")');
  await setInput(cdp, '#appDialogInput', 'TQG Work 3');
  await click(cdp, '#appDialogConfirmBtn');
  await waitFor(cdp,
    'document.querySelector(".project-row") && ' +
    'document.querySelector(".project-row").textContent.includes("TQG Work 3")');
  await setInput(cdp, '#apiKey', 'tqg-work3-test-key');
  await setInput(cdp, '#chapterTitle', 'TQG Assurance Clean');
  await setInput(cdp, '#inputText', 'Clean source for TQG production assurance.');

  await evaluate(cdp, 'window.__tqg3={mode:"clean",calls:0,pending:false,resolve:null,blockedExternal:[]};' +
    '(()=>{const originalFetch=window.fetch.bind(window);window.fetch=(url,options)=>{' +
    'const target=String(url);' +
    'if(target.includes("api.openai.com/v1/chat/completions")){' +
    'window.__tqg3.calls++;' +
    'if(window.__tqg3.mode==="pending")return new Promise(resolve=>{window.__tqg3.pending=true;' +
    'window.__tqg3.resolve=()=>{window.__tqg3.pending=false;resolve(new Response(JSON.stringify({' +
    'choices:[{message:{content:"นี่คือผลลัพธ์ภาษาไทยสำหรับการทดสอบ"}}],usage:{prompt_tokens:1,completion_tokens:1}}),' +
    '{status:200,headers:{"Content-Type":"application/json"}}));};});' +
    'const content=window.__tqg3.mode==="suspicious" ? document.getElementById("inputText").value :' +
    '"นี่คือผลลัพธ์ภาษาไทยสำหรับการทดสอบ";' +
    'return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content}}],usage:{prompt_tokens:1,completion_tokens:1}}),' +
    '{status:200,headers:{"Content-Type":"application/json"}}));}' +
    'if(/^https?:/i.test(target)&&!target.startsWith(window.location.origin)){' +
    'window.__tqg3.blockedExternal.push(target);return Promise.reject(new Error("blocked external call"));}' +
    'return originalFetch(url,options);};})()');

  await click(cdp, '#processBtn');
  await waitOutput(cdp, 'นี่คือผลลัพธ์ภาษาไทย');
  check(await evaluate(cdp, 'window.__tqg3.calls === 1'),
    'clean translation uses exactly one mocked provider request');
  check(await evaluate(cdp, 'document.getElementById("tqgQualityPanel").hidden === true'),
    'TQG result remains non-intrusive and collapsed after completion');

  await click(cdp, '#tqgQualityToggleBtn');
  check(await evaluate(cdp, '!!document.querySelector("#tqgQualityPanel .tqg-badge.pass")'),
    'completed clean output is shown as TQG PASS');
  check(await evaluate(cdp, '!document.querySelector("#tqgQualityPanel .tqg-finding-code")'),
    'TQG PASS output has no active finding in the browser UI');
  await click(cdp, '#tqgQualityToggleBtn');
  check(await evaluate(cdp, 'window.__tqg3.calls === 1'),
    'TQG PASS path adds zero AI/provider calls');
  await setInput(cdp, '#chapterTitle', 'TQG Assurance Incomplete');
  await setInput(cdp, '#inputText', 'Incomplete output must not enter TQG.');
  await evaluate(cdp, 'window.__tqg3.mode="pending";window.__tqg3.pending=false;window.__tqg3.resolve=null;');
  await click(cdp, '#processBtn');
  await waitFor(cdp, 'window.__tqg3.pending === true && window.__tqg3.calls === 2');
  check(await evaluate(cdp, 'document.getElementById("tqgQualityPanel").hidden === true'),
    'in-flight incomplete translation does not expose a TQG result');
  await evaluate(cdp, 'window.__tqg3.resolve()');
  await waitOutput(cdp, 'นี่คือผลลัพธ์ภาษาไทย');
  check(await evaluate(cdp, 'window.__tqg3.calls === 2'),
    'completion-boundary test uses one provider attempt for the pending translation');

  await setInput(cdp, '#chapterTitle', 'TQG Assurance Suspicious');
  await setInput(cdp, '#inputText', 'This source remains untranslated in TQG.');
  await evaluate(cdp, 'window.__tqg3.mode="suspicious"');
  await click(cdp, '#processBtn');
  await waitOutput(cdp, 'This source remains untranslated in TQG.');
  check(await evaluate(cdp, 'window.__tqg3.calls === 3'),
    'suspicious translation uses the mocked provider exactly once');
  await click(cdp, '#tqgQualityToggleBtn');
  check(await evaluate(cdp, '!!document.querySelector("#tqgQualityPanel .tqg-badge.high")'),
    'source-copy anomaly reaches HIGH_SUSPICION in the browser UI');
  check(await evaluate(cdp,
    '[...document.querySelectorAll("#tqgQualityPanel .tqg-finding-code")].some(x=>x.textContent==="SOURCE_LANGUAGE_RESIDUE")'),
    'browser UI exposes SOURCE_LANGUAGE_RESIDUE evidence');
  await click(cdp, '#tqgQualityToggleBtn');

  const benchmark = await evaluate(cdp,
    '(()=>{const input={sourceText:"A short source chapter for benchmark.",' +
    'targetText:"นี่คือบทภาษาไทยสั้น ๆ สำหรับ benchmark",glossaryText:""};const times=[];' +
    'for(let i=0;i<200;i++){const start=performance.now();const result=window.TQG.analyze(input);' +
    'if(result.meta.aiCalls!==0||result.meta.networkAccess!==false)return {error:"non-deterministic benchmark path"};' +
    'times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {p50:times[99],p95:times[189],p99:times[197],max:times[199]};})()');
  if (benchmark?.error) throw new Error(benchmark.error);
  console.log('Browser TQG benchmark: ' + JSON.stringify(benchmark));
  check(Number.isFinite(benchmark.p95) && benchmark.p95 < 20,
    'browser deterministic TQG p95 remains below 20 ms per analysis');
  check(Number.isFinite(benchmark.p99) && benchmark.p99 < 40,
    'browser deterministic TQG p99 remains below 40 ms per analysis');

  await setInput(cdp, '#chapterTitle', 'TQG Assurance Failure');
  await setInput(cdp, '#inputText', 'TQG analyzer failure must not break completed translation.');
  await evaluate(cdp, 'window.__tqg3.mode="clean";window.TQG=null;');
  await click(cdp, '#processBtn');
  await waitOutput(cdp, 'นี่คือผลลัพธ์ภาษาไทย');
  check(await evaluate(cdp, 'window.__tqg3.calls === 4'),
    'TQG failure-injection translation still completes its provider request');
  check(await evaluate(cdp,
    'document.getElementById("output").textContent.includes("นี่คือผลลัพธ์ภาษาไทย")'),
    'TQG analyzer failure does not erase completed translation output');
  check(await evaluate(cdp, 'document.getElementById("errorBox").textContent.trim() === ""'),
    'TQG analyzer failure does not surface as an application error');
  check(await evaluate(cdp, 'document.getElementById("tqgQualityPanel").hidden === true'),
    'TQG failure remains isolated from the quality UI state');
  check(await evaluate(cdp, 'window.__tqg3.blockedExternal.length === 0'),
    'TQG assurance made no unexpected external calls');
  check(pageErrors.length === 0, 'browser reported no uncaught runtime/page errors in TQG assurance');

  console.log('');
  console.log('TQG Production Assurance: PASS');
} catch (error) {
  console.error('');
  const typedFailure = environmentSetup ? asEnvironmentFailure(error, 'environment_setup') : asApplicationFailure(error);
  console.error('TQG Production Assurance: FAIL — ' + formatHarnessFailure(typedFailure));
  if (pageErrors.length) console.error('Browser errors:\\n' + pageErrors.join('\\n'));
  process.exitCode = 1;
} finally {
  try { await cdp?.send('Browser.close'); } catch {}
  try { cdp?.close(); } catch {}
  try { if (chrome && chrome.exitCode === null) chrome.kill(); } catch {}
  try { if (server) server.close(); } catch {}
  if (profileDir) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { await rm(profileDir, { recursive: true, force: true }); break; }
      catch (error) {
        if (attempt === 4) console.error('Cleanup warning:', error.message);
        else await new Promise(r => setTimeout(r, 200));
      }
    }
  }
}
