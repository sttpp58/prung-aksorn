#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(import.meta.url);
const TQG = requireFromRoot(path.join(ROOT, 'tqg.js'));
const DATASET_PATH = process.env.TQG_C2_GOLD_DATASET ||
  path.join(ROOT, 'tests', 'tqg', 'c2-private', 'gold-dataset.json');
const REQUIRE_PRIVATE = process.env.TQG_REQUIRE_PRODUCTION_SEMANTIC === '1';

const TAXONOMY = [
  'TRUE_ANOMALY',
  'FALSE_POSITIVE',
  'AMBIGUOUS',
  'LEGITIMATE_FOREIGN',
  'LEGITIMATE_TECHNICAL',
  'STRUCTURAL_ERROR',
  'META/PROMPT_LEAK',
  'OTHER'
];
const EXPECTED_BUCKETS = Object.freeze({
  RANDOM_CLEAN: 50,
  RANDOM_MIXED: 50,
  TQG_FLAGGED: 50,
  EDGE_CASE: 25
});
const POSITIVE_LABELS = new Set([
  'TRUE_ANOMALY',
  'STRUCTURAL_ERROR',
  'META/PROMPT_LEAK'
]);
const NEGATIVE_LABELS = new Set([
  'FALSE_POSITIVE',
  'LEGITIMATE_FOREIGN',
  'LEGITIMATE_TECHNICAL',
  'OTHER'
]);

function fail(message) {
  throw new Error('TQG Production Semantic Accuracy failed: ' + message);
}

function check(condition, message) {
  assert.ok(condition, message);
}

function contentHash(sourceText, targetText) {
  return crypto.createHash('sha256')
    .update(String(sourceText) + '\0' + String(targetText))
    .digest('hex');
}

