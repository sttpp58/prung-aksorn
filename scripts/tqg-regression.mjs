#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

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
function fail(message) {
  throw new Error(message);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}
function describeChildFailure(file, result) {
  const status = result.error
    ? 'spawn error: ' + result.error.message
    : result.signal
      ? 'signal: ' + result.signal
      : 'exit code: ' + result.status;
  const stdout = result.stdout ? '\nstdout:\n' + result.stdout.trim() : '';
  const stderr = result.stderr ? '\nstderr:\n' + result.stderr.trim() : '';
  return file + ' failed (' + status + ')' + stdout + stderr;
}
function runPhaseRegression(file) {
  const result = spawnSync(process.execPath, [path.join(ROOT, file)], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });

  if (result.status !== 0) {
    fail(describeChildFailure(file, result));
  }

  check(
    /PASS/.test(result.stdout) && !/FAIL/.test(result.stdout),
    file + ' completed successfully'
  );
}

const corpus = JSON.parse(read('tests/tqg/corpus-public.json'));
const TQG = requireFromRoot(path.join(ROOT, 'tqg.js'));
const Inspector = requireFromRoot(path.join(ROOT, 'tqg-inspector.js'));
const Repair = requireFromRoot(path.join(ROOT, 'tqg-repair.js'));
const Integration = requireFromRoot(path.join(ROOT, 'tqg-integration.js'));
check(corpus.schemaVersion === '1.0', 'public corpus schema is v1.0');
check(corpus.corpusVersion === 'TQG-V1-2026-09-30-r1', 'public corpus version is locked');
check(corpus.caseCount === 120, 'public corpus declares 120 cases');
check(corpus.cases.length === corpus.caseCount, 'public corpus case count matches data');
check(
  JSON.stringify(countBy(corpus.cases, (item) => item.category)) ===
    JSON.stringify(corpus.categoryCounts),
  'public corpus category counts match metadata'
);
check(
  JSON.stringify(countBy(corpus.cases, (item) => item.expected.status)) ===
    JSON.stringify(corpus.expectedStatusCounts),
  'public corpus expected-status counts match metadata'
);

const ids = new Set();
for (const testCase of corpus.cases) {
  check(!ids.has(testCase.id), testCase.id + ': corpus id is unique');
  ids.add(testCase.id);
  check(testCase.safety?.publicSafe === true, testCase.id + ': publicSafe is true');
  check(testCase.safety?.syntheticOrMinimal === true, testCase.id + ': fixture is synthetic/minimal');
  check(testCase.safety?.copyrightedFullText === false, testCase.id + ': no copyrighted full text');
  check(typeof testCase.sourceText === 'string', testCase.id + ': sourceText is string');
  check(typeof testCase.targetText === 'string', testCase.id + ': targetText is string');
  check(typeof testCase.glossaryText === 'string', testCase.id + ': glossaryText is string');
}
for (const phase of [
  'tests/tqg/tqg03-exception-regression.mjs',
  'tests/tqg/tqg04-suspicion-regression.mjs',
  'tests/tqg/tqg05-ai-inspector-regression.mjs',
  'tests/tqg/tqg06-targeted-repair-regression.mjs',
  'tests/tqg/tqg-repair-production-contract-regression.mjs',
  'tests/tqg/tqg07-quality-ui-regression.mjs',
  'tests/tqg/tqg08-integration-regression.mjs',
  'tests/tqg/tqg-d2-observability-regression.mjs',
  'tests/tqg/tqg-d3-privacy-cost-regression.mjs',
  'tests/tqg/tqg-d4-telemetry-isolation-regression.mjs',
  'tests/tqg/tqg-d5-performance-regression.mjs',
  'tests/tqg/tqg-c1-equivalence-regression.mjs'
]) {
  runPhaseRegression(phase);
}

