#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(import.meta.url);
const TQG = requireFromRoot(path.join(ROOT, 'tqg.js'));
const DATASET = process.env.TQG_WORK2_C2_DATASET ||
  path.join(ROOT, 'tests', 'tqg', 'c2-private', 'gold-dataset.json');
const REQUIRED = process.env.TQG_REQUIRE_WORK2_C2 === '1';
const BASELINE = Object.freeze({
  TP: 97, TN: 53, FP: 24, FN: 0,
  accuracy: (97 + 53) / 174,
  precision: 97 / 121,
  recall: 1,
  specificity: 53 / 77,
  f1: 2 * (97 / 121) / (1 + 97 / 121)
});
const POSITIVE = new Set(['TRUE_ANOMALY', 'STRUCTURAL_ERROR', 'META/PROMPT_LEAK']);
const NEGATIVE = new Set(['FALSE_POSITIVE', 'LEGITIMATE_FOREIGN', 'LEGITIMATE_TECHNICAL', 'OTHER']);

if (!fs.existsSync(DATASET)) {
  const deferred = {
    status: 'DEFERRED',
    pass: !REQUIRED,
    reason: 'Private C2 gold dataset is not available.'
  };
  console.log(JSON.stringify(deferred, null, 2));
  if (REQUIRED) process.exitCode = 1;
  process.exit();
}

const source = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
assert.equal(source.dataset, 'TQG-C2-real-world-gold');
assert.equal(source.schemaVersion, '1.0');
assert.equal(source.cases.length, 175);

let TP = 0;
let TN = 0;
let FP = 0;
let FN = 0;
let ambiguous = 0;
const deltas = [];

for (const testCase of source.cases) {
  const result = TQG.analyze({
    sourceText: testCase.sourceText,
    targetText: testCase.targetText,
    glossaryText: testCase.glossaryText || ''
  });
  const oldCodes = [...new Set(testCase.tqg.codes || [])].sort();
  const newCodes = [...new Set(result.findings.map(f => f.code))].sort();

  if (result.status !== testCase.tqg.status ||
      JSON.stringify(oldCodes) !== JSON.stringify(newCodes)) {
    deltas.push({
      caseId: testCase.caseId,
      goldLabel: testCase.goldLabel,
      oldStatus: testCase.tqg.status,
      newStatus: result.status,
      oldCodes,
      newCodes
    });
  }

  if (testCase.goldLabel === 'AMBIGUOUS') {
    ambiguous += 1;
    continue;
  }

  const actual = POSITIVE.has(testCase.goldLabel);
  const predicted = result.findings.length > 0;
  if (actual && predicted) TP += 1;
  else if (!actual && !predicted) TN += 1;
  else if (!actual && predicted) FP += 1;
  else FN += 1;
}

const evaluated = TP + TN + FP + FN;
const accuracy = (TP + TN) / evaluated;
const precision = TP / (TP + FP);
const recall = TP / (TP + FN);
const specificity = TN / (TN + FP);
const f1 = 2 * precision * recall / (precision + recall);

const nonRepeatDeltas = deltas.filter(item => {
  const changed = new Set([
    ...item.oldCodes.filter(code => !item.newCodes.includes(code)),
    ...item.newCodes.filter(code => !item.oldCodes.includes(code))
  ]);
  changed.delete('REPEATED_TEXT');
  return changed.size > 0;
});

const removedFalsePositives = deltas.filter(item =>
  NEGATIVE.has(item.goldLabel) &&
  item.oldCodes.includes('REPEATED_TEXT') &&
  !item.newCodes.includes('REPEATED_TEXT') &&
  item.newCodes.length === 0
);

const addedPositiveRepeats = deltas.filter(item =>
  POSITIVE.has(item.goldLabel) &&
  !item.oldCodes.includes('REPEATED_TEXT') &&
  item.newCodes.includes('REPEATED_TEXT')
);

assert.equal(ambiguous, 1);
assert.equal(FN, 0, 'WORK 2 must preserve zero false negatives');
assert.ok(TP >= BASELINE.TP, 'true-positive count must not decrease');
assert.ok(FP <= BASELINE.FP, 'false-positive count must not increase');
assert.ok(accuracy >= BASELINE.accuracy, 'accuracy must not decrease');
assert.ok(precision >= BASELINE.precision, 'precision must not decrease');
assert.ok(recall >= BASELINE.recall, 'recall must not decrease');
assert.ok(specificity >= BASELINE.specificity, 'specificity must not decrease');
assert.ok(f1 >= BASELINE.f1, 'F1 must not decrease');
assert.equal(nonRepeatDeltas.length, 0, 'only REPEATED_TEXT semantics may change');
assert.equal(removedFalsePositives.length, 6, 'exactly six C2 false positives must be cleared by this hardening');
assert.equal(addedPositiveRepeats.length, 2, 'two positive cases must gain intra-token REPEATED_TEXT evidence');

const report = {
  pass: true,
  analyzerVersion: TQG.version,
  datasetCases: source.cases.length,
  evaluated,
  ambiguous,
  baseline: BASELINE,
  current: { TP, TN, FP, FN, accuracy, precision, recall, specificity, f1 },
  deltas: {
    total: deltas.length,
    nonRepeat: nonRepeatDeltas.length,
    removedFalsePositives: removedFalsePositives.map(item => item.caseId),
    addedPositiveRepeats: addedPositiveRepeats.map(item => item.caseId)
  }
};
report.digest = crypto.createHash('sha256')
  .update(JSON.stringify(report))
  .digest('hex');

console.log(JSON.stringify(report, null, 2));
