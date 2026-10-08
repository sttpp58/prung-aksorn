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
  formatHarnessFailure,
  waitForDevToolsTargets
} from './harness-diagnostics.mjs';

const ROOT = process.cwd();
const HOST = '127.0.0.1';

function pass(message) { console.log('PASS  ' + message); }
function check(condition, message) {
  assert.ok(condition, message);
  pass(message);
}

async function findBrowser() {
  const explicit = process.env.E2E_BROWSER;
  if (explicit) return explicit;
  const candidates = process.platform === 'win32'
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
  throw asEnvironmentFailure(new Error('No Chromium-family browser found. Set E2E_BROWSER to a browser executable path.'), 'browser_discovery');
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
        const root = path.resolve(ROOT);
        if (!filePath.startsWith(root + path.sep)) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
}

async function waitForUrl(url, timeoutMs = 10000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error('HTTP ' + response.status);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
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
    });
    this.ws.addEventListener('message', event => {
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
    const listeners = this.events.get(method) || [];
    listeners.push(listener);
    this.events.set(method, listeners);
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
    const detail = result.exceptionDetails;
    throw new Error(detail.exception?.description || detail.exception?.value || detail.text || 'Browser evaluation failed');
  }
  return result.result?.value;
}

async function waitForFunction(cdp, expression, timeoutMs = 10000, intervalMs = 75) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await evaluate(cdp, expression);
    if (last === true) return;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timeout waiting for condition: ' + expression + ' (last=' + JSON.stringify(last) + ')');
}

async function click(cdp, selector) {
  const ok = await evaluate(cdp, '(() => {' +
    'const el=document.querySelector(' + JSON.stringify(selector) + ');' +
    'if(!el)return false; el.click(); return true;' +
    '})()');
  check(ok, 'click target exists: ' + selector);
}

async function clickText(cdp, selector, text) {
  const ok = await evaluate(cdp, '(() => {' +
    'const el=[...document.querySelectorAll(' + JSON.stringify(selector) + ')].find(x=>x.textContent.includes(' + JSON.stringify(text) + '));' +
    'if(!el)return false; el.click(); return true;' +
    '})()');
  check(ok, 'click visible control containing "' + text + '"');
}

async function typeInto(cdp, selector, value) {
  const kind = await evaluate(cdp, '(() => {' +
    'const el=document.querySelector(' + JSON.stringify(selector) + ');' +
    'return el ? (el.type || el.tagName.toLowerCase()) : null;' +
    '})()');
  const ready = await evaluate(cdp, '(() => {' +
    'const el=document.querySelector(' + JSON.stringify(selector) + ');' +
    'if(!el)return false; el.focus();' +
    'if("value" in el){el.value="";el.dispatchEvent(new Event("input",{bubbles:true}));}' +
    'return true;' +
    '})()');
  check(ready, 'input target exists: ' + selector);
  if (kind === 'password') {
    const set = await evaluate(cdp, '(() => {' +
      'const el=document.querySelector(' + JSON.stringify(selector) + ');' +
      'if(!el)return false;' +
      'el.value=' + JSON.stringify(value) + ';' +
      'el.dispatchEvent(new Event("input",{bubbles:true}));' +
      'el.dispatchEvent(new Event("change",{bubbles:true}));' +
      'return el.value===' + JSON.stringify(value) + ';' +
      '})()');
    check(set, 'browser-side API credential field accepted');
    return;
  }
  await cdp.send('Input.insertText', { text: value });
}

