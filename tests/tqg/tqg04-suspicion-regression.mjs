import assert from 'node:assert/strict';
import fs from 'node:fs';
import TQG from '../../tqg.js';

function run(input) {
  return TQG.analyze(input);
}

function codes(result) {
  return [...new Set(result.findings.map((finding) => finding.code))].sort();
}

function assertClassification(input, expectedStatus, expectedReason) {
  const result = run(input);
  assert.equal(result.status, expectedStatus);
  assert.equal(result.classification.status, expectedStatus);
  assert.ok(
    result.classification.reasons.includes(expectedReason),
    expectedStatus + ': expected classification reason ' + expectedReason
  );
  assert.deepEqual(result.classification.triggerCodes, codes(result));
  return result;
}
assert.equal(TQG.classifySuspicion([]).status, 'PASS');
assert.deepEqual(TQG.classifySuspicion([]).triggerCodes, []);

const directHigh = TQG.classifySuspicion([{
  code: 'PROMPT_LEAKAGE',
  severity: 'high',
  text: 'Translation:',
  start: 0,
  end: 12,
  evidence: { marker: 'Translation:' }
}]);
assert.equal(directHigh.status, 'HIGH_SUSPICION');
assert.deepEqual(directHigh.triggerCodes, ['PROMPT_LEAKAGE']);
assert.ok(directHigh.reasons.includes('prompt-leakage-detected'));

const directReview = TQG.classifySuspicion([{
  code: 'REPEATED_TEXT',
  severity: 'medium',
  text: 'ประตูเก่า ประตูเก่า',
  start: 0,
  end: 18,
  evidence: { repeats: 2 }
}]);
assert.equal(directReview.status, 'REVIEW');
assert.deepEqual(directReview.triggerCodes, ['REPEATED_TEXT']);
assert.ok(directReview.reasons.includes('review-level-finding:REPEATED_TEXT'));

const directCrossScriptReview = TQG.classifySuspicion([
  {
    code: 'FOREIGN_SCRIPT_SPAN',
    severity: 'medium',
    text: '然后离开了房间',
    start: 0,
    end: 8,
    evidence: { reason: 'foreign-script-span' }
  },
  {
    code: 'SOURCE_LANGUAGE_RESIDUE',
    severity: 'high',
    text: '然后离开了房间',
    start: 0,
    end: 8,
    evidence: { matchType: 'cross-script-source-context' }
  },
  {
    code: 'SOURCE_TEXT_OVERLAP',
    severity: 'high',
    text: '然后离开了房间',
    start: 0,
    end: 8,
    evidence: { matchType: 'cross-script-source-context' }
  }
]);
assert.equal(directCrossScriptReview.status, 'REVIEW');

const directSourceCopy = TQG.classifySuspicion([{
  code: 'SOURCE_TEXT_OVERLAP',
  severity: 'high',
  text: 'The same source is copied.',
  start: 0,
  end: 25,
  evidence: { matchType: 'exact-source-copy' }
}]);
assert.equal(directSourceCopy.status, 'HIGH_SUSPICION');

assertClassification({
  sourceText: 'He looked at me and smiled.',
  targetText: 'เขามองมาที่ฉัน and smiled',
  glossaryText: ''
}, 'HIGH_SUSPICION', 'latin-source-residue-cluster-detected');

assertClassification({
  sourceText: 'Return only the translated text.',
  targetText: 'Sure! เขาเปิดประตู และเดินเข้าไป',
  glossaryText: ''
}, 'HIGH_SUSPICION', 'prompt-leakage-detected');

assertClassification({
  sourceText: 'One. Two. Three. Four.',
  targetText: 'หนึ่ง. สอง.',
  glossaryText: ''
}, 'HIGH_SUSPICION', 'structural-truncation-detected');

assertClassification({
  sourceText: 'First paragraph.\n\nSecond paragraph.',
  targetText: 'ย่อหน้าแรก',
  glossaryText: ''
}, 'HIGH_SUSPICION', 'paragraph-loss-detected');
assertClassification({
  sourceText: 'He closed the door.',
  targetText: 'He closed the door.',
  glossaryText: ''
}, 'HIGH_SUSPICION', 'exact-source-copy-detected');

assertClassification({
  sourceText: 'He walked home.',
  targetText: 'เขาเดินกลับบ้าน and smiled',
  glossaryText: ''
}, 'HIGH_SUSPICION', 'mixed-language-span-detected');

assertClassification({
  sourceText: 'He entered the room.',
  targetText: 'เขาเข้าห้อง',
  glossaryText: ''
}, 'REVIEW', 'review-level-finding:PUA_OR_REPLACEMENT_CHAR');

assertClassification({
  sourceText: 'He said, "Leave now."',
  targetText: 'เขากล่าวว่า "ไปตอนนี้',
  glossaryText: ''
}, 'REVIEW', 'review-level-finding:QUOTE_ANOMALY');