check(TQG.version === 'TQG-04-2026-09-30', 'TQG detector/classifier version is locked');
check(Inspector.version === 'TQG-05-2026-09-30', 'TQG Inspector version is locked');
check(Repair.version === 'TQG-06-2026-09-30', 'TQG Repair version is locked');
check(Integration.version === 'TQG-08-2026-09-30', 'TQG Integration version is locked');
check(TQG.CONFIG.truncationRatio > 0, 'TQG configuration is available');
const observedStatusCounts = {};
const observedFindingCodes = new Set();

for (const testCase of corpus.cases) {
  const input = {
    sourceText: testCase.sourceText,
    targetText: testCase.targetText,
    glossaryText: testCase.glossaryText
  };
  const first = TQG.analyze(input);
  const second = TQG.analyze(input);

  check(
    stableJson(first) === stableJson(second),
    testCase.id + ': deterministic result is repeatable'
  );
  check(first.meta.aiCalls === 0, testCase.id + ': deterministic path uses zero AI calls');
  check(first.meta.networkAccess === false, testCase.id + ': deterministic path uses no network');

  observedStatusCounts[first.status] = (observedStatusCounts[first.status] || 0) + 1;

  for (const expectedFinding of testCase.expected.findings || []) {
    const observed = [...first.findings, ...first.suppressedFindings].some(
      (finding) => finding.code === expectedFinding.code
    );
    check(observed, testCase.id + ': expected finding code remains observable');
  }
  for (const finding of first.findings) {
    observedFindingCodes.add(finding.code);
    check(TQG.FINDING_CODES.includes(finding.code), testCase.id + ': finding code is valid');
    const emptyStructuralAnchor = finding.code === 'STRUCTURAL_TRUNCATION' &&
      testCase.targetText.length === 0 &&
      finding.start === 0 &&
      finding.end === 0 &&
      finding.text === '';
    check(
      emptyStructuralAnchor || (finding.start >= 0 && finding.end > finding.start),
      testCase.id + ': finding span is valid'
    );
    check(finding.end <= testCase.targetText.length, testCase.id + ': finding span stays in target');
    check(
      finding.text === testCase.targetText.slice(finding.start, finding.end),
      testCase.id + ': finding text matches target span'
    );
  }
}

// Phase-01 expectedStatusCounts are corpus labels, not a TQG-04 classification contract.
// Classification remains evidence-based and must not be forced to match category-label distribution.
console.log('Observed TQG status distribution:', JSON.stringify(observedStatusCounts));
check(
  Object.keys(observedStatusCounts).every((status) => ['PASS', 'REVIEW', 'HIGH_SUSPICION'].includes(status)),
  'full 120-case corpus uses only locked TQG statuses'
);
for (const code of TQG.FINDING_CODES) {
  check(observedFindingCodes.has(code), 'corpus exercises finding code: ' + code);
}

const passCategories = [
  'clean',
  'legitimate_foreign_name',
  'legitimate_foreign_term',
  'glossary_exception'
];
for (const category of passCategories) {
  for (const testCase of corpus.cases.filter((item) => item.category === category)) {
    const result = TQG.analyze(testCase);
    check(result.status === 'PASS', testCase.id + ': legitimate/clean category remains PASS');
    check(result.findings.length === 0, testCase.id + ': PASS category has no active findings');
  }
}
const highCategories = [
  'mixed_language_contamination',
  'full_source_copy',
  'structural_truncation',
  'paragraph_loss',
  'prompt_meta_leakage'
];
for (const category of highCategories) {
  for (const testCase of corpus.cases.filter((item) => item.category === category)) {
    check(
      TQG.analyze(testCase).status === 'HIGH_SUSPICION',
      testCase.id + ': high-signal anomaly remains HIGH_SUSPICION'
    );
  }
}

for (const testCase of corpus.cases.filter((item) =>
  ['repeated_text', 'pua_anomaly', 'quote_anomaly'].includes(item.category)
)) {
  const result = TQG.analyze(testCase);
  check(result.status === 'REVIEW', testCase.id + ': isolated anomaly remains REVIEW');
}