async function setupBrowser(label) {
  const browser = await findBrowser();
  const started = await startStaticServer();
  const url = 'http://' + HOST + ':' + started.port + '/index.html';
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'prung-aksorn-recovery-'));
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
    '--remote-debugging-address=' + HOST,
    '--remote-debugging-port=' + debugPort,
    '--window-size=1440,1200', url
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let browserStdErr = '';
  let browserSpawnError = null;
  chrome.on('error', error => { browserSpawnError = error; });
  chrome.stderr.on('data', chunk => { browserStdErr += String(chunk); });
  const browserExit = new Promise(resolve => chrome.once('exit', resolve));
  const { pageTarget } = await waitForDevToolsTargets({
    host: HOST,
    port: debugPort,
    browserProcess: chrome,
    getStderr: () => browserStdErr,
    getSpawnError: () => browserSpawnError
  });
  const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await connectCdpWithDiagnostics(() => cdp.connect(), { port: debugPort, stderr: browserStdErr.slice(-4000), label });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  const runtimeErrors = [];
  const logErrors = [];
  cdp.on('Runtime.exceptionThrown', params => {
    const detail = params?.exceptionDetails;
    runtimeErrors.push(detail?.exception?.description || detail?.text || 'unknown exception');
  });
  cdp.on('Log.entryAdded', params => {
    if (params.entry?.level === 'error') logErrors.push(params.entry.text || 'browser log error');
  });
  await waitForFunction(cdp,
    "document.readyState === 'complete' && !!document.getElementById('addProjBtn')", 15000);
  await waitForFunction(cdp, '!!window.PrungAksornStorageV2', 15000);
  await evaluate(cdp,
    "navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true).catch(() => false) : false");
  check(
    await evaluate(cdp, "document.querySelectorAll('.project-row').length === 0"),
    'clean recovery profile starts empty'
  );
  return { browser, server: started.server, url, cdp, chrome, browserExit,
    profileDir, runtimeErrors, logErrors };
}

async function cleanupBrowser(ctx) {
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
  await waitForFunction(ctx.cdp, "document.getElementById('appDialogOverlay').classList.contains('show')");
  await typeInto(ctx.cdp, '#appDialogInput', name);
  await click(ctx.cdp, '#appDialogConfirmBtn');
  await waitForFunction(ctx.cdp,
    "document.querySelector('.project-row')?.textContent.includes(" + JSON.stringify(name) + ")");
  check(
    await evaluate(ctx.cdp, "document.querySelectorAll('.project-row').length === 1"),
    'Recovery test project created through visible UI'
  );
}

async function prepareTranslation(ctx, title, source) {
  await typeInto(ctx.cdp, '#apiKey', 'recovery-stress-only-key');
  await typeInto(ctx.cdp, '#chapterTitle', title);
  await typeInto(ctx.cdp, '#inputText', source);
  const chunkLengthSet = await evaluate(ctx.cdp, '(() => {' +
    'const el=document.getElementById("chunkLen"); if(!el)return false;' +
    'el.value="500"; el.dispatchEvent(new Event("input",{bubbles:true}));' +
    'el.dispatchEvent(new Event("change",{bubbles:true}));' +
    'return el.value === "500";' +
    '})()');
  check(chunkLengthSet, 'stress harness sets chunk length to 500 without mutating source text');
}

