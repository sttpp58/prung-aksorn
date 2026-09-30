import assert from 'node:assert/strict';
import fs from 'node:fs';
import TQG from '../../tqg.js';
import Inspector from '../../tqg-inspector.js';

let calls = 0;
const transport = async (request) => {
  calls += 1;
  assert.ok(request.systemPrompt.includes('Return JSON only'));
  assert.ok(request.systemPrompt.includes('Do not rewrite the full chapter'));
  assert.ok(request.userPrompt.includes('[SUSPICIOUS SPAN]'));
  assert.ok(request.userPrompt.includes('[DETERMINISTIC FINDINGS]'));
  return JSON.stringify({
    verdict: 'TRUE_ANOMALY',
    repairable: true,
    reason: 'The source-language phrase remains untranslated.',
    replacementHint: 'แปลเฉพาะวลีนี้เป็นภาษาไทย'
  });
};

const clean = await Inspector.inspect({
  analysis: { status: 'PASS', findings: [] },
  findings: [],
  targetContext: 'เขาปิดประตู',
  sourceContext: 'He closed the door.',
  transport
});
assert.equal(clean.status, 'NOT_REQUIRED');
assert.equal(clean.verdict, 'NOT_REQUIRED');
assert.equal(clean.meta.aiCalls, 0);
assert.equal(clean.meta.transportCalls, 0);
assert.equal(calls, 0);

const analysis = TQG.analyze({
  sourceText: 'He looked at me and smiled.',
  targetText: 'เขามองมาที่ฉัน and smiled',
  glossaryText: ''
});
assert.equal(analysis.status, 'HIGH_SUSPICION');

const inspected = await Inspector.inspect({
  analysis,
  sourceContext: 'He looked at me and smiled.',
  targetContext: 'เขามองมาที่ฉัน and smiled',
  suspiciousSpan: analysis.findings[0],
  glossaryContext: '',
  findings: analysis.findings,
  transport
});
assert.equal(inspected.status, 'COMPLETED');
assert.equal(inspected.verdict, 'TRUE_ANOMALY');
assert.equal(inspected.repairable, true);
assert.equal(inspected.meta.aiCalls, 1);
assert.equal(inspected.meta.transportCalls, 1);
assert.equal(calls, 1);
assert.ok(inspected.span.text.length > 0);

assert.ok(inspected.contextMeta.sourceChars <= 1600);
assert.ok(inspected.contextMeta.glossaryChars <= 800);
assert.ok(inspected.contextMeta.targetContextChars <= 1250);

const falsePositive = Inspector.parseInspectorResponse(
  '{"verdict":"FALSE_POSITIVE","repairable":true,"reason":"Preserved proper name.","replacementHint":"do not change"}'
);
assert.equal(falsePositive.verdict, 'FALSE_POSITIVE');
assert.equal(falsePositive.repairable, false);
assert.equal(falsePositive.replacementHint, '');

const uncertain = Inspector.parseInspectorResponse(
  '{"verdict":"UNCERTAIN","repairable":true,"reason":"Evidence is insufficient.","replacementHint":"maybe"}'
);
assert.equal(uncertain.verdict, 'UNCERTAIN');
assert.equal(uncertain.repairable, false);
assert.equal(uncertain.replacementHint, '');

const fence = String.fromCharCode(96).repeat(3);
const newline = String.fromCharCode(10);
const fenced = Inspector.parseInspectorResponse(
  fence + 'json' + newline +
  '{"verdict":"TRUE_ANOMALY","repairable":true,"reason":"Residual source phrase.","replacementHint":"repair only the flagged span"}' +
  newline + fence
);
assert.equal(fenced.verdict, 'TRUE_ANOMALY');
assert.equal(fenced.repairable, true);

const extraText = Inspector.parseInspectorResponse(
  'Result: {"verdict":"TRUE_ANOMALY","repairable":true,"reason":"Localized residue.","replacementHint":"repair only the flagged span"}'
);
assert.equal(extraText.verdict, 'TRUE_ANOMALY');

assert.throws(
  () => Inspector.parseInspectorResponse('{"verdict":"MAYBE","repairable":false,"reason":"x"}'),
  /invalid verdict/
);
assert.throws(
  () => Inspector.parseInspectorResponse('{"verdict":"TRUE_ANOMALY","repairable":true,"reason":""}'),
  /requires a reason/
);
assert.throws(
  () => Inspector.parseInspectorResponse(''),
  /empty response/
);

