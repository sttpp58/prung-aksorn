#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(import.meta.url);

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function pass(message) {
  console.log('PASS  ' + message);
}

function check(condition, message) {
  assert.ok(condition, message);
  pass(message);
}

const integrationSource = read('tqg-integration.js');
const indexSource = read('index.html');
const swSource = read('sw.js');
const integration = requireFromRoot(path.join(ROOT, 'tqg-integration.js'));

new vm.Script(integrationSource, { filename: 'tqg-integration.js' });
check(/TQG-08-2026-09-30/.test(integrationSource), 'integration module version is TQG-08');
check(typeof integration.isCompletedBoundary === 'function', 'completed-boundary API exists');
check(typeof integration.analyzeCompletedOutput === 'function', 'completed-output analysis API exists');
check(typeof integration.inspectCompletedOutput === 'function', 'Inspector integration API exists');
check(typeof integration.repairConfirmedAnomaly === 'function', 'Repair integration API exists');

let analyzeCalls = 0;
const analyze = (input) => {
  analyzeCalls += 1;
  return { status: 'REVIEW', findings: [{ code: 'SOURCE_LANGUAGE_RESIDUE', start: 2, end: 8, text: 'walked', severity: 'high', evidence: {} }] };
};

const skipped = integration.analyzeCompletedOutput({
  completed: false, sourceText: 'source', targetText: 'target', analyze
});
check(skipped.status === 'NOT_RUN', 'incomplete output never enters TQG');
check(analyzeCalls === 0, 'incomplete output never calls deterministic analyzer');

const completed = integration.analyzeCompletedOutput({
  completed: true, sourceText: 'source', targetText: 'target', glossaryText: 'term', analyze
});
check(completed.status === 'COMPLETED', 'completed output enters TQG analysis');
check(analyzeCalls === 1, 'completed output calls deterministic analyzer exactly once');
check(completed.analysis.status === 'REVIEW', 'analysis result is preserved');
check(completed.meta.aiCalls === 0, 'deterministic analysis makes zero AI calls');

const explicitExceptionInput = {
  completed: true,
  sourceText: 'The dragon clan arrived.',
  targetText: 'กองทัพ dragon clan',
  glossaryText: '',
  exceptions: [{
    type: 'known_term',
    text: 'dragon clan',
    findingCodes: ['FOREIGN_SCRIPT_SPAN'],
    reason: 'integration exception forwarding regression'
  }]
};
const directExceptionAnalysis = requireFromRoot(path.join(ROOT, 'tqg.js')).analyze(explicitExceptionInput);
const integratedException = integration.analyzeCompletedOutput(explicitExceptionInput);
check(
  integratedException.analysis.suppressedFindings.some(
    (finding) => finding.code === 'FOREIGN_SCRIPT_SPAN'
  ),
  'integration forwards explicit TQG exceptions'
);
check(
  !integratedException.analysis.findings.some(
    (finding) => finding.code === 'FOREIGN_SCRIPT_SPAN'
  ),
  'integration preserves the explicit exception suppression result'
);
check(
  JSON.stringify(integratedException.analysis) === JSON.stringify(directExceptionAnalysis),
  'integration exception analysis matches direct TQG analysis'
);

let inspectorCalls = 0;
const inspector = {
  inspect: async (input) => {
    inspectorCalls += 1;
    check(input.analysis === completed.analysis, 'Inspector receives completed TQG analysis');
    check(input.sourceContext === 'source', 'Inspector receives source context');
    return { status: 'COMPLETED', verdict: 'TRUE_ANOMALY', repairable: true, reason: 'confirmed', span: { start: 2, end: 8, text: 'walked' } };
  }
};
const inspectorResult = await integration.inspectCompletedOutput({
  completed: true, analysis: completed.analysis, sourceText: 'source',
  targetText: 'target', glossaryText: 'term', inspector, transport: () => null
});
check(inspectorResult.status === 'COMPLETED', 'Inspector integration returns Inspector result');
check(inspectorCalls === 1, 'Inspector is called only when explicitly requested');

const inspectSkipped = await integration.inspectCompletedOutput({
  completed: false, analysis: completed.analysis, inspector
});
check(inspectSkipped.status === 'NOT_RUN', 'Inspector respects completion boundary');
check(inspectorCalls === 1, 'incomplete Inspector request does not call Inspector');