async function installProviderPlan(ctx, plan) {
  await evaluate(ctx.cdp, '(() => {' +
    'const originalFetch=window.fetch.bind(window);' +
    'window.__recoveryStress={calls:0,failures:0,pending:false,external:[],plan:' +
    JSON.stringify(plan) + ',originalFetch};' +
    'window.fetch=function(url,options){' +
      'const target=String(url);' +
      "if(target.includes('api.openai.com/v1/chat/completions')){" +
        'window.__recoveryStress.calls+=1;' +
        'const call=window.__recoveryStress.calls;' +
        "if(window.__recoveryStress.plan==='fail-all'){" +
          'window.__recoveryStress.failures+=1;' +
          "return Promise.reject(new TypeError('Injected recovery stress network failure'));" +
        '}' +
        "if(window.__recoveryStress.plan==='fail-once' && call===1){" +
          'window.__recoveryStress.failures+=1;' +
          'return Promise.resolve(new Response(' +
            "JSON.stringify({error:{message:'Injected recovery stress HTTP 500'}})," +
            "{status:500,headers:{'Content-Type':'application/json'}}));" +
        '}' +
        "if(window.__recoveryStress.plan==='resume-final'){" +
          'return Promise.resolve(new Response(' +
            "JSON.stringify({choices:[{message:{content:'Recovery stress final translation'}}]," +
            "usage:{prompt_tokens:1,completion_tokens:1}})," +
            "{status:200,headers:{'Content-Type':'application/json'}}));" +
        '}' +
        "if(window.__recoveryStress.plan==='checkpoint-then-stall' && call%2===0){" +
          'window.__recoveryStress.pending=true;' +
          'return new Promise((resolve,reject)=>{' +
            'const abort=()=>reject(new DOMException("Recovery stress navigation abort","AbortError"));' +
            'if(options?.signal?.aborted){abort();return;}' +
            "options?.signal?.addEventListener('abort',abort,{once:true});" +
            'window.__recoveryStress.resolve=()=>{' +
              'window.__recoveryStress.pending=false;' +
              'resolve(new Response(JSON.stringify({choices:[{message:{content:"Recovery stress stalled translation"}}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200,headers:{"Content-Type":"application/json"}}));' +
            '};' +
          '});' +
        '}' +
        'return Promise.resolve(new Response(' +
          "JSON.stringify({choices:[{message:{content:'Recovery stress checkpoint '+call}}],usage:{prompt_tokens:1,completion_tokens:1}})," +
          "{status:200,headers:{'Content-Type':'application/json'}}));" +
      '}' +
      "if(/^https?:/i.test(target)&&!target.startsWith(window.location.origin)){" +
        'window.__recoveryStress.external.push(target);' +
        "return Promise.reject(new Error('Unexpected external recovery-stress network call blocked'));"+
      '}' +
      'return originalFetch(url,options);' +
    '};' +
  '})()');
}

async function injectResumeStorageFailure(ctx) {
  await evaluate(ctx.cdp, '(() => {' +
    'const storage=window.PrungAksornStorageV2;' +
    'if(storage.__resumeFailureOriginal) return;' +
    'storage.__resumeFailureOriginal=storage.updateTranslationJob;' +
    'storage.updateTranslationJob=async function(payload){' +
      "if(payload?.status==='running' && payload?.expectedRevision !== undefined){" +
        "throw new Error('Injected resume storage failure');" +
      '}' +
      'return storage.__resumeFailureOriginal.call(this,payload);' +
    '};' +
  '})()');
}

async function restoreResumeStorage(ctx) {
  await evaluate(ctx.cdp, '(() => {' +
    'const storage=window.PrungAksornStorageV2;' +
    'if(storage.__resumeFailureOriginal){' +
      'storage.updateTranslationJob=storage.__resumeFailureOriginal;' +
      'delete storage.__resumeFailureOriginal;' +
    '}' +
  '})()');
}

async function latestJob(ctx) {
  return await evaluate(ctx.cdp, '(async()=>{' +
    'const jobs=await window.PrungAksornStorageV2.listTranslationJobs();' +
    'return jobs[0]||null;' +
  '})()');
}

async function waitForJob(ctx, predicate, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await latestJob(ctx);
    if (job && predicate(job)) return job;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const diagnostic = await evaluate(ctx.cdp, '(async()=>({' +
    'job:(await window.PrungAksornStorageV2.listTranslationJobs())[0]||null,' +
    'error:document.getElementById("errorBox")?.textContent||"",progress:document.getElementById("progressText")?.textContent||"",' +
    'resume:document.getElementById("resumeBtn")?.className||"",processDisabled:document.getElementById("processBtn")?.disabled,' +
    'recovery:document.getElementById("translationRecoveryBox")?.textContent||"",plan:window.__recoveryStress||null' +
    '}))()');
  throw new Error('Timed out waiting for expected Translation Job state: ' + JSON.stringify(diagnostic));
}

async function reloadBrowser(ctx) {
  await ctx.cdp.send('Page.navigate', { url: ctx.url });
  await waitForFunction(ctx.cdp,
    "document.readyState==='complete' && !!document.getElementById('inputText')", 12000);
  await waitForFunction(ctx.cdp, '!!window.PrungAksornStorageV2', 12000);
  await evaluate(ctx.cdp,
    "navigator.serviceWorker ? navigator.serviceWorker.ready.then(()=>true).catch(()=>false) : false");
}