for (const testCase of corpus.cases.filter((item) => item.category === 'source_language_residue')) {
  const result = TQG.analyze(testCase);
  check(
    ['REVIEW', 'HIGH_SUSPICION'].includes(result.status),
    testCase.id + ': source residue never becomes PASS'
  );
}
for (const testCase of corpus.cases.filter((item) => item.category === 'targeted_repair')) {
  check(
    TQG.analyze(testCase).status !== 'PASS',
    testCase.id + ': repair candidate remains suspicious before repair'
  );
}

const mixed = TQG.analyze({
  sourceText: 'He walked inside.',
  targetText: 'เขา walked inside',
  glossaryText: ''
});
check(
  mixed.findings.some((finding) => finding.code === 'MIXED_LANGUAGE_SPAN'),
  'mixed-language contamination emits MIXED_LANGUAGE_SPAN'
);
check(
  mixed.findings.some((finding) => finding.code === 'SOURCE_TEXT_OVERLAP'),
  'mixed-language overlap emits SOURCE_TEXT_OVERLAP evidence'
);

const overlapOnly = TQG.classifySuspicion([{
  code: 'SOURCE_TEXT_OVERLAP',
  severity: 'medium',
  start: 0,
  end: 5,
  text: 'ready',
  evidence: { matchType: 'exact-normalized-token-overlap' }
}]);
check(overlapOnly.status === 'REVIEW', 'source overlap alone remains evidence-level REVIEW');

const sourceCopy = TQG.analyze({
  sourceText: 'He opened the door.',
  targetText: 'He opened the door.',
  glossaryText: ''
});
check(sourceCopy.status === 'HIGH_SUSPICION', 'exact source copy is HIGH_SUSPICION');
check(
  sourceCopy.findings.some(
    (finding) => finding.code === 'SOURCE_TEXT_OVERLAP' &&
      finding.evidence?.matchType === 'exact-source-copy'
  ),
  'exact source copy records explicit overlap evidence'
);
const explicitException = TQG.analyze({
  sourceText: 'The captain joined the Dragon Clan and marched on.',
  targetText: 'แม่ทัพเข้าร่วม Dragon Clan and marched on.',
  glossaryText: '',
  exceptions: [{
    type: 'known_term',
    text: 'Dragon Clan',
    findingCodes: ['FOREIGN_SCRIPT_SPAN'],
    reason: 'explicit known terminology'
  }]
});
check(
  explicitException.suppressedFindings.some(
    (finding) => finding.code === 'FOREIGN_SCRIPT_SPAN'
  ),
  'exception suppresses only the requested finding'
);
check(
  explicitException.findings.some((finding) => finding.code === 'SOURCE_LANGUAGE_RESIDUE'),
  'exception does not suppress unrelated source residue'
);
check(
  explicitException.findings.some((finding) => finding.code === 'SOURCE_TEXT_OVERLAP'),
  'exception does not suppress unrelated overlap evidence'
);

const structural = TQG.analyze({
  sourceText: 'First event. Second event. Third event. Fourth event.',
  targetText: 'เหตุการณ์แรก',
  glossaryText: ''
});
check(
  structural.findings.some((finding) => finding.code === 'STRUCTURAL_TRUNCATION'),
  'structural truncation remains detectable'
);

const paragraphs = TQG.analyze({
  sourceText: 'First paragraph contains several words.\n\nSecond paragraph also contains several words.',
  targetText: 'ย่อหน้าแรก',
  glossaryText: ''
});
check(
  paragraphs.findings.some((finding) => finding.code === 'PARAGRAPH_LOSS'),
  'paragraph loss remains detectable'
);