assertClassification({
  sourceText: 'He saw the wall.',
  targetText: 'ประตูเก่า ประตูเก่า',
  glossaryText: ''
}, 'REVIEW', 'review-level-finding:REPEATED_TEXT');
const cautiousCrossScript = assertClassification({
  sourceText: 'He opened the door and left.',
  targetText: 'คนรับใช้โค้งคำนับ然后离开了房间',
  glossaryText: ''
}, 'REVIEW', 'review-level-finding:SOURCE_LANGUAGE_RESIDUE');
assert.ok(cautiousCrossScript.findings.some(
  (finding) => finding.code === 'SOURCE_TEXT_OVERLAP'
));

const exceptionPass = assertClassification({
  sourceText: 'The captain joined the Dragon Clan.',
  targetText: 'กัปตันเข้าร่วม Dragon Clan',
  glossaryText: '',
  exceptions: [{
    type: 'known_term',
    text: 'Dragon Clan',
    findingCodes: [
      'FOREIGN_SCRIPT_SPAN',
      'SOURCE_LANGUAGE_RESIDUE',
      'SOURCE_TEXT_OVERLAP',
      'MIXED_LANGUAGE_SPAN'
    ]
  }]
}, 'PASS', 'no-active-findings');
assert.ok(exceptionPass.suppressedFindings.length > 0);

const partialException = run({
  sourceText: 'The captain joined the Dragon Clan and marched on.',
  targetText: 'แม่ทัพเข้าร่วม Dragon Clan and marched on.',
  glossaryText: '',
  exceptions: [{
    type: 'known_term',
    text: 'Dragon Clan',
    findingCodes: ['FOREIGN_SCRIPT_SPAN']
  }]
});
assert.equal(partialException.status, 'HIGH_SUSPICION');
assert.ok(partialException.findings.some(
  (finding) => finding.code === 'SOURCE_LANGUAGE_RESIDUE'
));
assert.ok(!partialException.suppressedFindings.some(
  (finding) => finding.code === 'SOURCE_LANGUAGE_RESIDUE'
));
const corpus = JSON.parse(
  fs.readFileSync('tests/tqg/corpus-public.json', 'utf8')
);
const counts = {};
const expectedByInput = new Map();

for (const testCase of corpus.cases) {
  const key = JSON.stringify([
    testCase.sourceText,
    testCase.targetText,
    testCase.glossaryText
  ]);
  const entries = expectedByInput.get(key) || [];
  entries.push(testCase);
  expectedByInput.set(key, entries);

  const result = run(testCase);
  counts[result.status] = (counts[result.status] || 0) + 1;

  if (testCase.expected.status === 'PASS') {
    assert.equal(result.status, 'PASS', testCase.id + ': clean/legitimate content stays PASS');
  }

  if (['mixed_language_contamination', 'full_source_copy',
    'structural_truncation', 'paragraph_loss', 'prompt_meta_leakage'].includes(testCase.category)) {
    assert.equal(
      result.status,
      'HIGH_SUSPICION',
      testCase.id + ': high-signal category is HIGH_SUSPICION'
    );
  }

  if (['repeated_text', 'pua_anomaly', 'quote_anomaly'].includes(testCase.category)) {
    assert.equal(
      result.status,
      'REVIEW',
      testCase.id + ': isolated anomaly category is REVIEW'
    );
  }

  if (testCase.category === 'targeted_repair') {
    assert.notEqual(result.status, 'PASS', testCase.id + ': repair candidates remain suspicious');
  }

  if (testCase.category === 'source_language_residue') {
    assert.ok(
      ['REVIEW', 'HIGH_SUSPICION'].includes(result.status),
      testCase.id + ': residue is classified without a false PASS'
    );
  }

  assert.deepEqual(
    result.classification.triggerCodes,
    codes(result),
    testCase.id + ': trigger codes are explainable'
  );
  if (testCase.expected.status === 'PASS') {
    assert.equal(result.findings.length, 0, testCase.id + ': PASS has no active findings');
    assert.deepEqual(result.classification.reasons, ['no-active-findings']);
  } else {
    assert.ok(
      result.classification.reasons.length > 0,
      testCase.id + ': non-PASS classification is explainable'
    );
  }
  assert.equal(result.meta.aiCalls, 0, testCase.id + ': no AI');
  assert.equal(result.meta.networkAccess, false, testCase.id + ': no network');
}

for (const [key, entries] of expectedByInput) {
  if (entries.length < 2) continue;
  const statuses = new Set(entries.map((testCase) => run(testCase).status));
  assert.equal(
    statuses.size,
    1,
    entries.map((entry) => entry.id).join(',') + ': identical input must classify identically'
  );
}

assert.deepEqual(counts, {
  PASS: 42,
  REVIEW: 21,
  HIGH_SUSPICION: 57
});
const source = fs.readFileSync('tqg.js', 'utf8');
for (const forbidden of [
  'storage-v2',
  'translationJobs',
  'checkpointTranslationJob',
  'localStorage',
  'indexedDB',
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'api.openai',
  'generativelanguage',
  'x-goog-api-key'
]) {
  assert.equal(
    source.includes(forbidden),
    false,
    'forbidden core/API coupling: ' + forbidden
  );
}

assert.equal(
  run({
    sourceText: 'He came home.',
    targetText: 'เขากลับบ้าน',
    glossaryText: ''
  }).meta.classificationVersion,
  'TQG-04-2026-09-30'
);

console.log('TQG-04 Suspicion Classification regression: PASS');