let repairCalls = 0;
const repairer = {
  repair: async (input) => {
    repairCalls += 1;
    check(input.inspectorResult === inspectorResult, 'Repair receives confirmed Inspector result');
    check(input.originalAnalysis === completed.analysis, 'Repair receives original completed analysis');
    return { status: 'ACCEPTED', accepted: true, output: 'repaired', validation: { valid: true } };
  }
};
const repaired = await integration.repairConfirmedAnomaly({
  completed: true, analysis: completed.analysis, originalAnalysis: completed.analysis,
  sourceText: 'source', targetText: 'target', glossaryText: 'term',
  suspiciousSpan: inspectorResult.span, inspectorResult, repairer,
  transport: () => null, analyze
});
check(repaired.status === 'ACCEPTED', 'Repair integration returns bounded repair result');
check(repairCalls === 1, 'Repair is invoked only after explicit request');

const repairSkipped = await integration.repairConfirmedAnomaly({
  completed: false, analysis: completed.analysis, inspectorResult, repairer
});
check(repairSkipped.status === 'NOT_RUN', 'Repair respects completion boundary');
check(repairCalls === 1, 'incomplete Repair request does not call Repair');

const errorResult = integration.analyzeCompletedOutput({
  completed: true, sourceText: 'source', targetText: 'target',
  analyze: () => { throw new Error('test'); }
});
check(errorResult.status === 'ERROR', 'deterministic TQG failure is isolated as ERROR');

const forbidden = [
  'PrungAksornStorageV2', 'translationJobs', 'checkpointTranslationJob',
  'updateTranslationJob', 'localStorage', 'indexedDB', 'fetch('
];
for (const token of forbidden) {
  check(!integrationSource.includes(token), 'integration module has no forbidden coupling: ' + token);
}

function functionBody(source, functionName) {
  const pattern = new RegExp(String.raw`(?:async\s+)?function\s+${functionName}\s*\(`);
  const match = pattern.exec(source);
  if (!match) return '';
  const start = match.index;
  const braceStart = source.indexOf('{', start);
  if (braceStart < 0) return '';
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

for (const functionName of ['runTranslation', 'runSingleTranslationForBatch', 'runBatchTranslationRecovery', 'retryBatchTranslationJob']) {
  const body = functionBody(indexSource, functionName);
  check(body.length > 0, functionName + ' body is present for integration placement check');
  const completion = body.lastIndexOf('completeTranslationJob(');
  const integrationCall = body.lastIndexOf('analyzeTQGCompletedOutput(');
  check(completion >= 0 && integrationCall > completion, functionName + ' runs TQG only after completion');
  if (functionName === 'runTranslation') {
    const finalOutputRender = body.lastIndexOf('setOutput(translationOutput);');
    check(finalOutputRender >= 0 && integrationCall > finalOutputRender,
      'runTranslation runs TQG only after the final translation output render');
  }
}

const checkpointPos = indexSource.indexOf('checkpointTranslationJob(');
const firstTqgPos = indexSource.indexOf('analyzeTQGCompletedOutput(');
check(checkpointPos < firstTqgPos, 'TQG completion analysis is not placed before the first checkpoint');
const integrationCalls = indexSource.match(/TQGIntegration\.analyzeCompletedOutput/g) || [];
const completionHelperCalls = indexSource.match(/analyzeTQGCompletedOutput\(/g) || [];
check(integrationCalls.length === 1, 'TQG deterministic integration is centralized in one helper');
check(completionHelperCalls.length === 5, 'one helper plus four completed-output integration call sites are present');
check(/function analyzeTQGCompletedOutput\([\s\S]*?state\.source\s*!==\s*'translate'[\s\S]*?try\s*\{[\s\S]*?TQGIntegration\.analyzeCompletedOutput[\s\S]*?catch\s*\(err\)/.test(indexSource), 'TQG completion helper is translate-only and fail-safe');
check(/function isTQGQualityContextCurrent\(\)/.test(indexSource), 'TQG actions have a current-context guard');
check(/function isTQGQualityContextCurrent\(\)\{[\s\S]*?state\.source\s*!==\s*'translate'/.test(indexSource), 'TQG actions remain translate-only');
check(/if\(!isTQGQualityContextCurrent\(\)\)\{/.test(indexSource), 'stale TQG context is rejected before AI actions');
check(/tqg\.js/.test(indexSource) && /tqg-inspector\.js/.test(indexSource) && /tqg-repair\.js/.test(indexSource) && /tqg-integration\.js/.test(indexSource), 'index.html loads all TQG runtime modules');
check(/\.\/tqg\.js/.test(swSource) && /\.\/tqg-inspector\.js/.test(swSource) && /\.\/tqg-repair\.js/.test(swSource) && /\.\/tqg-integration\.js/.test(swSource), 'Service Worker app shell includes all TQG runtime modules');

console.log('');
console.log('TQG-08 Integration Regression: PASS');
