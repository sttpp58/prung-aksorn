import assert from 'node:assert/strict';
import fs from 'node:fs';
import TQG from '../../tqg.js';
import Repair from '../../tqg-repair.js';

const corpus = JSON.parse(
  fs.readFileSync('tests/tqg/corpus-public.json', 'utf8')
);

function analyzeCase(testCase, targetText = testCase.targetText) {
  return TQG.analyze({
    sourceText: testCase.sourceText,
    targetText,
    glossaryText: testCase.glossaryText
  });
}

let transportCalls = 0;
const repairTransport = async (request) => {
  transportCalls += 1;
  assert.ok(request.systemPrompt.includes('Repair only the exact suspicious span'));
  assert.ok(request.systemPrompt.includes('Preserve all text before and after'));
  assert.ok(request.userPrompt.includes('[SUSPICIOUS SPAN]'));
  assert.ok(request.userPrompt.includes('[REPAIR INSTRUCTION]'));
  const fixture = repairTransport.currentFixture;
  return JSON.stringify({ replacementText: fixture.replacementText });
};

const repairCases = corpus.cases.filter(
  (testCase) => testCase.category === 'targeted_repair'
);
assert.equal(repairCases.length, 6);

for (const testCase of repairCases) {
  const analysis = analyzeCase(testCase);
  const span = analysis.findings.find(
    (finding) => finding.code === 'FOREIGN_SCRIPT_SPAN'
  );
  assert.ok(span, testCase.id + ': expected bounded foreign span');

  const originalTarget = testCase.targetText;
  const fixture = testCase.repair;
  repairTransport.currentFixture = fixture;

  const inspectorResult = {
    status: 'COMPLETED',
    verdict: 'TRUE_ANOMALY',
    repairable: true,
    reason: 'Confirmed localized anomaly.',
    replacementHint: fixture.replacementText
  };

  const result = await Repair.repair({
    inspectorResult,
    sourceContext: testCase.sourceText,
    targetContext: originalTarget,
    suspiciousSpan: span,
    glossaryContext: testCase.glossaryText,
    findings: analysis.findings,
    repairInstruction: fixture.replacementText,
    originalAnalysis: analysis,
    analyze: (targetText) => analyzeCase(testCase, targetText),
    transport: repairTransport
  });

  if (testCase.id === 'TQG-REPAIR-003') {
    assert.equal(
      result.status,
      'REJECTED',
      testCase.id + ': unsafe duplicate output is rejected'
    );
    assert.equal(result.accepted, false);
    assert.equal(result.output, originalTarget);
    assert.equal(result.validation.valid, false);
    assert.equal(
      result.validation.reason,
      'finding-remains-in-repaired-region'
    );
    assert.equal(result.meta.revalidated, true);
  } else {
    assert.equal(result.status, 'ACCEPTED', testCase.id + ': repair accepted');
    assert.equal(result.accepted, true, testCase.id + ': accepted');
    assert.equal(result.output, fixture.expectedTarget, testCase.id + ': expected target');
    assert.equal(result.replacementText, fixture.replacementText);
    assert.equal(result.validation.valid, true);
    assert.equal(result.validation.reason, 'repair-passed-revalidation');
    assert.equal(result.meta.revalidated, true);
  }
}

assert.equal(transportCalls, 6);

const cleanInspector = {
  status: 'COMPLETED',
  verdict: 'FALSE_POSITIVE',
  repairable: false,
  reason: 'Legitimate preserved term.',
  replacementHint: ''
};
const noCall = await Repair.repair({
  inspectorResult: cleanInspector,
  targetContext: 'กัปตันเข้าร่วม Dragon Clan',
  suspiciousSpan: { start: 17, end: 29, text: 'Dragon Clan' },
  transport: async () => {
    throw new Error('must not call transport');
  }
});
assert.equal(noCall.status, 'REJECTED');
assert.equal(noCall.accepted, false);
assert.equal(noCall.output, 'กัปตันเข้าร่วม Dragon Clan');
assert.equal(noCall.reason, 'repair-requires-confirmed-inspector-anomaly');

const uncertain = await Repair.repair({
  inspectorResult: {
    status: 'COMPLETED',
    verdict: 'UNCERTAIN',
    repairable: true,
    reason: 'Insufficient evidence.',
    replacementHint: ''
  },
  targetContext: 'เขารอ and waited',
  suspiciousSpan: { start: 5, end: 15, text: 'and waited' },
  transport: async () => {
    throw new Error('must not call transport');
  }
});
assert.equal(uncertain.status, 'REJECTED');
assert.equal(uncertain.output, 'เขารอ and waited');