const emptyTarget = TQG.analyze({
  sourceText: 'Something happened.',
  targetText: '',
  glossaryText: ''
});
check(
  emptyTarget.status === 'HIGH_SUSPICION',
  'empty target output cannot classify as PASS'
);
check(
  emptyTarget.findings.some(
    (finding) =>
      finding.code === 'STRUCTURAL_TRUNCATION' &&
      finding.start === 0 &&
      finding.end === 0 &&
      finding.text === '' &&
      finding.evidence?.reason === 'empty-target-output'
  ),
  'empty target output records a zero-width structural truncation anchor'
);
const whitespaceTarget = TQG.analyze({
  sourceText: 'Something happened.',
  targetText: '   \n\t',
  glossaryText: ''
});
check(
  whitespaceTarget.status === 'HIGH_SUSPICION',
  'whitespace-only target output cannot classify as PASS'
);
check(
  whitespaceTarget.findings.some((finding) => finding.code === 'STRUCTURAL_TRUNCATION'),
  'whitespace-only target output records structural truncation'
);

const multiSentenceEmptyTarget = TQG.analyze({
  sourceText: 'First event. Second event. Third event.',
  targetText: '',
  glossaryText: ''
});
check(
  multiSentenceEmptyTarget.status === 'HIGH_SUSPICION',
  'multi-sentence empty target output cannot classify as PASS'
);

const paragraphEmptyTarget = TQG.analyze({
  sourceText: 'First paragraph has content.\n\nSecond paragraph has content.',
  targetText: '',
  glossaryText: ''
});
check(
  paragraphEmptyTarget.status === 'HIGH_SUSPICION',
  'paragraph-level empty target output cannot classify as PASS'
);

const twoToOneTruncation = TQG.analyze({
  sourceText: 'First event. Second event.',
  targetText: 'เหตุการณ์แรก',
  glossaryText: ''
});
check(
  twoToOneTruncation.status === 'HIGH_SUSPICION',
  '2-to-1 low-ratio sentence truncation is detected'
);
check(
  twoToOneTruncation.findings.some(
    (finding) =>
      finding.code === 'STRUCTURAL_TRUNCATION' &&
      finding.evidence?.reason === 'source-sentence-count-drop-and-length-ratio'
  ),
  '2-to-1 truncation records explicit structural evidence'
);

const twoToOneMergedTranslation = TQG.analyze({
  sourceText: 'He opened the door. The room was dark.',
  targetText: 'เขาเปิดประตู จากนั้นเขาพบว่าห้องนั้นมืดและไม่มีแสงไฟ',
  glossaryText: ''
});
check(
  twoToOneMergedTranslation.status === 'PASS',
  '2-to-1 full translation with sufficient length is not flagged'
);

let emptyInspectorCalls = 0;
const emptyInspector = await Inspector.inspect({
  analysis: emptyTarget,
  sourceContext: 'Something happened.',
  targetContext: '',
  findings: emptyTarget.findings,
  suspiciousSpan: emptyTarget.findings[0],
  transport: async () => {
    emptyInspectorCalls += 1;
    return JSON.stringify({
      verdict: 'TRUE_ANOMALY',
      repairable: true,
      reason: 'Empty target output is a confirmed structural anomaly.',
      replacementHint: 'Do not reconstruct missing output in V1.'
    });
  }
});
check(emptyInspector.status === 'COMPLETED', 'empty-target structural anchor is inspectable');
check(emptyInspector.verdict === 'TRUE_ANOMALY', 'empty-target Inspector verdict is preserved');
check(emptyInspector.span.end === emptyInspector.span.start, 'empty-target Inspector preserves zero-width anchor');
check(emptyInspector.repairable === false, 'empty-target Inspector disallows bounded repair');
check(emptyInspectorCalls === 1, 'empty-target Inspector uses one transport call');

const promptLeak = TQG.analyze({
  sourceText: 'The gate opened.',
  targetText: 'Translation: ประตูเปิดแล้ว',
  glossaryText: ''
});
check(
  promptLeak.findings.some((finding) => finding.code === 'PROMPT_LEAKAGE'),
  'prompt leakage remains detectable'
);
const cleanInspectorCalls = { count: 0 };
const cleanInspection = await Inspector.inspect({
  analysis: TQG.analyze({
    sourceText: 'He closed the door.',
    targetText: 'เขาปิดประตู',
    glossaryText: ''
  }),
  findings: [],
  sourceContext: 'He closed the door.',
  targetContext: 'เขาปิดประตู',
  transport: async () => {
    cleanInspectorCalls.count += 1;
    return '';
  }
});
check(cleanInspection.status === 'NOT_REQUIRED', 'PASS result does not require AI inspection');
check(cleanInspectorCalls.count === 0, 'PASS result makes zero Inspector transport calls');