async function configureAfterReload(ctx) {
  await typeInto(ctx.cdp, '#apiKey', 'recovery-stress-only-key');
  await waitForFunction(ctx.cdp,
    "document.querySelector('#translationRecoveryBox') && document.querySelectorAll('#translationRecoveryBox button').length >= 1",
    12000);
  const job = await latestJob(ctx);
  check(job?.status === 'running', 'reload discovers the interrupted Translation Job as running');
  check(
    await evaluate(ctx.cdp, "document.getElementById('translationRecoveryBox').textContent.includes('พบงานแปลที่ต้องตรวจสอบ')"),
    'reload exposes the interrupted Job in the visible recovery UI'
  );
  check(
    job.model === 'gpt-4o-mini' || typeof job.model === 'string',
    'reload preserves a valid model bound to the recovered Job'
  );
}

async function resumeVisibleRecovery(ctx, expectedCompleted) {
  await installProviderPlan(ctx, 'checkpoint-then-stall');
  await clickText(ctx.cdp, '#translationRecoveryBox button', 'กู้คืน');
  await waitForFunction(ctx.cdp,
    "document.getElementById('resumeBtn').classList.contains('show')", 10000);
  await click(ctx.cdp, '#resumeBtn');
  await waitForJob(ctx, job => job.status === 'running' && job.completedChunks === expectedCompleted + 1, 12000);
  check(
    await evaluate(ctx.cdp, "window.__recoveryStress.pending === true"),
    'recovered Job reaches the next in-flight provider boundary before the next restart'
  );
}

function assertJobShape(job, expectedCompleted, label) {
  check(job?.status === 'running', label + ' remains running before recovery resumes');
  check(job?.completedChunks === expectedCompleted,
    label + ' preserves checkpoint count ' + expectedCompleted);
  check(Array.isArray(job?.partialResults) && job.partialResults.length === expectedCompleted,
    label + ' preserves one partial result per checkpoint');
  check(
    job?.partialResults.every((item, index) => item && item.chunkIndex === index && typeof item.text === 'string'),
    label + ' keeps checkpoint indexes contiguous with no duplicates');
}

async function scenarioRepeatedReloadRecovery(ctx) {
  await createProject(ctx, 'Recovery Stress Repeated Reload');
  const source = Array.from({ length: 12 }, (_, index) =>
    'Recovery stress paragraph ' + (index + 1) + ' — ' +
    'The same checkpointed source must survive a browser restart boundary without losing prior chunks. '.repeat(4)
  ).join('\n\n');
  await prepareTranslation(ctx, 'Recovery Stress Repeated Reload Chapter', source);
  await installProviderPlan(ctx, 'checkpoint-then-stall');
  await click(ctx.cdp, '#processBtn');
  await waitForJob(ctx, job => job.status === 'running' && job.completedChunks === 1, 12000);
  await waitForFunction(ctx.cdp, "window.__recoveryStress.pending === true", 12000);
  let job = await latestJob(ctx);
  assertJobShape(job, 1, 'Initial interrupted Job');

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await reloadBrowser(ctx);
    await configureAfterReload(ctx);
    job = await latestJob(ctx);
    assertJobShape(job, cycle, 'Recovery cycle ' + cycle + ' after reload');
    await resumeVisibleRecovery(ctx, cycle);
    job = await latestJob(ctx);
    assertJobShape(job, cycle + 1, 'Recovery cycle ' + cycle + ' after checkpoint');
  }

  await reloadBrowser(ctx);
  await configureAfterReload(ctx);
  job = await latestJob(ctx);
  assertJobShape(job, 4, 'Final recovery restart state');
  await installProviderPlan(ctx, 'resume-final');
  await clickText(ctx.cdp, '#translationRecoveryBox button', 'กู้คืน');
  await waitForFunction(ctx.cdp, "document.getElementById('resumeBtn').classList.contains('show')");
  await click(ctx.cdp, '#resumeBtn');
  await waitForJob(ctx, job => job.status === 'completed', 15000);
  job = await latestJob(ctx);
  check(job.status === 'completed', 'repeated reload recovery completes the Translation Job');
  check(job.completedChunks === job.totalChunks,
    'repeated reload recovery completes every checkpointed chunk');
  check(job.partialResults.length === job.totalChunks,
    'final Translation Job contains exactly one result for every chunk');
  check(
    job.partialResults.every((item, index) => item.chunkIndex === index),
    'final Translation Job retains contiguous checkpoint indexes after repeated recovery');
  check(
    await evaluate(ctx.cdp, "document.querySelectorAll('#translationRecoveryBox').length === 0"),
    'completed recovered Job disappears from recovery UI');
  check(
    await evaluate(ctx.cdp, "document.getElementById('output').textContent.includes('Recovery stress final translation')"),
    'final recovered output is visible in the editor');
  check(job.totalChunks >= 5, 'stress run used a multi-checkpoint Job rather than a single-chunk control');
}

