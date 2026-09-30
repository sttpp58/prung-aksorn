import assert from 'node:assert/strict';
import fs from 'node:fs';
import TQG from '../../tqg.js';

function codes(result) {
  return [...new Set(result.findings.map((finding) => finding.code))].sort();
}

function run(input) {
  return TQG.analyze(input);
}

assert.deepEqual(
  codes(run({
    sourceText: 'Ye Fan entered the hall.',
    targetText: 'Ye Fan เดินเข้ามาในโถง',
    glossaryText: ''
  })),
  []
);
assert.ok(
  run({
    sourceText: 'Ye Fan entered the hall.',
    targetText: 'Ye Fan เดินเข้ามาในโถง',
    glossaryText: ''
  }).suppressedFindings.length > 0,
  'preserved name is explained by an exception'
);

assert.deepEqual(
  codes(run({
    sourceText: 'The device connected through Wi-Fi.',
    targetText: 'อุปกรณ์เชื่อมต่อผ่าน Wi-Fi',
    glossaryText: ''
  })),
  []
);
assert.deepEqual(
  codes(run({
    sourceText: 'He traveled to the Azure Dragon Sect.',
    targetText: 'เขาเดินทางไปยัง Azure Dragon Sect',
    glossaryText: 'Azure Dragon Sect = Azure Dragon Sect'
  })),
  []
);

const partial = run({
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
assert.ok(partial.findings.some((finding) => finding.code === 'SOURCE_LANGUAGE_RESIDUE'));
assert.ok(partial.findings.some((finding) => finding.code === 'SOURCE_TEXT_OVERLAP'));
assert.ok(partial.findings.some((finding) => finding.code === 'MIXED_LANGUAGE_SPAN'));
assert.ok(partial.suppressedFindings.some(
  (finding) => finding.code === 'FOREIGN_SCRIPT_SPAN'
));
assert.ok(!partial.suppressedFindings.some(
  (finding) => finding.code === 'SOURCE_LANGUAGE_RESIDUE'
));

const localOnly = run({
  sourceText: 'Ye Fan entered.',
  targetText: 'Ye Fan�',
  glossaryText: ''
});
assert.ok(localOnly.findings.some(
  (finding) => finding.code === 'PUA_OR_REPLACEMENT_CHAR'
));
assert.ok(localOnly.suppressedFindings.some(
  (finding) => finding.code === 'FOREIGN_SCRIPT_SPAN'
));
assert.ok(!localOnly.suppressedFindings.some(
  (finding) => finding.code === 'PUA_OR_REPLACEMENT_CHAR'
));

const repeated = run({
  sourceText: 'He traveled to the Azure Dragon Sect.',
  targetText: 'เขาไปยัง Azure Dragon Sect Azure Dragon Sect',
  glossaryText: 'Azure Dragon Sect = Azure Dragon Sect'
});
assert.ok(repeated.findings.some(
  (finding) => finding.code === 'REPEATED_TEXT'
));
assert.ok(!repeated.findings.some(
  (finding) => finding.code === 'FOREIGN_SCRIPT_SPAN'
));

const invalid = run({
  sourceText: 'The dragon clan arrived.',
  targetText: 'กองทัพ dragon clan',
  glossaryText: '',
  exceptions: [{
    type: 'known_term',
    text: 'dragon clan',
    findingCodes: ['NOT_A_REAL_FINDING_CODE']
  }]
});
assert.ok(invalid.findings.some(
  (finding) => finding.code === 'FOREIGN_SCRIPT_SPAN'
));

assert.ok(Object.isFrozen(TQG.EXCEPTION_CODES));
assert.ok(Object.isFrozen(TQG.EXCEPTION_TYPES));
assert.deepEqual(
  TQG.DEFAULT_EXCEPTION_CODES.glossary,
  TQG.EXCEPTION_CODES
);

const corpus = JSON.parse(
  fs.readFileSync('tests/tqg/corpus-public.json', 'utf8')
);
for (const testCase of corpus.cases) {
  const result = run(testCase);
  const expected = new Set(
    (testCase.expected.findings || []).map((finding) => finding.code)
  );
  const actual = new Set(result.findings.map((finding) => finding.code));
  for (const code of expected) {
    assert.ok(actual.has(code), testCase.id + ': finding remains detectable');
  }
  if (testCase.expected.status === 'PASS') {
    assert.equal(result.findings.length, 0, testCase.id + ': clean control');
  }
  assert.equal(result.meta.aiCalls, 0, testCase.id + ': no AI');
  assert.equal(result.meta.networkAccess, false, testCase.id + ': no network');
  for (const finding of result.findings) {
    assert.ok(TQG.FINDING_CODES.includes(finding.code), testCase.id + ': valid code');
    assert.ok(finding.start >= 0 && finding.end > finding.start);
    assert.ok(finding.end <= testCase.targetText.length);
  }
}
assert.equal(corpus.caseCount, corpus.cases.length);

console.log('TQG-03 Exception Layer regression: PASS');

const url = run({
  sourceText: 'Visit https://example.com now.',
  targetText: 'ไปที่ https://example.com',
  glossaryText: ''
});
assert.equal(url.findings.length, 0, 'URL exception keeps URL noise out');

const unit = run({
  sourceText: 'The load is 10 kg.',
  targetText: 'น้ำหนักอยู่ที่ 10 kg',
  glossaryText: ''
});
assert.equal(unit.findings.length, 0, 'unit exception keeps units out');

const codeLike = run({
  sourceText: 'Use foo_bar in the configuration.',
  targetText: 'ใช้ foo_bar ในการตั้งค่า',
  glossaryText: ''
});
assert.equal(codeLike.findings.length, 0, 'code-like exception keeps identifiers out');

const repeatedWithGlossary = run({
  sourceText: 'The Azure Dragon Sect arrived.',
  targetText: 'Azure Dragon Sect Azure Dragon Sect',
  glossaryText: 'Azure Dragon Sect = Azure Dragon Sect'
});
assert.ok(repeatedWithGlossary.findings.some(
  (finding) => finding.code === 'REPEATED_TEXT'
));
assert.equal(
  repeatedWithGlossary.findings.filter(
    (finding) => finding.code === 'FOREIGN_SCRIPT_SPAN'
  ).length,
  0
);

const promptWithName = run({
  sourceText: 'Ye Fan arrived.',
  targetText: 'Here is the translation: Ye Fan',
  glossaryText: ''
});
assert.ok(promptWithName.findings.some(
  (finding) => finding.code === 'PROMPT_LEAKAGE'
));
assert.equal(
  promptWithName.findings.filter(
    (finding) => finding.code === 'FOREIGN_SCRIPT_SPAN'
  ).length,
  0
);

const appliedKeys = promptWithName.exceptionsApplied.map(
  (entry) => [entry.type, entry.findingCode, entry.start, entry.end].join('|')
);
assert.equal(
  new Set(appliedKeys).size,
  appliedKeys.length,
  'exception applications are unique'
);