const repairCandidate = TQG.analyze({
  sourceText: 'He looked at me and smiled.',
  targetText: 'เขามองมาที่ฉัน and smiled',
  glossaryText: ''
});
check(repairCandidate.status === 'HIGH_SUSPICION', 'repair candidate reaches suspicious state');

let inspectorCalls = 0;
const inspected = await Inspector.inspect({
  analysis: repairCandidate,
  sourceContext: 'He looked at me and smiled.',
  targetContext: 'เขามองมาที่ฉัน and smiled',
  glossaryContext: '',
  findings: repairCandidate.findings,
  suspiciousSpan: repairCandidate.findings[0],
  transport: async () => {
    inspectorCalls += 1;
    return JSON.stringify({
      verdict: 'TRUE_ANOMALY',
      repairable: true,
      reason: 'Localized source residue.',
      replacementHint: 'repair only the flagged span'
    });
  }
});
check(inspected.status === 'COMPLETED', 'Inspector accepts a valid structured result');
check(inspected.verdict === 'TRUE_ANOMALY', 'Inspector verdict is preserved');
check(inspected.repairable === true, 'Inspector repairable flag is preserved');
check(inspectorCalls === 1, 'Inspector uses one transport call for one inspection');
const falsePositive = Inspector.parseInspectorResponse(
  JSON.stringify({
    verdict: 'FALSE_POSITIVE',
    repairable: true,
    reason: 'Preserved technical name.',
    replacementHint: 'do not modify'
  })
);
check(falsePositive.verdict === 'FALSE_POSITIVE', 'Inspector validates FALSE_POSITIVE verdict');
check(falsePositive.repairable === false, 'FALSE_POSITIVE cannot be marked repairable');

const malformedInspector = await Inspector.inspect({
  analysis: repairCandidate,
  sourceContext: 'He looked at me and smiled.',
  targetContext: 'เขามองมาที่ฉัน and smiled',
  findings: repairCandidate.findings,
  suspiciousSpan: repairCandidate.findings[0],
  transport: async () => '{"invalid":true}'
});
check(malformedInspector.status === 'ERROR', 'malformed Inspector response fails closed');
check(malformedInspector.verdict === 'UNCERTAIN', 'malformed Inspector response becomes UNCERTAIN');
check(malformedInspector.repairable === false, 'malformed Inspector response cannot authorize repair');

const boundedInspector = Inspector.buildInspectorRequest({
  sourceContext: 'S'.repeat(5000),
  targetContext: 'ก่อน suspicious span หลัง',
  suspiciousSpan: { start: 5, end: 19 },
  glossaryContext: 'G'.repeat(5000),
  findings: repairCandidate.findings
});
check(boundedInspector.contextMeta.sourceChars <= 1600, 'Inspector source context remains bounded');
check(boundedInspector.contextMeta.glossaryChars <= 800, 'Inspector glossary context remains bounded');
check(boundedInspector.contextMeta.targetContextChars <= 1250, 'Inspector target context remains bounded');
let repairTransportCalls = 0;
const repairRequestAnalysis = TQG.analyze({
  sourceText: 'She opened the door and walked inside.',
  targetText: 'นางเปิดประตูแล้ว walked inside',
  glossaryText: ''
});
const repairSpan = repairRequestAnalysis.findings.find(
  (finding) => finding.code === 'SOURCE_LANGUAGE_RESIDUE'
) || repairRequestAnalysis.findings[0];