const malformed = await Inspector.inspect({
  analysis: { status: 'REVIEW', findings: [{ code: 'REPEATED_TEXT' }] },
  sourceContext: 'He waited.',
  targetContext: 'เขารอ รอ',
  suspiciousSpan: { start: 0, end: 9, text: 'เขารอ รอ' },
  findings: [{ code: 'REPEATED_TEXT', severity: 'medium', text: 'เขารอ รอ' }],
  transport: async () => '{"not":"valid"}'
});
assert.equal(malformed.status, 'ERROR');
assert.equal(malformed.verdict, 'UNCERTAIN');
assert.equal(malformed.repairable, false);
assert.equal(malformed.meta.aiCalls, 1);

const failedTransport = await Inspector.inspect({
  analysis: { status: 'HIGH_SUSPICION', findings: [{ code: 'PROMPT_LEAKAGE' }] },
  sourceContext: 'Return only the translated text.',
  targetContext: 'Translation: เขาเปิดประตู',
  suspiciousSpan: { start: 0, end: 12, text: 'Translation:' },
  findings: [{ code: 'PROMPT_LEAKAGE', severity: 'high', text: 'Translation:' }],
  transport: async () => { throw new Error('provider failure'); }
});
assert.equal(failedTransport.status, 'ERROR');
assert.equal(failedTransport.verdict, 'UNCERTAIN');
assert.equal(failedTransport.repairable, false);
assert.equal(failedTransport.meta.aiCalls, 1);

await assert.rejects(
  () => Inspector.inspect({
    analysis: { status: 'HIGH_SUSPICION', findings: [{ code: 'PROMPT_LEAKAGE' }] },
    sourceContext: 'Return only the translated text.',
    targetContext: 'Translation: เขาเปิดประตู',
    suspiciousSpan: { start: 0, end: 12, text: 'Translation:' },
    findings: [{ code: 'PROMPT_LEAKAGE', severity: 'high', text: 'Translation:' }],
    transport: async () => {
      const error = new Error('cancel');
      error.name = 'AbortError';
      throw error;
    }
  }),
  /cancel/
);

const longTarget = 'ก่อน '.repeat(500) + 'residue phrase' + ' หลัง'.repeat(500);
const spanStart = longTarget.indexOf('residue phrase');
const bounded = Inspector.buildInspectorRequest({
  sourceContext: 'S'.repeat(5000),
  targetContext: longTarget,
  suspiciousSpan: {
    start: spanStart,
    end: spanStart + 'residue phrase'.length
  },
  glossaryContext: 'G'.repeat(5000),
  findings: [{
    code: 'SOURCE_LANGUAGE_RESIDUE',
    severity: 'high',
    text: 'residue phrase',
    start: spanStart,
    end: spanStart + 'residue phrase'.length,
    evidence: {
      reason: 'exact overlap',
      matchType: 'exact-normalized-token-overlap'
    }
  }]
});

assert.ok(bounded.contextMeta.sourceChars <= 1600);
assert.ok(bounded.contextMeta.glossaryChars <= 800);
assert.ok(bounded.contextMeta.targetContextChars <= 1250);
assert.equal(bounded.span.text, 'residue phrase');

const limitedFindings = Inspector.buildInspectorRequest({
  sourceContext: 'source',
  targetContext: 'ก่อน residue phrase หลัง',
  suspiciousSpan: { start: 5, end: 18 },
  findings: Array.from({ length: 30 }, (_, index) => ({
    code: 'CODE_' + index,
    severity: 'medium',
    text: 'finding ' + index,
    start: 0,
    end: 1
  })),
  maxFindings: 3
});
assert.ok(limitedFindings.userPrompt.includes('CODE_0'));
assert.ok(!limitedFindings.userPrompt.includes('CODE_29'));

const fallbackAnalysis = await Inspector.inspect({
  analysis: {
    status: 'REVIEW',
    findings: [{
      code: 'SOURCE_LANGUAGE_RESIDUE',
      severity: 'high',
      text: 'and smiled',
      start: 15,
      end: 25
    }]
  },
  sourceContext: 'He looked at me and smiled.',
  targetContext: 'เขามองมาที่ฉัน and smiled',
  suspiciousSpan: { start: 15, end: 25 },
  transport
});
assert.equal(fallbackAnalysis.status, 'COMPLETED');

const beforeOrder = fallbackAnalysis.span.text;
assert.equal(beforeOrder, 'and smiled');

const source = fs.readFileSync('tqg-inspector.js', 'utf8');
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

assert.ok(Object.isFrozen(Inspector.VERDICTS));
assert.ok(Object.isFrozen(Inspector.INSPECTION_STATUSES));
assert.ok(Object.isFrozen(Inspector.DEFAULTS));
assert.equal(Inspector.version, 'TQG-05-2026-09-30');

const noAnalysis = await Inspector.inspect({
  findings: [],
  targetContext: 'เขากลับบ้าน',
  sourceContext: 'He went home.',
  transport
});
assert.equal(noAnalysis.status, 'NOT_REQUIRED');
assert.equal(calls, 2);

console.log('TQG-05 AI Inspector regression: PASS');