const analyzeFail = (targetText) => {
  const start = targetText.indexOf('และยิ้ม');
  return {
    status: 'REVIEW',
    findings: [{
      code: 'SOURCE_LANGUAGE_RESIDUE',
      severity: 'high',
      text: 'new residue',
      start: start >= 0 ? start : 3,
      end: start >= 0 ? start + 'และยิ้ม'.length : 14,
      evidence: { reason: 'introduced' }
    }]
  };
};
const originalFailTarget = 'เขากลับ and smiled';
const failSpanStart = originalFailTarget.indexOf('and smiled');
const failResult = await Repair.repair({
  inspectorResult: {
    status: 'COMPLETED',
    verdict: 'TRUE_ANOMALY',
    repairable: true,
    reason: 'Confirmed.',
    replacementHint: 'และยิ้ม'
  },
  targetContext: originalFailTarget,
  suspiciousSpan: {
    start: failSpanStart,
    end: failSpanStart + 'and smiled'.length,
    text: 'and smiled'
  },
  findings: [{
    code: 'SOURCE_LANGUAGE_RESIDUE',
    severity: 'high',
    text: 'and smiled',
    start: 10,
    end: 20,
    evidence: { matchType: 'exact-normalized-token-overlap' }
  }],
  analyze: analyzeFail,
  transport: async () => JSON.stringify({ replacementText: 'และยิ้ม' })
});
assert.equal(failResult.status, 'REJECTED');
assert.equal(failResult.accepted, false);
assert.equal(failResult.output, originalFailTarget);
assert.equal(failResult.validation.valid, false);
assert.equal(failResult.validation.reason, 'original-finding-remains-in-repaired-region');
assert.equal(failResult.meta.revalidated, true);

const outsideFindingOriginal = {
  status: 'REVIEW',
  findings: [{
    code: 'REPEATED_TEXT',
    severity: 'medium',
    text: 'unchanged outside',
    start: 0,
    end: 16,
    evidence: { reason: 'existing' }
  }]
};
const outsideFindingChanged = Repair.revalidateRepair({
  originalTarget: 'unchanged outside FLAG',
  repairedTarget: 'unchanged outside ดี',
  originalAnalysis: outsideFindingOriginal,
  originalFindingCode: 'SOURCE_LANGUAGE_RESIDUE',
  originalStart: 17,
  originalEnd: 21,
  repairedStart: 17,
  repairedEnd: 20,
  analyze: (targetText) => ({
    status: 'REVIEW',
    findings: [{
      code: 'REPEATED_TEXT',
      severity: 'medium',
      text: 'unchanged outside',
      start: 0,
      end: 16,
      evidence: { reason: 'existing' }
    }, {
      code: 'PUA_OR_REPLACEMENT_CHAR',
      severity: 'medium',
      text: 'new outside',
      start: 1,
      end: 2,
      evidence: { reason: 'new' }
    }]
  })
});
assert.equal(outsideFindingChanged.valid, false);
assert.equal(outsideFindingChanged.reason, 'outside-findings-changed');

assert.throws(
  () => Repair.parseRepairResponse('{"replacementText":""}'),
  /requires replacementText/
);
assert.throws(
  () => Repair.parseRepairResponse(
    JSON.stringify({ replacementText: 'x'.repeat(1001) })
  ),
  /bounded length/
);
assert.throws(
  () => Repair.applyBoundedReplacement(
    'เขาเดิน and smiled',
    { start: 11, end: 21, text: 'stale span' },
    'และยิ้ม'
  ),
  /span/
);

const oversizedRequest = Repair.buildRepairRequest({
  sourceContext: 'S'.repeat(5000),
  targetContext: 'ก่อน '.repeat(500) + 'FLAG' + ' หลัง'.repeat(500),
  suspiciousSpan: {
    start: ('ก่อน '.repeat(500)).length,
    end: ('ก่อน '.repeat(500)).length + 4,
    text: 'FLAG'
  },
  glossaryContext: 'G'.repeat(5000),
  findings: Array.from({ length: 20 }, (_, index) => ({
    code: 'CODE_' + index,
    severity: 'medium',
    text: 'finding ' + index
  })),
  repairInstruction: 'R'.repeat(5000)
});
assert.ok(oversizedRequest.contextMeta.sourceChars <= 1600);
assert.ok(oversizedRequest.contextMeta.glossaryChars <= 800);
assert.ok(oversizedRequest.contextMeta.targetContextChars <= 1250);
assert.ok(oversizedRequest.contextMeta.instructionChars <= 1000);

let abortCalls = 0;
const abortTarget = 'เขากลับ and smiled';
const abortSpanStart = abortTarget.indexOf('and smiled');
await assert.rejects(
  () => Repair.repair({
    inspectorResult: {
      status: 'COMPLETED',
      verdict: 'TRUE_ANOMALY',
      repairable: true,
      reason: 'Confirmed.',
      replacementHint: 'fix'
    },
    targetContext: abortTarget,
    suspiciousSpan: {
      start: abortSpanStart,
      end: abortSpanStart + 'and smiled'.length,
      text: 'and smiled'
    },
    findings: [{
      code: 'SOURCE_LANGUAGE_RESIDUE',
      severity: 'high',
      text: 'and smiled',
      start: 9,
      end: 19
    }],
    analyze: () => ({ status: 'PASS', findings: [] }),
    transport: async () => {
      abortCalls += 1;
      const error = new Error('cancel');
      error.name = 'AbortError';
      throw error;
    }
  }),
  /cancel/
);
assert.equal(abortCalls, 1);

const source = fs.readFileSync('tqg-repair.js', 'utf8');
for (const forbidden of [
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'x-goog-api-key',
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'storage-v2',
  'translationJobs',
  'checkpointTranslationJob',
  'runTranslation',
  'runSingleTranslationForBatch'
]) {
  assert.equal(
    source.includes(forbidden),
    false,
    'forbidden coupling: ' + forbidden
  );
}

assert.ok(Object.isFrozen(Repair.REPAIR_STATUSES));
assert.ok(Object.isFrozen(Repair.DEFAULTS));
assert.equal(Repair.version, 'TQG-06-2026-09-30');

console.log('TQG-06 Targeted Repair regression: PASS');