function datasetHash(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function tracked(relativePath) {
  try {
    execFileSync('git', [
      'ls-files',
      '--error-unmatch',
      '--',
      relativePath
    ], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function predictedPositive(result) {
  return result.status === 'REVIEW' || result.status === 'HIGH_SUSPICION';
}

function metric(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function buildConfusion() {
  return { TP: 0, TN: 0, FP: 0, FN: 0 };
}

function addConfusion(confusion, predicted, actual) {
  if (predicted && actual) confusion.TP += 1;
  else if (!predicted && !actual) confusion.TN += 1;
  else if (predicted && !actual) confusion.FP += 1;
  else confusion.FN += 1;
}
function summarize(confusion, evaluatedCases) {
  const precision = metric(
    confusion.TP,
    confusion.TP + confusion.FP
  );
  const recall = metric(
    confusion.TP,
    confusion.TP + confusion.FN
  );
  const specificity = metric(
    confusion.TN,
    confusion.TN + confusion.FP
  );
  const accuracy = metric(
    confusion.TP + confusion.TN,
    evaluatedCases
  );
  const f1 = precision === null || recall === null ||
    precision + recall === 0
    ? null
    : 2 * precision * recall / (precision + recall);

  return {
    evaluatedCases,
    confusion,
    accuracy,
    precision,
    recall,
    specificity,
    f1
  };
}

function summarizeBucket(items) {
  const confusion = buildConfusion();
  let evaluatedCases = 0;

  for (const item of items) {
    if (item.goldLabel === 'AMBIGUOUS') continue;
    evaluatedCases += 1;
    addConfusion(confusion, item.predictedPositive, POSITIVE_LABELS.has(item.goldLabel));
  }

  return summarize(confusion, evaluatedCases);
}

function validateDatasetShape(dataset) {
  check(dataset.schemaVersion === '1.0', 'C2 schemaVersion must be 1.0');
  check(dataset.dataset === 'TQG-C2-real-world-gold', 'C2 dataset id mismatch');
  check(Array.isArray(dataset.cases), 'C2 cases must be an array');
  check(dataset.cases.length === 175, 'C2 dataset must contain exactly 175 cases');

  for (const [bucket, expected] of Object.entries(EXPECTED_BUCKETS)) {
    const actual = dataset.cases.filter(
      (testCase) => testCase.samplingBucket === bucket
    ).length;
    check(actual === expected,
      'bucket ' + bucket + ' expected ' + expected + ', got ' + actual);
  }
}

function validateCaseShape(testCase, seenIds, seenHashes) {
  check(/^C2-\d{3}$/.test(testCase.caseId),
    testCase.caseId + ': invalid caseId');
  check(!seenIds.has(testCase.caseId),
    testCase.caseId + ': duplicate caseId');
  seenIds.add(testCase.caseId);

  check(TAXONOMY.includes(testCase.goldLabel),
    testCase.caseId + ': invalid goldLabel');
  check(testCase.reviewStatus === 'GOLD_REVIEWED',
    testCase.caseId + ': reviewStatus must be GOLD_REVIEWED');
  check(typeof testCase.goldRationale === 'string' &&
    testCase.goldRationale.trim().length > 0,
    testCase.caseId + ': gold rationale is required');
  check(typeof testCase.sourceText === 'string' &&
    testCase.sourceText.length > 0,
    testCase.caseId + ': sourceText is required');
  check(typeof testCase.targetText === 'string' &&
    testCase.targetText.length > 0,
    testCase.caseId + ': targetText is required');

  const expectedHash = contentHash(
    testCase.sourceText,
    testCase.targetText
  );
  check(testCase.contentHash === expectedHash,
    testCase.caseId + ': contentHash mismatch');
  check(!seenHashes.has(testCase.contentHash),
    testCase.caseId + ': duplicate source/target content');
  seenHashes.add(testCase.contentHash);
}
function runCase(testCase) {
  const result = TQG.analyze({
    sourceText: testCase.sourceText,
    targetText: testCase.targetText,
    glossaryText: testCase.glossaryText || ''
  });

  check(result.meta?.deterministic === true,
    testCase.caseId + ': TQG path must remain deterministic');
  check(result.meta?.aiCalls === 0,
    testCase.caseId + ': TQG production audit must use zero AI calls');
  check(result.meta?.networkAccess === false,
    testCase.caseId + ': TQG production audit must use no network');

  const currentCodes = [...new Set(
    (result.findings || []).map((finding) => finding.code)
  )].sort();
  const storedCodes = [...new Set(
    (testCase.tqg?.codes || [])
  )].sort();

  const statusMatchesSnapshot = result.status === testCase.tqg?.status;
  const codesMatchSnapshot =
    JSON.stringify(currentCodes) === JSON.stringify(storedCodes);

  check(statusMatchesSnapshot,
    testCase.caseId + ': current TQG status drifted from C2 snapshot');
  check(codesMatchSnapshot,
    testCase.caseId + ': current TQG finding-code set drifted from C2 snapshot');

  return {
    caseId: testCase.caseId,
    samplingBucket: testCase.samplingBucket,
    goldLabel: testCase.goldLabel,
    predictedStatus: result.status,
    predictedPositive: predictedPositive(result)
  };
}

function runRequiredDataset() {
  if (!fs.existsSync(DATASET_PATH)) {
    if (REQUIRE_PRIVATE) {
      fail('required private C2 dataset not found: ' + DATASET_PATH);
    }
    return {
      mode: 'REAL_WORLD_C2',
      status: 'DEFERRED',
      datasetPath: DATASET_PATH,
      cases: 0,
      pass: null,
      reason: 'Private C2 gold dataset is not available in this environment.'
    };
  }

  const relative = path.relative(ROOT, DATASET_PATH);
  check(!tracked(relative), 'private C2 gold dataset must not be tracked by Git');

  const raw = fs.readFileSync(DATASET_PATH, 'utf8');
  const dataset = JSON.parse(raw);
  validateDatasetShape(dataset);

  const seenIds = new Set();
  const seenHashes = new Set();
  for (const testCase of dataset.cases) {
    validateCaseShape(testCase, seenIds, seenHashes);
  }
  const outcomes = dataset.cases.map(runCase);
  const evaluable = outcomes.filter(
    (testCase) => testCase.goldLabel !== 'AMBIGUOUS'
  );
  const overall = buildConfusion();

  for (const outcome of evaluable) {
    addConfusion(
      overall,
      outcome.predictedPositive,
      POSITIVE_LABELS.has(outcome.goldLabel)
    );
  }

  const byBucket = {};
  for (const bucket of Object.keys(EXPECTED_BUCKETS)) {
    byBucket[bucket] = summarizeBucket(
      outcomes.filter((item) => item.samplingBucket === bucket)
    );
  }

  const labelStatus = {};
  for (const outcome of outcomes) {
    const key = outcome.goldLabel + '|' + outcome.predictedStatus;
    labelStatus[key] = (labelStatus[key] || 0) + 1;
  }

  const ambiguousCount = outcomes.filter(
    (item) => item.goldLabel === 'AMBIGUOUS'
  ).length;
  const metrics = summarize(overall, evaluable.length);

  check(evaluable.length === 174,
    'binary semantic metrics must evaluate exactly 174 non-ambiguous cases');
  check(ambiguousCount === 1,
    'C2 semantic dataset must contain exactly one AMBIGUOUS case');

  return {
    mode: 'REAL_WORLD_C2',
    status: 'VALIDATED',
    datasetPath: DATASET_PATH,
    datasetHash: datasetHash(raw),
    cases: outcomes.length,
    excludedAmbiguous: ambiguousCount,
    snapshotStatusMatches: outcomes.length,
    snapshotCodeMatches: outcomes.length,
    binaryMetrics: {
      ...metrics,
      positiveLabels: [...POSITIVE_LABELS],
      negativeLabels: [...NEGATIVE_LABELS]
    },
    byBucket,
    labelStatus,
    samplingInterpretation:
      'Sample-stratified semantic anomaly-detection effectiveness only; not a production-prevalence estimate.',
    annotationBoundary:
      'C2 labels were produced by a single reviewer; this is not an independent multi-reviewer repair gold set.',
    pass: true
  };
}

const realWorld = runRequiredDataset();
const summary = {
  pass: realWorld.status === 'DEFERRED' || realWorld.pass === true,
  validatorVersion: 'TQG-PRODUCTION-SEMANTIC-01',
  tqgVersion: TQG.version,
  realWorld
};

summary.digest = crypto.createHash('sha256')
  .update(JSON.stringify(summary))
  .digest('hex');

console.log(JSON.stringify(summary, null, 2));

if (!summary.pass) process.exitCode = 1;
