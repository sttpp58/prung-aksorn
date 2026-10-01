#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

function readText(file) {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing required file: ${file}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function pass(message) {
  console.log(`PASS  ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
  pass(message);
}

function parseJavaScript(source, filename) {
  try {
    new vm.Script(source, { filename });
  } catch (error) {
    fail(`JavaScript syntax error in ${filename}: ${error.message}`);
  }
}

function extractInlineScripts(html) {
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    if (!/\bsrc\s*=\s*["'][^"']+["']/i.test(attrs)) {
      scripts.push(body);
    }
  }
  return scripts;
}

function extractCalls(source, functionName) {
  const token = `PrungAksornStorageV2.${functionName}(`;
  const calls = [];
  let from = 0;

  while (true) {
    const start = source.indexOf(token, from);
    if (start < 0) break;

    let index = start + token.length;
    let depth = 1;
    let quote = null;
    let escaped = false;

    for (; index < source.length && depth > 0; index += 1) {
      const char = source[index];

      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === "'" || char === '"' || char === '`') {
        quote = char;
        continue;
      }

      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
    }

    if (depth !== 0) {
      fail(`Unbalanced call expression for ${functionName}`);
    }

    calls.push(source.slice(start + token.length, index - 1));
    from = index;
  }

  return calls;
}

function splitTopLevelArguments(expression) {
  const args = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth -= 1;
    else if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth -= 1;
    else if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth -= 1;
    else if (
      char === ',' &&
      parenDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0
    ) {
      args.push(expression.slice(start, index).trim());
      start = index + 1;
    }
  }

  const tail = expression.slice(start).trim();
  if (tail) args.push(tail);
  return args;
}

function assertExactArity(calls, functionName, arity) {
  for (const call of calls) {
    assert(
      splitTopLevelArguments(call).length === arity,
      `${functionName} call preserves expected arity (${arity})`
    );
  }
}

function assertRevisionArgument(call, functionName, requiredArgumentIndex) {
  const args = splitTopLevelArguments(call);
  assert(
    args.length > requiredArgumentIndex,
    `${functionName} call has required revision argument`
  );

  const revisionArgument = args[requiredArgumentIndex];
  assert(
    /(?:expectedRevision|(?:^|\W)[A-Za-z_$][\w$]*Revision\b|\.revision\b)/.test(
      revisionArgument
    ),
    `${functionName} call revision argument is revision-derived`
  );
}

function assertAllRevisionCallSites(indexSource) {
  const updateCalls = extractCalls(indexSource, 'updateTranslationJob');
  assert(updateCalls.length > 0, 'updateTranslationJob has call sites');
  assertExactArity(updateCalls, 'updateTranslationJob', 1);
  for (const call of updateCalls) {
    assert(
      /expectedRevision\s*:/.test(call),
      'updateTranslationJob call preserves expectedRevision'
    );
  }

  const checkpointCalls = extractCalls(indexSource, 'checkpointTranslationJob');
  assert(checkpointCalls.length > 0, 'checkpointTranslationJob has call sites');
  assertExactArity(checkpointCalls, 'checkpointTranslationJob', 4);
  for (const call of checkpointCalls) {
    const args = splitTopLevelArguments(call);
    assert(
      /expectedRevision\s*:/.test(args[0]),
      'checkpointTranslationJob call preserves expectedRevision'
    );
  }

  const completeCalls = extractCalls(indexSource, 'completeTranslationJob');
  assert(completeCalls.length > 0, 'completeTranslationJob has call sites');
  assertExactArity(completeCalls, 'completeTranslationJob', 2);
  for (const call of completeCalls) {
    assertRevisionArgument(call, 'completeTranslationJob', 1);
  }

  const failCalls = extractCalls(indexSource, 'failTranslationJob');
  assert(failCalls.length > 0, 'failTranslationJob has call sites');
  assertExactArity(failCalls, 'failTranslationJob', 3);
  for (const call of failCalls) {
    assertRevisionArgument(call, 'failTranslationJob', 2);
  }

  const cancelCalls = extractCalls(indexSource, 'cancelTranslationJob');
  assert(cancelCalls.length > 0, 'cancelTranslationJob has call sites');
  assertExactArity(cancelCalls, 'cancelTranslationJob', 2);
  for (const call of cancelCalls) {
    assertRevisionArgument(call, 'cancelTranslationJob', 1);
  }
}

