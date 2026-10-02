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

const DATASET_PATH = process.env.TQG_WORK1_GOLD_DATASET ||
  path.join(ROOT, 'tests', 'tqg', 'c2-private', 'gold-repaired-targets.json');
const REQUIRED = process.env.TQG_REQUIRE_WORK1_GOLD === '1';

const C2_PATH = process.env.TQG_C2_GOLD_DATASET ||
  path.join(ROOT, 'tests', 'tqg', 'c2-private', 'gold-dataset.json');

const REPAIR_ACTION = 'REPAIR';
const NO_REPAIR_ACTION = 'NO_REPAIR';
const REQUIRED_REPAIR_CODES = new Set([
  'FOREIGN_SCRIPT_SPAN',
  'SOURCE_LANGUAGE_RESIDUE',
  'SOURCE_TEXT_OVERLAP',
  'MIXED_LANGUAGE_SPAN',
  'PROMPT_LEAKAGE'
]);
const REPAIR_LABELS = new Set(['TRUE_ANOMALY', 'META/PROMPT_LEAK']);
const CONTROL_LABELS = new Set([
  'FALSE_POSITIVE',
  'LEGITIMATE_FOREIGN',
  'LEGITIMATE_TECHNICAL',
  'STRUCTURAL_ERROR'
]);
const BUCKETS = new Set([
  'RANDOM_CLEAN',
  'RANDOM_MIXED',
  'TQG_FLAGGED',
  'EDGE_CASE'
]);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}
function fail(message) {
  throw new Error('TQG WORK 1 semantic-gold validation failed: ' + message);
}
function check(condition, message) {
  if (!condition) fail(message);
}
function normalize(value) {
  return String(value).replace(/\r\n/g, '\n').trim();
}
function equalText(a, b) {
  return normalize(a) === normalize(b);
}
function isTracked(file) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', path.relative(ROOT, file)], {
      cwd: ROOT,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}