const repairResult = await Repair.repair({
  analysis: repairRequestAnalysis,
  originalAnalysis: repairRequestAnalysis,
  targetContext: 'นางเปิดประตูแล้ว walked inside',
  sourceContext: 'She opened the door and walked inside.',
  glossaryContext: '',
  findings: repairRequestAnalysis.findings,
  suspiciousSpan: repairSpan,
  inspectorResult: {
    status: 'COMPLETED',
    verdict: 'TRUE_ANOMALY',
    repairable: true,
    reason: 'Localized residue.',
    replacementHint: 'translate the exact span'
  },
  transport: async () => {
    repairTransportCalls += 1;
    return JSON.stringify({ replacementText: 'เดินเข้าไปข้างใน' });
  },
  analyze: (input) => TQG.analyze(input)
});
check(repairResult.status === 'ACCEPTED', 'confirmed localized repair can be accepted');
check(repairResult.accepted === true, 'accepted repair sets accepted=true');
check(
  repairResult.output === 'นางเปิดประตูแล้ว เดินเข้าไปข้างใน',
  'accepted repair changes only bounded output'
);
check(repairResult.meta.revalidated === true, 'accepted repair is revalidated');
check(repairTransportCalls === 1, 'accepted repair uses one AI transport call');

const rejectedRepair = await Repair.repair({
  analysis: repairRequestAnalysis,
  originalAnalysis: repairRequestAnalysis,
  targetContext: 'นางเปิดประตูแล้ว walked inside',
  sourceContext: 'She opened the door and walked inside.',
  findings: repairRequestAnalysis.findings,
  suspiciousSpan: repairSpan,
  inspectorResult: {
    status: 'COMPLETED',
    verdict: 'FALSE_POSITIVE',
    repairable: false,
    reason: 'legitimate',
    replacementHint: ''
  },
  transport: async () => {
    throw new Error('must not be called');
  },
  analyze: (input) => TQG.analyze(input)
});
check(rejectedRepair.status === 'REJECTED', 'unconfirmed repair is rejected without mutation');
check(
  rejectedRepair.output === 'นางเปิดประตูแล้ว walked inside',
  'rejected repair preserves original output'
);

const validationFailure = await Repair.repair({
  analysis: repairRequestAnalysis,
  originalAnalysis: repairRequestAnalysis,
  targetContext: 'นางเปิดประตูแล้ว walked inside',
  sourceContext: 'She opened the door and walked inside.',
  findings: repairRequestAnalysis.findings,
  suspiciousSpan: repairSpan,
  inspectorResult: {
    status: 'COMPLETED',
    verdict: 'TRUE_ANOMALY',
    repairable: true,
    reason: 'confirmed',
    replacementHint: 'repair span'
  },
  transport: async () => JSON.stringify({ replacementText: 'เดินเข้าไปข้างใน' }),
  analyze: () => ({
    status: 'REVIEW',
    findings: [{
      code: 'REPEATED_TEXT',
      severity: 'medium',
      start: 0,
      end: 5,
      text: 'เกิดซ้ำ'
    }]
  })
});
check(validationFailure.status === 'REJECTED', 're-validation failure rejects repair');
check(validationFailure.accepted === false, 're-validation failure cannot set accepted=true');
check(
  validationFailure.output === 'นางเปิดประตูแล้ว walked inside',
  're-validation failure preserves original output'
);

assert.throws(
  () => Repair.applyBoundedReplacement(
    'prefix old suffix',
    { start: 7, end: 10, text: 'NEW' },
    'fixed'
  ),
  /stale|match target text/,
  'stale repair span is rejected'
);
pass('stale repair span is rejected');
const incomplete = Integration.analyzeCompletedOutput({
  completed: false,
  sourceText: 'source',
  targetText: 'target',
  analyze: () => { throw new Error('must not call'); }
});
check(incomplete.status === 'NOT_RUN', 'integration ignores incomplete output');