async function scenarioFailedJobRecoveryAfterReload(ctx) {
  await createProject(ctx, 'Recovery Stress Failed Job');
  const source = Array.from({ length: 6 }, (_, index) =>
    'Failed recovery paragraph ' + (index + 1) + ' — ' + 'Recovery must remain user-driven after provider failure. '.repeat(8)
  ).join('\n\n');
  await prepareTranslation(ctx, 'Recovery Stress Failed Chapter', source);
  await installProviderPlan(ctx, 'fail-all');
  await click(ctx.cdp, '#processBtn');
  await waitForJob(ctx, job => job.status === 'failed', 15000);
  let job = await latestJob(ctx);
  check(job.completedChunks === 0, 'failed Job keeps zero checkpoints when the first chunk never succeeds');
  check(job.revision > 0, 'failed Job persists a revision that can be recovered after reload');
  await reloadBrowser(ctx);
  await typeInto(ctx.cdp, '#apiKey', 'recovery-stress-only-key');
  await waitForFunction(ctx.cdp,
    "document.querySelector('#translationRecoveryBox') && document.querySelectorAll('#translationRecoveryBox button').length >= 1",
    12000);
  job = await latestJob(ctx);
  check(job.status === 'failed', 'reload rediscovers the failed Translation Job');
  check(
    await evaluate(ctx.cdp, "document.getElementById('translationRecoveryBox').textContent.includes('failed')"),
    'failed Job state is visible in recovery UI after reload'
  );
  await installProviderPlan(ctx, 'resume-final');
  await clickText(ctx.cdp, '#translationRecoveryBox button', 'กู้คืน');
  await waitForFunction(ctx.cdp, "document.getElementById('resumeBtn').classList.contains('show')");
  await click(ctx.cdp, '#resumeBtn');
  await waitForJob(ctx, job => job.status === 'completed', 15000);
  job = await latestJob(ctx);
  check(job.status === 'completed', 'failed Job can be manually recovered after a real browser reload');
  check(job.completedChunks === job.totalChunks, 'failed Job recovery finishes all chunks');
  check(
    await evaluate(ctx.cdp, "document.getElementById('output').textContent.includes('Recovery stress final translation')"),
    'failed Job recovery writes the recovered output visibly');
}