function boundedReplacement(original, candidate, span) {
  if (!span || !Number.isInteger(span.start) || !Number.isInteger(span.end)) return false;
  if (span.start < 0 || span.end <= span.start || span.end > original.length) return false;
  const prefix = original.slice(0, span.start);
  const suffix = original.slice(span.end);
  return candidate.length >= prefix.length + suffix.length &&
    candidate.startsWith(prefix) &&
    candidate.endsWith(suffix);
}
function validateCommonCase(item) {
  check(typeof item.caseId === 'string' && item.caseId, 'caseId is required');
  check(/^SRG-\d+$/.test(item.caseId), item.caseId + ': caseId must use SRG-N format');
  check(typeof item.sourceCaseId === 'string' && /^C2-\d+$/.test(item.sourceCaseId),
    item.caseId + ': sourceCaseId must reference C2');
  check(typeof item.sourceText === 'string' && item.sourceText.length > 0,
    item.caseId + ': sourceText is required');
  check(typeof item.brokenTargetText === 'string' && item.brokenTargetText.length > 0,
    item.caseId + ': brokenTargetText is required');
  check(item.tqgBaselineSnapshot &&
    Array.isArray(item.tqgBaselineSnapshot.codes),
    item.caseId + ': tqgBaselineSnapshot is required');
  check(item.tqgCurrentSnapshot &&
    Array.isArray(item.tqgCurrentSnapshot.codes),
    item.caseId + ': tqgCurrentSnapshot is required');
  check(item.contentHashes && typeof item.contentHashes === 'object',
    item.caseId + ': contentHashes are required');
  check(item.contentHashes.source === sha256(item.sourceText),
    item.caseId + ': source hash mismatch');
  check(item.contentHashes.brokenTarget === sha256(item.brokenTargetText),
    item.caseId + ': broken-target hash mismatch');
  check(item.provenance?.sourceDataset === 'TQG-C2-real-world-gold',
    item.caseId + ': invalid source dataset');
  check(typeof item.provenance?.c2ContentHash === 'string' &&
    /^[a-f0-9]{64}$/.test(item.provenance.c2ContentHash),
    item.caseId + ': C2 provenance hash is required');
  check(item.review?.status === 'GOLD_REVIEWED',
    item.caseId + ': review.status must be GOLD_REVIEWED');
  check(Number.isInteger(item.review?.independentReviewers) &&
    item.review.independentReviewers >= 2,
    item.caseId + ': at least two independent reviewers are required');
  check(item.review?.independenceConfirmed === true,
    item.caseId + ': reviewer independence must be explicitly confirmed');
  check(item.adjudication && typeof item.adjudication === 'object',
    item.caseId + ': adjudication is required');
}
function validateRepairCase(item) {
  validateCommonCase(item);
  check(item.expectedAction === REPAIR_ACTION, item.caseId + ': repair case action mismatch');
  check(REPAIR_LABELS.has(item.goldLabel),
    item.caseId + ': REPAIR action requires an anomaly gold label');
  check(item.tqgCurrentSnapshot &&
    item.tqgCurrentSnapshot.detectorVersion === TQG.version,
    item.caseId + ': detector version drifted from the captured current snapshot');
  check(item.repairSpan && REQUIRED_REPAIR_CODES.has(item.repairSpan.code),
    item.caseId + ': eligible bounded repair span is required');
  check(item.brokenTargetText.slice(item.repairSpan.start, item.repairSpan.end) === item.repairSpan.text,
    item.caseId + ': repairSpan does not match broken target');
  check(typeof item.candidateTargetText === 'string' && item.candidateTargetText.length > 0,
    item.caseId + ': candidateTargetText is required');
  check(typeof item.goldTargetText === 'string' && item.goldTargetText.length > 0,
    item.caseId + ': goldTargetText is required');
  check(Array.isArray(item.acceptableTargetTexts) && item.acceptableTargetTexts.length >= 1,
    item.caseId + ': acceptableTargetTexts is required');
  check(item.acceptableTargetTexts.some(value => equalText(value, item.goldTargetText)),
    item.caseId + ': goldTargetText must be an acceptable target');
  check(item.adjudication.anomalyConfirmed === true,
    item.caseId + ': anomalyConfirmed must be true');
  check(item.adjudication.repairApproved === true,
    item.caseId + ': repairApproved must be true');
  check(item.adjudication.anomalyRemoved === true,
    item.caseId + ': anomalyRemoved must be true');
  check(item.adjudication.meaningPreserved === true,
    item.caseId + ': meaningPreserved must be true');
  check(item.adjudication.noNewMeaningChange === true,
    item.caseId + ': noNewMeaningChange must be true');
  check(item.contentHashes.candidateTarget === sha256(item.candidateTargetText),
    item.caseId + ': candidate-target hash mismatch');
  check(item.contentHashes.goldTarget === sha256(item.goldTargetText),
    item.caseId + ': gold-target hash mismatch');
  check(boundedReplacement(item.brokenTargetText, item.candidateTargetText, item.repairSpan),
    item.caseId + ': candidate must preserve exact prefix/suffix around the approved span');

  const brokenAnalysis = TQG.analyze({
    sourceText: item.sourceText,
    targetText: item.brokenTargetText,
    glossaryText: item.glossaryText || ''
  });
  check(brokenAnalysis.status === item.tqgCurrentSnapshot.status,
    item.caseId + ': broken-target status drifted from captured current TQG snapshot');
  check(
    JSON.stringify([...new Set(brokenAnalysis.findings.map(f => f.code))].sort()) ===
      JSON.stringify([...new Set(item.tqgCurrentSnapshot.codes || [])].sort()),
    item.caseId + ': broken-target finding-code set drifted from captured current TQG snapshot'
  );
  const capturedFinding = brokenAnalysis.findings.find(f =>
    f.code === item.repairSpan.code &&
    f.start === item.repairSpan.start &&
    f.end === item.repairSpan.end &&
    f.text === item.repairSpan.text
  );
  check(Boolean(capturedFinding),
    item.caseId + ': repairSpan is not present in the current TQG analysis');

  const candidateAnalysis = TQG.analyze({
    sourceText: item.sourceText,
    targetText: item.candidateTargetText,
    glossaryText: item.glossaryText || ''
  });
  const goldAnalysis = TQG.analyze({
    sourceText: item.sourceText,
    targetText: item.goldTargetText,
    glossaryText: item.glossaryText || ''
  });
  return {
    caseId: item.caseId,
    sourceCaseId: item.sourceCaseId,
    canonicalExactMatch: equalText(item.candidateTargetText, item.goldTargetText),
    acceptableGoldMatch: item.acceptableTargetTexts.some(value =>
      equalText(item.candidateTargetText, value)
    ),
    candidateStatus: candidateAnalysis.status,
    candidateFindingCount: candidateAnalysis.findings.length,
    goldStatus: goldAnalysis.status,
    goldFindingCount: goldAnalysis.findings.length
  };
}
function validateControlCase(item) {
  validateCommonCase(item);
  check(item.expectedAction === NO_REPAIR_ACTION, item.caseId + ': control action mismatch');
  check(item.candidateTargetText == null, item.caseId + ': NO_REPAIR control cannot contain candidate output');
  check(item.goldTargetText == null, item.caseId + ': NO_REPAIR control cannot contain gold target');
  check(Array.isArray(item.acceptableTargetTexts) && item.acceptableTargetTexts.length === 0,
    item.caseId + ': NO_REPAIR control must not contain acceptable targets');
  check(CONTROL_LABELS.has(item.goldLabel),
    item.caseId + ': NO_REPAIR action requires a control gold label');
  check(item.adjudication.repairApproved === false,
    item.caseId + ': NO_REPAIR control must explicitly reject repair');
  check(item.adjudication.anomalyConfirmed !== null &&
    typeof item.adjudication.anomalyConfirmed === 'boolean',
    item.caseId + ': anomaly confirmation decision is required');
  return {
    caseId: item.caseId,
    sourceCaseId: item.sourceCaseId,
    expectedAction: NO_REPAIR_ACTION,
    repairApproved: false
  };
}
function runSelfTest() {
  const tmp = {
    caseId: 'SRG-9999',
    sourceCaseId: 'C2-9999',
    samplingBucket: 'EDGE_CASE',
    goldLabel: 'TRUE_ANOMALY',
    expectedAction: REPAIR_ACTION,
    sourceText: 'She walked home.',
    brokenTargetText: 'นาง walked home',
    glossaryText: '',
    tqgBaselineSnapshot: {
      status: 'HIGH_SUSPICION',
      codes: [
        'FOREIGN_SCRIPT_SPAN',
        'MIXED_LANGUAGE_SPAN',
        'SOURCE_LANGUAGE_RESIDUE',
        'SOURCE_TEXT_OVERLAP'
      ]
    },
    tqgCurrentSnapshot: {
      status: 'HIGH_SUSPICION',
      codes: [
        'FOREIGN_SCRIPT_SPAN',
        'MIXED_LANGUAGE_SPAN',
        'SOURCE_LANGUAGE_RESIDUE',
        'SOURCE_TEXT_OVERLAP'
      ],
      detectorVersion: TQG.version
    },
    repairSpan: { code: 'FOREIGN_SCRIPT_SPAN', start: 4, end: 15, text: 'walked home' },
    candidateTargetText: 'นาง เดินกลับบ้าน',
    goldTargetText: 'นาง เดินกลับบ้าน',
    acceptableTargetTexts: ['นาง เดินกลับบ้าน'],
    review: { status: 'GOLD_REVIEWED', independentReviewers: 2, independenceConfirmed: true },
    adjudication: {
      anomalyConfirmed: true,
      repairApproved: true,
      anomalyRemoved: true,
      meaningPreserved: true,
      noNewMeaningChange: true
    },
    contentHashes: {
      source: sha256('She walked home.'),
      brokenTarget: sha256('นาง walked home'),
      candidateTarget: sha256('นาง เดินกลับบ้าน'),
      goldTarget: sha256('นาง เดินกลับบ้าน')
    },
    provenance: { sourceDataset: 'TQG-C2-real-world-gold', c2ContentHash: '0'.repeat(64) }
  };
  const outcome = validateRepairCase(tmp);
  check(outcome.acceptableGoldMatch === true, 'self-test candidate matches acceptable gold');
  check(outcome.canonicalExactMatch === true, 'self-test candidate matches canonical gold');
  return {
    status: 'SELF_TEST_PASS',
    repairCases: 1,
    acceptableGoldMatchRate: 1
  };
}
function main() {
  if (process.env.TQG_WORK1_SELF_TEST === '1') {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }
  if (!fs.existsSync(DATASET_PATH)) {
    const result = {
      status: 'DEFERRED',
      pass: !REQUIRED,
      reason: 'Independent gold-repaired-target dataset is not available.',
      datasetPath: DATASET_PATH,
      semanticRepairAccuracy: null
    };
    console.log(JSON.stringify(result, null, 2));
    if (REQUIRED) process.exitCode = 1;
    return;
  }
  check(!isTracked(DATASET_PATH), 'private gold dataset must remain untracked');
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  check(dataset.dataset === 'TQG-semantic-repair-gold', 'dataset identifier is locked');
  check(dataset.schemaVersion === '1.0', 'dataset schema version is locked');
  check(dataset.sourceDataset === 'TQG-C2-real-world-gold', 'dataset source is locked to C2');
  check(dataset.reviewPolicy?.requiredStatus === 'GOLD_REVIEWED',
    'dataset review policy requires GOLD_REVIEWED');
  check(dataset.reviewPolicy?.minimumIndependentReviewers >= 2,
    'dataset review policy requires two independent reviewers');
  check(dataset.reviewPolicy?.independenceConfirmedRequired === true,
    'dataset requires explicit reviewer independence confirmation');
  check(dataset.selectionPolicy?.maxRepairSpanChars === 2000,
    'dataset locks the 2000-character repair-span boundary');
  check(Array.isArray(dataset.cases) && dataset.cases.length > 0,
    'dataset must contain cases');

  if (fs.existsSync(C2_PATH)) {
    const c2 = JSON.parse(fs.readFileSync(C2_PATH, 'utf8'));
    check(c2.dataset === 'TQG-C2-real-world-gold' && c2.schemaVersion === '1.0',
      'available C2 provenance source has the locked schema');
    const c2ById = new Map(c2.cases.map(item => [item.caseId, item]));
    for (const item of dataset.cases) {
      const sourceCase = c2ById.get(item.sourceCaseId);
      check(Boolean(sourceCase), item.caseId + ': sourceCaseId is missing from the C2 dataset');
      check(sourceCase.contentHash === item.provenance.c2ContentHash,
        item.caseId + ': C2 provenance content hash mismatch');
      check(sourceCase.sourceText === item.sourceText &&
        sourceCase.targetText === item.brokenTargetText,
        item.caseId + ': source/broken target differs from the C2 source case');
    }
  }

  const ids = new Set();
  const sourceIds = new Set();
  const repairOutcomes = [];
  const controls = [];
  for (const item of dataset.cases) {
    check(!ids.has(item.caseId), item.caseId + ': duplicate caseId');
    ids.add(item.caseId);
    check(!sourceIds.has(item.sourceCaseId), item.caseId + ': duplicate sourceCaseId');
    sourceIds.add(item.sourceCaseId);
    check(BUCKETS.has(item.samplingBucket), item.caseId + ': invalid sampling bucket');
    check(item.provenance?.c2ContentHash, item.caseId + ': C2 provenance hash is required');
    if (item.expectedAction === REPAIR_ACTION) {
      repairOutcomes.push(validateRepairCase(item));
    } else if (item.expectedAction === NO_REPAIR_ACTION) {
      controls.push(validateControlCase(item));
    } else {
      fail(item.caseId + ': expectedAction must be REPAIR or NO_REPAIR');
    }
  }
  check(repairOutcomes.length > 0, 'dataset must contain repair cases');
  check(controls.length > 0, 'dataset must contain safety controls');

  const acceptableMatches = repairOutcomes.filter(item => item.acceptableGoldMatch).length;
  const canonicalMatches = repairOutcomes.filter(item => item.canonicalExactMatch).length;
  const semanticRepairAccuracy = acceptableMatches / repairOutcomes.length;
  const canonicalExactMatchRate = canonicalMatches / repairOutcomes.length;

  const report = {
    status: 'VALIDATED',
    pass: semanticRepairAccuracy === 1,
    datasetCases: dataset.cases.length,
    repairCases: repairOutcomes.length,
    safetyControls: controls.length,
    acceptableGoldMatches: acceptableMatches,
    canonicalExactMatches: canonicalMatches,
    semanticRepairAccuracy,
    canonicalExactMatchRate,
    candidateTQGStatusCounts: Object.fromEntries(
      [...new Set(repairOutcomes.map(item => item.candidateStatus))].map(status => [
        status,
        repairOutcomes.filter(item => item.candidateStatus === status).length
      ])
    ),
    goldTQGStatusCounts: Object.fromEntries(
      [...new Set(repairOutcomes.map(item => item.goldStatus))].map(status => [
        status,
        repairOutcomes.filter(item => item.goldStatus === status).length
      ])
    )
  };
  report.digest = sha256(JSON.stringify(report));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}
main();