let integrationAnalyzeCalls = 0;
const integrated = Integration.analyzeCompletedOutput({
  completed: true,
  sourceText: 'He walked inside.',
  targetText: 'เขา walked inside',
  glossaryText: '',
  analyze: (input) => {
    integrationAnalyzeCalls += 1;
    return TQG.analyze(input);
  }
});
check(integrated.status === 'COMPLETED', 'integration analyzes completed output');
check(integrationAnalyzeCalls === 1, 'integration invokes deterministic analyzer once');
check(integrated.analysis.status === 'HIGH_SUSPICION', 'integration preserves TQG classification');
let integrationInspectorCalls = 0;
const inspectedIntegrated = await Integration.inspectCompletedOutput({
  completed: true,
  analysis: integrated.analysis,
  sourceText: 'He walked inside.',
  targetText: 'เขา walked inside',
  findings: integrated.analysis.findings,
  suspiciousSpan: integrated.analysis.findings[0],
  inspector: {
    inspect: async (input) => {
      integrationInspectorCalls += 1;
      assert.equal(input.analysis, integrated.analysis);
      return {
        status: 'COMPLETED',
        verdict: 'FALSE_POSITIVE',
        repairable: false,
        reason: 'test'
      };
    }
  }
});
check(
  inspectedIntegrated.status === 'COMPLETED',
  'integration passes completed analysis to Inspector'
);
check(
  integrationInspectorCalls === 1,
  'integration Inspector call is explicit'
);

const skippedInspect = await Integration.inspectCompletedOutput({
  completed: false,
  analysis: integrated.analysis,
  inspector: {
    inspect: async () => { throw new Error('must not call'); }
  }
});
check(skippedInspect.status === 'NOT_RUN', 'incomplete integration never calls Inspector');
const integratedRepair = await Integration.repairConfirmedAnomaly({
  completed: true,
  analysis: integrated.analysis,
  originalAnalysis: integrated.analysis,
  sourceText: 'He walked inside.',
  targetText: 'เขา walked inside',
  findings: integrated.analysis.findings,
  suspiciousSpan: integrated.analysis.findings[0],
  inspectorResult: {
    status: 'COMPLETED',
    verdict: 'TRUE_ANOMALY',
    repairable: true,
    reason: 'confirmed'
  },
  repairer: {
    repair: async (input) => ({
      status: 'REJECTED',
      accepted: false,
      output: input.targetContext
    })
  },
  analyze: (input) => TQG.analyze(input)
});
check(integratedRepair.status === 'REJECTED', 'integration exposes bounded repair result');
check(
  integratedRepair.output === 'เขา walked inside',
  'rejected integrated repair preserves output'
);

const skippedRepair = await Integration.repairConfirmedAnomaly({
  completed: false,
  analysis: integrated.analysis,
  inspectorResult: { verdict: 'TRUE_ANOMALY', repairable: true },
  repairer: { repair: async () => { throw new Error('must not call'); } }
});
check(skippedRepair.status === 'NOT_RUN', 'incomplete integration never calls Repair');
function functionBody(source, functionName) {
  const pattern = new RegExp(
    '(?:async\\s+)?function\\s+' + functionName + '\\s*\\('
  );
  const match = pattern.exec(source);
  if (!match) return '';
  const braceStart = source.indexOf('{', match.index);
  if (braceStart < 0) return '';

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === String.fromCharCode(96)) {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, i + 1);
    }
  }
  return '';
}
const pageSource = read('index.html');
const indexSource = read('app.js');
const appRuntimeSource = fs.readdirSync(path.join(ROOT, 'app'))
  .filter((file) => /^\d\d-.*\.js$/.test(file))
  .sort()
  .map((file) => read('app/' + file))
  .concat(indexSource)
  .join('\n');
const swSource = read('sw.js');
const tqgSource = read('tqg.js');
const inspectorSource = read('tqg-inspector.js');
const repairSource = read('tqg-repair.js');
const integrationSource = read('tqg-integration.js');

for (const [source, file] of [
  [tqgSource, 'tqg.js'],
  [inspectorSource, 'tqg-inspector.js'],
  [repairSource, 'tqg-repair.js'],
  [integrationSource, 'tqg-integration.js']
]) {
  new vm.Script(source, { filename: file });
  pass(file + ' parses as JavaScript');
}