function main() {
  const indexHtml = readText('index.html');
  const storage = readText('storage-v2.js');
  const sw = readText('sw.js');
  const tqgUi = readText('tqg-ui.js');
  const tqgIntegration = readText('tqg-integration.js');
  const manifestText = readText('manifest.json');

  parseJavaScript(storage, 'storage-v2.js');
  parseJavaScript(tqgUi, 'tqg-ui.js');
  parseJavaScript(tqgIntegration, 'tqg-integration.js');

  assert(/TQG-07-2026-09-30/.test(tqgUi), 'TQG Quality UI module version is present');
  assert(!/[\u{1F000}-\u{1FAFF}]/u.test(tqgUi), 'TQG Quality UI module contains no emoji');
  assert(/TQG-08-2026-09-30/.test(tqgIntegration), 'TQG Integration module version is present');
  assert(/TQGQualityUI/.test(indexHtml), 'index.html references TQG Quality UI');

  const inlineScripts = extractInlineScripts(indexHtml);
  assert(inlineScripts.length > 0, 'index.html contains inline JavaScript');
  inlineScripts.forEach((source, index) =>
    parseJavaScript(source, `index.html inline script #${index + 1}`)
  );
  pass(`index.html inline JavaScript syntax: ${inlineScripts.length} block(s)`);

  assert(
    /<script\b[^>]*\bsrc=["'](?:\.\/)?storage-v2\.js["'][^>]*>/i.test(indexHtml),
    'index.html loads storage-v2.js'
  );
  assert(
    /function\s+flushPendingSaveOnLifecycle\s*\(/.test(indexHtml) &&
      /addEventListener\(['"]visibilitychange['"]/.test(indexHtml) &&
      /document\.visibilityState\s*===\s*['"]hidden['"]/.test(indexHtml) &&
      /addEventListener\(['"]pagehide['"]/.test(indexHtml),
    'application flushes pending saves on page lifecycle transitions'
  );
  assert(
    /var\s+saveDataVersion\s*=\s*0/.test(indexHtml) &&
      /saveDataVersion\s*\+=\s*1/.test(indexHtml) &&
      /!ok\s*\|\|\s*saveDataVersion\s*!==\s*flushVersion/.test(indexHtml),
    'application preserves failed or newer pending saves'
  );

  assert(
    /var\s+draftSaveContext\s*=\s*null/.test(indexHtml) &&
      /var\s+draftSaveGeneration\s*=\s*0/.test(indexHtml),
    'draft save tracks explicit context and generation'
  );

  assert(
    /function\s+loadProjectDraft\s*\([\s\S]*?var activeBook = getActiveBook\(proj\)[\s\S]*?if\(!activeBook\) return;[\s\S]*?chapterTitle\.value = activeBook\.chapterTitle[\s\S]*?inputText\.value = activeBook\.draft/.test(indexHtml),
    'editor draft loads strictly from active Book'
  );

  assert(
    /function\s+flushPendingDraftSave\s*\([\s\S]*?if\(!proj \|\| !context\.bookId\) return;[\s\S]*?var book = \(proj\.books \|\| \[\]\)\.find[\s\S]*?book\.draft = context\.draft[\s\S]*?book\.chapterTitle = context\.chapterTitle/.test(indexHtml),
    'pending draft flush writes strictly to captured Book'
  );

  const draftSaveStart = indexHtml.indexOf('function saveDraftSoon(){');
  const draftSaveEnd = indexHtml.indexOf('\n  function viewHistoryEntry', draftSaveStart);
  assert(draftSaveStart >= 0 && draftSaveEnd > draftSaveStart, 'saveDraftSoon function can be audited');
  const draftSaveBody = indexHtml.slice(draftSaveStart, draftSaveEnd);
  assert(
    draftSaveBody.includes('var activeBook = getActiveBook(proj);') &&
      draftSaveBody.includes('bookId: activeBook.id'),
    'saveDraftSoon captures active Book identity'
  );
  const draftTimerStart = draftSaveBody.indexOf('draftSaveTimer = setTimeout(function(){');
  assert(draftTimerStart >= 0, 'saveDraftSoon retains debounce timer');
  const draftTimerBody = draftSaveBody.slice(draftTimerStart);
  assert(
    draftTimerBody.includes('draftSaveContext.generation !== context.generation') &&
      draftTimerBody.includes('context.bookId') &&
      draftTimerBody.includes('context.draft') &&
      draftTimerBody.includes('context.chapterTitle') &&
      draftTimerBody.includes('targetBook') &&
      draftTimerBody.includes('targetBook.draft = context.draft') &&
      draftTimerBody.includes('targetBook.chapterTitle = context.chapterTitle') &&
      !draftTimerBody.includes('targetProj.draft') &&
      !draftTimerBody.includes('targetProj.chapterTitle') &&
      !draftTimerBody.includes('inputText.value') &&
      !draftTimerBody.includes('chapterTitle.value'),
    'debounced callback writes only captured Book snapshot'
  );

  assert(
    /function\s+loadData\s*\([\s\S]*?legacyDraft[\s\S]*?legacyChapterTitle[\s\S]*?activeBookHadDraft[\s\S]*?activeBookHadChapterTitle[\s\S]*?delete p\.draft[\s\S]*?delete p\.chapterTitle/.test(indexHtml),
    'loadData migrates legacy Project draft metadata into active Book'
  );

  assert(
    /defaultBook\s*=\s*\{[^\n]*draft:\s*['"]['"][^\n]*chapterTitle:\s*['"]['"]/.test(indexHtml) &&
      /var newBook = \{[^\n]*draft:\s*['"]['"][^\n]*chapterTitle:\s*['"]['"]/.test(indexHtml),
    'new Project and Book initialize Book-scoped draft'
  );

  assert(
    /if\(!activeBookBeforeNormalize && p\.books\.length > 0\)/.test(indexHtml) &&
      /if\(!activeBook && p\.books\.length > 0\)/.test(indexHtml),
    'invalid currentBookId falls back to a real Book'
  );

  const projectSwitchStart = indexHtml.indexOf("row.addEventListener('click', function(){");
  const projectSwitch = indexHtml.slice(projectSwitchStart, projectSwitchStart + 360);
  assert(
    projectSwitchStart >= 0 &&
      projectSwitch.includes('flushPendingDraftSave();') &&
      projectSwitch.includes('saveData();') &&
      projectSwitch.includes('loadProjectDraft(proj);'),
    'project switch flushes pending draft before context mutation'
  );

  const bookSwitchStart = indexHtml.indexOf("btitle.addEventListener('click', function(e){");
  const bookSwitch = indexHtml.slice(bookSwitchStart, bookSwitchStart + 260);
  assert(
    bookSwitchStart >= 0 &&
      bookSwitch.includes('flushPendingDraftSave();') &&
      bookSwitch.includes('commitChange();') &&
      bookSwitch.includes('loadProjectDraft(proj);'),
    'book switch flushes pending draft before loading Book'
  );

  const newBookStart = indexHtml.indexOf("var newBook = { id: makeId('b')");
  const newBookHandler = indexHtml.slice(Math.max(0, newBookStart - 220), newBookStart + 600);
  assert(
    newBookStart >= 0 &&
      newBookHandler.includes('flushPendingDraftSave();') &&
      newBookHandler.includes('proj.currentBookId = newBook.id;') &&
      newBookHandler.includes('loadProjectDraft(proj);'),
    'new Book creation switches to isolated empty editor state'
  );

  const bookDeleteStart = indexHtml.indexOf("bdel.addEventListener('click', async function(e){");
  const bookDeleteHandler = indexHtml.slice(bookDeleteStart, bookDeleteStart + 1000);
  assert(
    bookDeleteStart >= 0 &&
      bookDeleteHandler.includes('var wasActiveBook = proj.currentBookId === book.id;') &&
      bookDeleteHandler.includes('flushPendingDraftSave();') &&
      bookDeleteHandler.includes('proj.books = proj.books.filter') &&
      bookDeleteHandler.includes('if(wasActiveBook) loadProjectDraft(proj);'),
    'Book deletion reloads editor only when the deleted Book was active'
  );

  assert(
    /function\s+normalize\s*\([\s\S]*?var book=without\(b,\['history'\]\)/.test(storage) &&
      /function\s+hydrate\s*\([\s\S]*?ps\[b\.projectId\]\.books\.push\(bs\[b\.id\]\)/.test(storage),
    'IndexedDB V2 preserves Book fields without adding a schema'
  );

  assert(
    /var\s+STORES\s*=\s*\[[^\]]*['"]translationJobs['"]/s.test(storage),
    'IndexedDB STORES includes translationJobs'
  );
  assert(
    /createObjectStore\(['"]translationJobs['"]\s*,\s*\{\s*keyPath\s*:\s*['"]jobId['"]\s*\}\)/.test(
      storage
    ),
    'translationJobs object store uses jobId keyPath'
  );
  assert(
    /revision\s*:\s*0/.test(storage) &&
      /expectedRevision/.test(storage) &&
      /currentRevision/.test(storage),
    'translation job revision/CAS model remains present'
  );

  assert(
    /function checkpointTranslationJob[\s\S]*?expectedRevision[\s\S]*?currentRevision\s*!==\s*expected/.test(
      storage
    ),
    'checkpointTranslationJob enforces expectedRevision'
  );
  assert(
    /function checkpointTranslationJob[\s\S]*?status!==['"]running['"]/.test(storage),
    'checkpointTranslationJob enforces running status'
  );
  assert(
    /function checkpointTranslationJob[\s\S]*?chunkIndex!==current\.completedChunks/.test(
      storage
    ),
    'checkpointTranslationJob enforces chunk-index continuity'
  );

  assert(
    /function completeTranslationJob\(jobId,expectedRevision\)[\s\S]*?requireComplete:true/.test(
      storage
    ),
    'completeTranslationJob requires expectedRevision and final checkpoint'
  );
  assert(
    /if\(requireComplete&&current\.completedChunks!==current\.totalChunks\)/.test(storage),
    'updateTranslationJob rejects completion before final checkpoint'
  );

  assert(
    /function backupData\([\s\S]*?translationJobs\s*:\s*clone\(n\.translationJobs/.test(
      storage
    ),
    'backupData includes translationJobs'
  );
  assert(
    /function restoreNormalized\([\s\S]*?translationJobs\s*\|\|\[\]\)[\s\S]*?objectStore\(['"]translationJobs['"]\)\.put/.test(
      storage
    ),
    'restoreNormalized restores translationJobs'
  );
  assert(
    /function verifyNormalized\([\s\S]*?translationJobs[\s\S]*?Content checksum mismatch after restore/.test(
      storage
    ),
    'verifyNormalized verifies translationJobs'
  );

  for (const functionName of [
    'buildTranslatePrompt',
    'splitIntoChunks',
    'callOpenAI',
    'callGemini'
  ]) {
    assert(
      new RegExp(`function\\s+${functionName}\\s*\\(`).test(indexHtml),
      `core function remains present: ${functionName}`
    );
  }

  assertAllRevisionCallSites(indexHtml);

  assert(
    /const\s+CACHE_NAME\s*=\s*['"]prung-aksorn-v6['"]/.test(sw),
    'Service Worker cache version is v6 for TQG integration assets'
  );
  assert(
    /['"]\.\/storage-v2\.js['"]/.test(sw),
    'Service Worker app shell includes storage-v2.js'
  );
  for (const asset of ['tqg.js','tqg-inspector.js','tqg-repair.js','tqg-ui.js','tqg-integration.js']) {
    assert(new RegExp("['\\\"]\\./" + asset + "['\\\"]").test(sw), 'Service Worker app shell includes ' + asset);
  }
  assert(
    /if\s*\(url\.origin\s*!==\s*self\.location\.origin\)\s*\{\s*return;\s*\}/.test(
      sw
    ),
    'Service Worker preserves cross-origin bypass'
  );
  assert(
    /if\s*\(event\.request\.method\s*!==\s*['"]GET['"]\)\s*\{\s*return;\s*\}/.test(
      sw
    ),
    'Service Worker preserves non-GET bypass'
  );
  parseJavaScript(sw, 'sw.js');

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    fail(`manifest.json is invalid JSON: ${error.message}`);
  }
  assert(manifest && typeof manifest === 'object', 'manifest.json parses as an object');
  assert(
    Array.isArray(manifest.icons) &&
      manifest.icons.some((icon) => icon && /(?:^|\/)icons\/icon-192\.png$/.test(String(icon.src || ''))),
    'manifest references icon-192.png'
  );
  assert(
    Array.isArray(manifest.icons) &&
      manifest.icons.some((icon) => icon && /(?:^|\/)icons\/icon-512\.png$/.test(String(icon.src || ''))),
    'manifest references icon-512.png'
  );

  const tqgRegressionPath = path.join(ROOT, 'scripts', 'tqg-regression.mjs');
  assert(fs.existsSync(tqgRegressionPath), 'TQG regression runner is present');
  const tqgRegression = spawnSync(process.execPath, [tqgRegressionPath], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  if (tqgRegression.status !== 0) {
    fail('TQG regression suite failed' + (tqgRegression.stderr ? `: ${tqgRegression.stderr.trim()}` : ''));
  }
  assert(/TQG-09 Regression: PASS/.test(tqgRegression.stdout), 'TQG regression suite passes');
  const c5AuditPath = path.join(ROOT, 'scripts', 'tqg-phase-c-final-audit.mjs');
  assert(fs.existsSync(c5AuditPath), 'C5 final audit runner is present');
  const c5Audit = spawnSync(process.execPath, [c5AuditPath], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  if (c5Audit.status !== 0) {
    fail('TQG C5 final audit failed' + (c5Audit.stderr ? `: ${c5Audit.stderr.trim()}` : ''));
  }
  assert(/TQG Phase C Final Audit: PASS WITH LIMITATION/.test(c5Audit.stdout), 'TQG C5 final audit passes');


  const relevantAsyncNames = [
    'runTranslation',
    'runBatchTranslationRecovery',
    'retryBatchTranslationJob',
    'inspectCurrentTQGQuality',
    'repairCurrentTQGQuality'
  ];
  for (const name of relevantAsyncNames) {
    const start = indexHtml.indexOf('async function ' + name + '(');
    assert(start >= 0, name + ' remains present for async-isolation audit');
  }

  const singleTranslationStart = indexHtml.indexOf('async function runTranslation(');
  const singleTranslationEnd = indexHtml.indexOf('\n  var batchInProgress', singleTranslationStart);
  const singleTranslationBody = indexHtml.slice(singleTranslationStart, singleTranslationEnd);
  assert(
    singleTranslationStart >= 0 &&
      singleTranslationEnd > singleTranslationStart &&
      singleTranslationBody.includes('if(isAppContextCurrent(translationContext)){') &&
      singleTranslationBody.includes('pendingResume = {') &&
      singleTranslationBody.includes('translationContextCurrent') &&
      singleTranslationBody.includes('clearTranslationRecoveryUI();'),
    'single translation gates stale success/error/recovery UI'
  );

  const recoveryStart = indexHtml.indexOf('async function runBatchTranslationRecovery(');
  const recoveryEnd = indexHtml.indexOf('\n  async function retryBatchTranslationJob', recoveryStart);
  const recoveryBody = indexHtml.slice(recoveryStart, recoveryEnd);
  assert(
    recoveryBody.includes('var recoveryContext=null;') &&
      recoveryBody.includes('captureAppContext(state.proj,state.book)') &&
      recoveryBody.includes('if(isAppContextCurrent(recoveryContext)){') &&
      recoveryBody.includes('refreshTranslationRecoveryUI();') &&
      recoveryBody.includes("(!recoveryContext || isAppContextCurrent(recoveryContext))"),
    'Batch Recovery gates stale UI and retains explicit context'
  );

  const retryStart = indexHtml.indexOf('async function retryBatchTranslationJob(');
  const retryEnd = indexHtml.indexOf('\n  async function prepareTranslationRecovery', retryStart);
  const retryBody = indexHtml.slice(retryStart, retryEnd);
  assert(
    retryBody.includes('var retryContext=null;') &&
      retryBody.includes('captureAppContext(proj,book)') &&
      retryBody.includes('if(isAppContextCurrent(retryContext)) refreshTranslationRecoveryUI();') &&
      retryBody.includes("(!retryContext || isAppContextCurrent(retryContext))"),
    'Batch Retry gates stale UI and retains explicit context'
  );

  const inspectorStart = indexHtml.indexOf('async function inspectCurrentTQGQuality(');
  const inspectorEnd = indexHtml.indexOf('\n  async function repairCurrentTQGQuality', inspectorStart);
  const inspectorBody = indexHtml.slice(inspectorStart, inspectorEnd);
  assert(
    inspectorBody.includes('var inspectionContext = captureAppContext') &&
      inspectorBody.includes('if(!isAppContextCurrent(inspectionContext)') &&
      inspectorBody.includes("isAppContextCurrent(inspectionContext)) showError") &&
      inspectorBody.includes('if(isAppContextCurrent(inspectionContext)){'),
    'TQG Inspector rejects stale result/error/finally UI'
  );

  const repairStart = indexHtml.indexOf('async function repairCurrentTQGQuality(');
  const repairEnd = indexHtml.indexOf('\n  function setResultFocus', repairStart);
  const repairBody = indexHtml.slice(repairStart, repairEnd);
  assert(
    repairBody.includes('var repairContext = captureAppContext') &&
      repairBody.includes('if(!isAppContextCurrent(repairContext)') &&
      repairBody.includes("isAppContextCurrent(repairContext)) showError") &&
      repairBody.includes('if(isAppContextCurrent(repairContext)){'),
    'TQG Repair rejects stale result/error/finally UI'
  );

  const ingestImportStart = indexHtml.indexOf('async function importExternalChapter(');
  const ingestImportEnd = indexHtml.indexOf('\n\n  // ดักฟังสัญญาณ', ingestImportStart);
  const ingestImportBody = indexHtml.slice(ingestImportStart, ingestImportEnd);
  assert(
    ingestImportBody.includes('targetBook.chapterTitle = finalTitle;') &&
      ingestImportBody.includes('saveData();') &&
      !ingestImportBody.includes('translatedSub && translatedSub.trim()) {\n            var finalTitle = chapNum ? (\'บทที่ \' + chapNum + \': \' + translatedSub.trim()) : translatedSub.trim();\n            chapterTitle.value = finalTitle;\n            saveDraftSoon();'),
    'background title translation never rebinds stale work through current editor debounce'
  );

  const ingestValidatorStart = indexHtml.indexOf('function validatePrungIngestMessage(');
  const ingestListenerStart = indexHtml.indexOf("  window.addEventListener('message'", ingestValidatorStart);
  const ingestValidatorBody = indexHtml.slice(ingestValidatorStart, ingestListenerStart);
  const ingestListenerBody = indexHtml.slice(ingestListenerStart);
  assert(
    ingestValidatorStart >= 0 &&
      ingestValidatorBody.includes('e.source !== window') &&
      ingestValidatorBody.includes('e.origin !== window.location.origin') &&
      ingestValidatorBody.includes("data.type !== 'PRUNG_INGEST'") &&
      ingestValidatorBody.includes('Array.isArray(data)') &&
      ingestValidatorBody.includes("data.title !== undefined") &&
      ingestValidatorBody.includes("typeof data.title !== 'string'") &&
      ingestValidatorBody.includes('data.title.length > 500') &&
      ingestValidatorBody.includes("typeof data.content !== 'string'") &&
      ingestValidatorBody.includes('data.content.length > 500000') &&
      ingestValidatorBody.includes('!data.content.trim()') &&
      ingestValidatorBody.includes('typeof data.autoStart !== \'boolean\'') &&
      ingestValidatorBody.includes('autoStart: data.autoStart === true') &&
      ingestListenerBody.includes('var ingestMessage = validatePrungIngestMessage(e);') &&
      ingestListenerBody.includes('if (ingestMessage) {') &&
      !ingestListenerBody.includes('importExternalChapter(e.data.title') ,
    'WORK 3 PRUNG_INGEST receiver enforces source/origin/schema/size boundary before import'
  );

  const sandboxWindow = { location: { origin: 'https://example.test' } };
  const validator = vm.runInNewContext(`(${ingestValidatorBody})`, { window: sandboxWindow });
  const valid = { source: sandboxWindow, origin: 'https://example.test', data: { type: 'PRUNG_INGEST', title: 'Chapter 1', content: 'Hello world', autoStart: true } };
  const normalizedValid = validator(valid);
  assert(normalizedValid && normalizedValid.title === 'Chapter 1' && normalizedValid.content === 'Hello world' && normalizedValid.autoStart === true, 'WORK 3 accepts valid same-origin PRUNG_INGEST message');
  assert(validator({ source: sandboxWindow, origin: 'https://evil.example', data: valid.data }) === null, 'WORK 3 rejects foreign PRUNG_INGEST origin');
  assert(validator({ source: sandboxWindow, origin: 'https://example.test', data: { type: 'NOPE', title: 'x', content: 'y' } }) === null, 'WORK 3 rejects wrong PRUNG_INGEST message type');
  assert(validator({ source: sandboxWindow, origin: 'https://example.test', data: ['PRUNG_INGEST', 'x'] }) === null, 'WORK 3 rejects array payload');
  assert(validator({ source: sandboxWindow, origin: 'https://example.test', data: { type: 'PRUNG_INGEST', title: 1, content: 'y' } }) === null, 'WORK 3 rejects non-string title');
  assert(validator({ source: sandboxWindow, origin: 'https://example.test', data: { type: 'PRUNG_INGEST', title: 'x'.repeat(501), content: 'y' } }) === null, 'WORK 3 rejects oversized title');
  assert(validator({ source: sandboxWindow, origin: 'https://example.test', data: { type: 'PRUNG_INGEST', title: 'x', content: '   ' } }) === null, 'WORK 3 rejects blank content');
  assert(validator({ source: sandboxWindow, origin: 'https://example.test', data: { type: 'PRUNG_INGEST', title: 'x', content: 'x'.repeat(500001) } }) === null, 'WORK 3 rejects oversized content');
  assert(validator({ source: sandboxWindow, origin: 'https://example.test', data: { type: 'PRUNG_INGEST', title: 'x', content: 'y', autoStart: 'true' } }) === null, 'WORK 3 rejects non-boolean autoStart');
  const defaultAutoStart = validator({ source: sandboxWindow, origin: 'https://example.test', data: { type: 'PRUNG_INGEST', title: 'x', content: 'y' } });
  assert(defaultAutoStart && defaultAutoStart.autoStart === false, 'WORK 3 normalizes omitted autoStart to false');
  const optionalTitle = validator({ source: sandboxWindow, origin: 'https://example.test', data: { type: 'PRUNG_INGEST', content: 'y' } });
  assert(optionalTitle && optionalTitle.title === '', 'WORK 3 preserves optional title compatibility');

  assert(
    /var\s+appContextGeneration\s*=\s*0/.test(indexHtml) &&
      /function\s+captureAppContext\s*\(/.test(indexHtml) &&
      /function\s+isAppContextCurrent\s*\(/.test(indexHtml) &&
      /function\s+advanceAppContextGeneration\s*\(/.test(indexHtml) &&
      (indexHtml.match(/advanceAppContextGeneration\(\)/g) || []).length >= 9,
    'WORK 2 context-generation guards are present at all audited switch points'
  );

  const settingsLockTrue = (indexHtml.match(/setTranslationSettingsLocked\(true\)/g) || []).length;
  const settingsLockFalse = (indexHtml.match(/setTranslationSettingsLocked\(false\)/g) || []).length;
  assert(settingsLockTrue === 4 && settingsLockFalse === 4, 'WORK 2 translation settings locks are balanced');

  assert(
    /function\s+captureTranslationSettingsSnapshot\s*\(/.test(indexHtml) &&
      /function\s+normalizeTranslationSettingsSnapshot\s*\(/.test(indexHtml) &&
      /function\s+buildTranslatePromptWithSettings\s*\(/.test(indexHtml),
    'WORK 2 translation settings snapshot helpers are present'
  );

  const translationStart = indexHtml.indexOf('async function runTranslation(');
  const translationEnd = indexHtml.indexOf('\n  var batchInProgress', translationStart);
  const translationBody = indexHtml.slice(translationStart, translationEnd);
  assert(
    translationBody.includes('settingsSnapshot') &&
      translationBody.includes('settingsSnapshot:translationSettingsSnapshot') &&
      translationBody.includes('buildTranslatePromptWithSettings(proj, previousTail, chunks[i], translationSettingsSnapshot)') &&
      translationBody.includes('pendingResume = {') &&
      translationBody.includes('settingsSnapshot: translationSettingsSnapshot'),
    'single translation snapshots settings through job, prompt, and resume context'
  );

  assert(
    /async function prepareTranslationRecovery\([\s\S]*?settingsSnapshot:\s*normalizeTranslationSettingsSnapshot\(job\.settingsSnapshot, job\.provider, job\.model, job\.chunkSize\)/.test(indexHtml),
    'single-job recovery preserves translation settings snapshot'
  );

  const batchTranslationStart = indexHtml.indexOf('async function runSingleTranslationForBatch(');
  const batchTranslationEnd = indexHtml.indexOf('\n  async function runBatchImport', batchTranslationStart);
  const batchTranslationBody = indexHtml.slice(batchTranslationStart, batchTranslationEnd);
  assert(
    batchTranslationBody.includes('batchSettingsSnapshot') &&
      batchTranslationBody.includes('settingsSnapshot:batchSettingsSnapshot') &&
      batchTranslationBody.includes('buildTranslatePromptWithSettings(proj, previousTail, chunks[i], batchSettingsSnapshot)'),
    'batch translation snapshots settings through job and prompt context'
  );

  const batchRecoveryBody = indexHtml.slice(
    indexHtml.indexOf('async function runBatchTranslationRecovery('),
    indexHtml.indexOf('\n  async function retryBatchTranslationJob', indexHtml.indexOf('async function runBatchTranslationRecovery('))
  );
  assert(
    batchRecoveryBody.includes('recoverySettingsSnapshot') &&
      batchRecoveryBody.includes('settingsSnapshot:recoverySettingsSnapshot') &&
      batchRecoveryBody.includes('buildTranslatePromptWithSettings(state.proj,previousTail,chunks[i],recoverySettingsSnapshot)'),
    'batch recovery preserves translation settings snapshot'
  );

  const retryBodyForSettings = indexHtml.slice(
    indexHtml.indexOf('async function retryBatchTranslationJob('),
    indexHtml.indexOf('\n  async function prepareTranslationRecovery', indexHtml.indexOf('async function retryBatchTranslationJob('))
  );
  assert(
    retryBodyForSettings.includes('retrySettingsSnapshot') &&
      retryBodyForSettings.includes('settingsSnapshot:retrySettingsSnapshot') &&
      retryBodyForSettings.includes('buildTranslatePromptWithSettings(proj,previousTail,chunks[i],retrySettingsSnapshot)'),
    'batch retry preserves translation settings snapshot'
  );

  const repairHandlerStart = indexHtml.indexOf("repairBtn.addEventListener('click', async function(){");
  const repairHandlerEnd = indexHtml.indexOf('\n  cancelBtn.addEventListener', repairHandlerStart);
  const repairHandlerBody = indexHtml.slice(repairHandlerStart, repairHandlerEnd);
  assert(
    repairHandlerStart >= 0 &&
      repairHandlerBody.includes('var repairContext = captureAppContext') &&
      repairHandlerBody.includes('var repairSourceSnapshot = text') &&
      repairHandlerBody.includes('if(!isAppContextCurrent(repairContext) || inputText.value.trim() !== repairSourceSnapshot) return;') &&
      repairHandlerBody.includes('if(err.name !== \'AbortError\' && isAppContextCurrent(repairContext))'),
    'OCR Repair rejects stale result/error UI and stale source writes'
  );

  const surgicalStart = indexHtml.indexOf('async function runSurgicalGlossaryFixWithAI(');
  const surgicalEnd = indexHtml.indexOf('\n  async function runTranslation(', surgicalStart);
  const surgicalBody = indexHtml.slice(surgicalStart, surgicalEnd);
  assert(
    surgicalBody.includes('var surgicalContext = captureAppContext') &&
      surgicalBody.includes('var surgicalOutputSnapshot = output.textContent') &&
      surgicalBody.includes('if(!isAppContextCurrent(surgicalContext) || output.textContent !== surgicalOutputSnapshot) return;') &&
      surgicalBody.includes('if(err.name !== \'AbortError\' && isAppContextCurrent(surgicalContext))'),
    'Surgical Glossary AI rejects stale result/error UI and stale output writes'
  );

  const ingestStart = indexHtml.indexOf('async function importExternalChapter(');
  const ingestEnd = indexHtml.indexOf('\n\n  // ดักฟังสัญญาณ', ingestStart);
  const ingestBody = indexHtml.slice(ingestStart, ingestEnd);
  assert(
    ingestBody.includes('advanceAppContextGeneration();') &&
      /setTimeout\(function\(\)\s*\{[\s\S]*?if\(!isAppContextCurrent\(ingestContext\)\s*\|\|\s*aiBusy\)\s*return;/.test(ingestBody) &&
      /if\(!targetBook\s*\|\|\s*!isAppContextCurrent\(ingestContext\)\)\s*return;/.test(ingestBody) &&
      ingestBody.includes('chapterTitle.value = finalTitle;'),
    'background title translation invalidates stale ingestion and auto-start timer'
  );

  assert(
    /readerOverlay\.addEventListener\('scroll',[\s\S]*?var readerScrollBook = readerCurrentBook;[\s\S]*?readerCurrentBook === readerScrollBook[\s\S]*?readerOverlay\.classList\.contains\('show'\)/.test(indexHtml),
    'Reader scroll debounce writes only to captured visible Book'
  );

  assert(
    /async function runTranslation\([\s\S]*?if\(isAppContextCurrent\(translationContext\)\)\{[\s\S]*?pendingResume\s*=\s*\{[\s\S]*?showError\(/.test(indexHtml),
    'single translation error UI remains context-bound'
  );

  const ttsPlayStart = indexHtml.indexOf('function playTts(){');
  const ttsPauseStart = indexHtml.indexOf('function pauseTts(){', ttsPlayStart);
  const ttsStopStart = indexHtml.indexOf('function stopTts(){', ttsPauseStart);
  assert(ttsPlayStart >= 0 && ttsPauseStart > ttsPlayStart && ttsStopStart > ttsPauseStart, 'WORK 4 TTS controls remain auditable');
  const ttsPlayBody = indexHtml.slice(ttsPlayStart, ttsPauseStart);
  const ttsPauseBody = indexHtml.slice(ttsPauseStart, ttsStopStart);
  assert(
    ttsPlayBody.includes("ttsState === 'paused' && ttsIndex >= 0") &&
      ttsPlayBody.includes('window.speechSynthesis.resume();') &&
      ttsPlayBody.includes('updatePlayPauseIcon();') &&
      !ttsPlayBody.includes('speakIndex(ttsIndex);'),
    'B09 TTS resume uses speechSynthesis.resume without restarting the current item'
  );
  assert(
    ttsPauseBody.includes("ttsState = 'paused';") &&
      ttsPauseBody.includes('window.speechSynthesis.pause();') &&
      !ttsPauseBody.includes('window.speechSynthesis.cancel();'),
    'B09 TTS pause preserves the active utterance for resume'
  );

  const ttsNextStart = indexHtml.indexOf("ttsNextBtn.addEventListener('click', function(){");
  const ttsNextEnd = indexHtml.indexOf('\n  });', ttsNextStart);
  const ttsNextBody = indexHtml.slice(ttsNextStart, ttsNextEnd);
  assert(
    ttsNextStart >= 0 &&
      ttsNextEnd > ttsNextStart &&
      ttsNextBody.includes('if(ttsIndex >= ttsQueue.length - 1) return;') &&
      ttsNextBody.includes('var newIdx = ttsIndex + 1;') &&
      !ttsNextBody.includes('Math.min(ttsQueue.length - 1, ttsIndex + 1)'),
    'B10 TTS Next stops at the final queue item without replaying it'
  );

  const copyStart = indexHtml.indexOf("copyBtn.addEventListener('click', function(){");
  const copyEnd = indexHtml.indexOf('downloadBtn.addEventListener', copyStart + 1);
  const copyBody = indexHtml.slice(copyStart, copyEnd);
  assert(
    copyStart >= 0 &&
      copyEnd > copyStart &&
      copyBody.includes('.catch(function(err){') &&
      copyBody.includes("console.error('Clipboard copy failed:'") &&
      copyBody.includes('showError('),
    'B11 clipboard rejection is handled without an unhandled Promise rejection'
  );

  const downloadStart = indexHtml.indexOf("downloadBtn.addEventListener('click', function(){");
  const downloadEnd = indexHtml.indexOf('var SRI_MAP', downloadStart + 1);
  const downloadBody = indexHtml.slice(downloadStart, downloadEnd);
  assert(
    downloadStart >= 0 &&
      downloadEnd > downloadStart &&
      downloadBody.includes('var objectUrl = URL.createObjectURL(blob);') &&
      downloadBody.includes('URL.revokeObjectURL(objectUrl);') &&
      downloadBody.includes('setTimeout(function(){ URL.revokeObjectURL(objectUrl); }, 0);'),
    'B12 result download revokes its object URL after triggering the download'
  );

  const staleTimerPattern = /setTimeout\(function\(\)\s*\{\s*if\s*\(readerCurrentBook\)\s*\{/;
  assert(!staleTimerPattern.test(indexHtml), 'Reader stale mutable-book timer pattern is absent');

  console.log('');
  console.log('Regression Gate: PASS');
}

try {
  main();
} catch (error) {
  console.error('');
  console.error(`Regression Gate: FAIL — ${error.message}`);
  process.exitCode = 1;
}