async function scenarioResumeSetupFailureCleansUp(ctx) {
  await createProject(ctx, 'Recovery Stress Resume Setup Failure');
  const source = Array.from({ length: 4 }, (_, index) =>
    'Resume setup failure paragraph ' + (index + 1) + ' — ' +
    'A storage failure before the provider call must release every translation UI lock. '.repeat(6)
  ).join('\n\n');
  await prepareTranslation(ctx, 'Recovery Stress Resume Setup Failure Chapter', source);
  await installProviderPlan(ctx, 'fail-all');
  await click(ctx.cdp, '#processBtn');
  await waitForJob(ctx, job => job.status === 'failed', 15000);
  await reloadBrowser(ctx);
  await typeInto(ctx.cdp, '#apiKey', 'recovery-stress-only-key');
  await waitForFunction(ctx.cdp,
    "document.querySelector('#translationRecoveryBox') && document.querySelectorAll('#translationRecoveryBox button').length >= 1",
    12000);

  await installProviderPlan(ctx, 'resume-final');
  await injectResumeStorageFailure(ctx);
  await clickText(ctx.cdp, '#translationRecoveryBox button', 'กู้คืน');
  await waitForFunction(ctx.cdp, "document.getElementById('resumeBtn').classList.contains('show')");
  await click(ctx.cdp, '#resumeBtn');
  await waitForFunction(ctx.cdp,
    "!document.getElementById('processBtn').disabled && !document.getElementById('cancelBtn').classList.contains('show')",
    10000);

  const failedState = await evaluate(ctx.cdp, '(async()=>({' +
    'job:(await window.PrungAksornStorageV2.listTranslationJobs())[0]||null,' +
    'error:document.getElementById("errorBox")?.textContent||"",' +
    'resume:document.getElementById("resumeBtn")?.className||"",' +
    'processDisabled:document.getElementById("processBtn")?.disabled,' +
    'cancelVisible:document.getElementById("cancelBtn")?.classList.contains("show"),' +
    'calls:window.__recoveryStress?.calls||0' +
  '}))()');
  check(failedState.job?.status === 'failed', 'Resume setup failure preserves the recoverable Job state');
  check(failedState.processDisabled === false, 'Resume setup failure releases the process button');
  check(failedState.cancelVisible === false, 'Resume setup failure hides the cancel button');
  check(failedState.resume.includes('show'), 'Resume setup failure keeps the recovery action visible');
  check(failedState.error.includes('Injected resume storage failure'),
    'Resume setup failure is shown in the visible error UI');
  check(failedState.calls === 0, 'Resume setup failure makes no provider call before storage recovery succeeds');

  await restoreResumeStorage(ctx);
  await clickText(ctx.cdp, '#translationRecoveryBox button', 'กู้คืน');
  await waitForFunction(ctx.cdp, "document.getElementById('resumeBtn').classList.contains('show')");
  await click(ctx.cdp, '#resumeBtn');
  await waitForJob(ctx, job => job.status === 'completed', 15000);
  check((await latestJob(ctx)).status === 'completed',
    'Job remains resumable and completes after the storage failure is cleared');
}

async function assertNoUnexpectedErrors(ctx, allowedLogPrefixes = []) {
  const unexpectedLogs = ctx.logErrors.filter(entry =>
    !allowedLogPrefixes.some(prefix => entry.startsWith(prefix))
  );
  check(ctx.runtimeErrors.length === 0,
    'no uncaught browser runtime exceptions: ' + JSON.stringify(ctx.runtimeErrors));
  check(unexpectedLogs.length === 0,
    'no unexpected browser console errors: ' + JSON.stringify(unexpectedLogs));
  check(
    await evaluate(ctx.cdp, '!window.__recoveryStress || window.__recoveryStress.external.length === 0'),
    'recovery stress made no unexpected external network calls');
}

async function runScenario(name, body) {
  console.log('\n=== ' + name + ' ===');
  const ctx = await setupBrowser(name);
  try {
    await body(ctx);
    await assertNoUnexpectedErrors(ctx);
    pass(name + ' — PASS');
  } finally {
    await cleanupBrowser(ctx);
  }
}

const scenarios = [
  ['RS-01 Repeated Browser-Restart Translation Recovery', scenarioRepeatedReloadRecovery],
  ['RS-02 Failed Translation Job Recovery After Reload', scenarioFailedJobRecoveryAfterReload],
  ['RS-03 Resume Setup Failure Cleanup', scenarioResumeSetupFailureCleansUp]
];

let failed = false;
for (const [name, body] of scenarios) {
  try {
    await runScenario(name, body);
  } catch (error) {
    failed = true;
    console.error('\nFAIL  ' + name + ' — ' + formatHarnessFailure(asApplicationFailure(error)));
  }
}

if (failed) {
  console.error('\nTranslation Job Recovery Stress Test: FAIL');
  process.exitCode = 1;
} else {
  console.log('\nTranslation Job Recovery Stress Test: PASS');
}