for (const functionName of [
  'runTranslation',
  'runSingleTranslationForBatch',
  'runBatchTranslationRecovery',
  'retryBatchTranslationJob'
]) {
  const body = functionBody(appRuntimeSource, functionName);
  check(body.length > 0, functionName + ' remains statically discoverable');
  const completion = body.lastIndexOf('completeTranslationJob(');
  const tqgCall = body.lastIndexOf('analyzeTQGCompletedOutput(');
  check(
    completion >= 0 && tqgCall > completion,
    functionName + ' runs TQG only after completion'
  );
}
check(
  appRuntimeSource.indexOf('checkpointTranslationJob(') <
    appRuntimeSource.indexOf('analyzeTQGCompletedOutput('),
  'TQG is not introduced before the first checkpoint'
);

const integrationForbidden = [
  'PrungAksornStorageV2',
  'translationJobs',
  'checkpointTranslationJob',
  'updateTranslationJob',
  'localStorage',
  'indexedDB',
  'fetch('
];
for (const token of integrationForbidden) {
  check(
    !integrationSource.includes(token),
    'TQG integration has no forbidden coupling: ' + token
  );
}

for (const token of [
  'PrungAksornStorageV2',
  'translationJobs',
  'checkpointTranslationJob',
  'updateTranslationJob',
  'callOpenAI(',
  'callGemini(',
  'fetch('
]) {
  check(
    !repairSource.includes(token),
    'TQG repair has no forbidden coupling: ' + token
  );
}
check(
  /['"](?:\.\/)?tqg\.js['"]/.test(pageSource) &&
    /['"](?:\.\/)?tqg-inspector\.js['"]/.test(pageSource) &&
    /['"](?:\.\/)?tqg-repair\.js['"]/.test(pageSource) &&
    /['"](?:\.\/)?tqg-ui\.js['"]/.test(pageSource) &&
    /['"](?:\.\/)?tqg-integration\.js['"]/.test(pageSource),
  'index.html loads the complete TQG runtime set'
);

check(
  /['"]\.\/tqg\.js['"]/.test(swSource) &&
    /['"]\.\/tqg-inspector\.js['"]/.test(swSource) &&
    /['"]\.\/tqg-repair\.js['"]/.test(swSource) &&
    /['"]\.\/tqg-ui\.js['"]/.test(swSource) &&
    /['"]\.\/tqg-integration\.js['"]/.test(swSource),
  'Service Worker caches the complete TQG runtime set'
);

check(
  /TQGIntegration\.analyzeCompletedOutput/.test(appRuntimeSource),
  'production integration reaches deterministic TQG through the boundary module'
);
check(
  /state\.source\s*!==\s*'translate'/.test(appRuntimeSource),
  'production TQG actions remain translate-only'
);

const work1RegressionPath = path.join(ROOT, 'tests', 'tqg', 'tqg-work1-semantic-gold-regression.mjs');
check(fs.existsSync(work1RegressionPath), 'WORK 1 semantic-gold regression is present');
const work1Regression = spawnSync(process.execPath, [work1RegressionPath], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024
});
if (work1Regression.status !== 0) {
  fail(describeChildFailure('WORK 1 semantic-gold regression', work1Regression));
}
const work1Result = /TQG WORK 1 Regression: (PASS|DEFERRED)/.exec(work1Regression.stdout);
check(
  Boolean(work1Result),
  'WORK 1 semantic-gold regression passes or explicitly defers without private data'
);

const work2RegressionPath = path.join(ROOT, 'tests', 'tqg', 'tqg-work2-effectiveness-regression.mjs');
check(fs.existsSync(work2RegressionPath), 'WORK 2 effectiveness regression is present');
const work2Regression = spawnSync(process.execPath, [work2RegressionPath], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024
});
if (work2Regression.status !== 0) {
  fail(describeChildFailure('WORK 2 effectiveness regression', work2Regression));
}
check(
  /TQG WORK 2 Regression: PASS/.test(work2Regression.stdout),
  'WORK 2 effectiveness regression passes'
);

console.log('');
console.log('TQG-09 Regression: PASS');
