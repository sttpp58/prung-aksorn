#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(import.meta.url);
const TQG = requireFromRoot(path.join(ROOT, 'tqg.js'));

const C2_PATH = process.env.TQG_C2_GOLD_DATASET ||
  path.join(ROOT, 'tests', 'tqg', 'c2-private', 'gold-dataset.json');
const OUTPUT_PATH = process.env.TQG_WORK1_TEMPLATE ||
  path.join(ROOT, 'tests', 'tqg', 'c2-private', 'gold-repaired-targets.review-template.json');

const TARGET_REPAIR_CASES = 32;
const TARGET_CONTROL_CASES = 16;
const MAX_REPAIR_SPAN_CHARS = 2000;
const REPAIRABLE_CODES = new Set([
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
const BUCKET_ORDER = [
  'RANDOM_CLEAN',
  'RANDOM_MIXED',
  'TQG_FLAGGED',
  'EDGE_CASE'
];

function normalize(value) {
  return String(value).replace(/\r\n/g, '\n');
}

function sha256(value) {
  return crypto.createHash('sha256').update(normalize(value), 'utf8').digest('hex');
}

function caseIdOf(item) {
  return item.caseId || item.testCase?.caseId || '';
}

function bucketOf(item) {
  return item.samplingBucket || item.testCase?.samplingBucket || '';
}

function sortCases(cases) {
  return [...cases].sort((a, b) => caseIdOf(a).localeCompare(caseIdOf(b)));
}

function byBucket(cases) {
  const map = new Map(BUCKET_ORDER.map(bucket => [bucket, []]));
  for (const item of sortCases(cases)) {
    const bucket = bucketOf(item);
    if (map.has(bucket)) map.get(bucket).push(item);
  }
  return map;
}

function stratifiedTake(cases, count) {
  const buckets = byBucket(cases);
  const output = [];
  let cursor = 0;
  while (output.length < count) {
    let added = false;
    for (const bucket of BUCKET_ORDER) {
      const list = buckets.get(bucket);
      if (cursor < list.length) {
        output.push(list[cursor]);
        added = true;
        if (output.length === count) break;
      }
    }
    if (!added) break;
    cursor += 1;
  }
  return sortCases(output);
}

function pickRepairFinding(testCase) {
  const analysis = TQG.analyze({
    sourceText: testCase.sourceText,
    targetText: testCase.targetText,
    glossaryText: testCase.glossaryText || ''
  });
  assert.equal(
    analysis.status,
    testCase.tqg.status,
    testCase.caseId + ': current status drifted from locked C2 snapshot'
  );
  const currentCodes = [...new Set(analysis.findings.map(f => f.code))].sort();
  const snapshotCodes = [...new Set(testCase.tqg.codes || [])].sort();
  assert.deepEqual(
    currentCodes,
    snapshotCodes,
    testCase.caseId + ': current finding-code set drifted from locked C2 snapshot'
  );
  const finding = analysis.findings.find(item =>
    REPAIRABLE_CODES.has(item.code) &&
    Number.isInteger(item.start) &&
    Number.isInteger(item.end) &&
    item.end > item.start &&
    item.end - item.start <= MAX_REPAIR_SPAN_CHARS &&
    testCase.targetText.slice(item.start, item.end) === item.text
  );
  return { analysis, finding: finding || null };
}

function contentHashes(sourceText, brokenTargetText) {
  return {
    source: sha256(sourceText),
    brokenTarget: sha256(brokenTargetText),
    candidateTarget: null,
    goldTarget: null
  };
}

function buildRecord(testCase, expectedAction, analysis, finding) {
  return {
    caseId: 'SRG-' + testCase.caseId.replace(/^C2-/, ''),
    sourceCaseId: testCase.caseId,
    samplingBucket: testCase.samplingBucket,
    goldLabel: testCase.goldLabel,
    expectedAction,
    sourceText: testCase.sourceText,
    brokenTargetText: testCase.targetText,
    glossaryText: testCase.glossaryText || '',
    tqgSnapshot: {
      status: analysis.status,
      codes: [...new Set(analysis.findings.map(item => item.code))].sort(),
      detectorVersion: TQG.version
    },
    repairSpan: finding ? {
      code: finding.code,
      start: finding.start,
      end: finding.end,
      text: finding.text
    } : null,
    candidateTargetText: null,
    goldTargetText: null,
    acceptableTargetTexts: [],
    review: {
      status: 'PENDING',
      independentReviewers: 0,
      independenceConfirmed: false
    },
    adjudication: {
      anomalyConfirmed: null,
      repairApproved: null,
      anomalyRemoved: null,
      meaningPreserved: null,
      noNewMeaningChange: null
    },
    contentHashes: contentHashes(testCase.sourceText, testCase.targetText),
    provenance: {
      sourceDataset: 'TQG-C2-real-world-gold',
      c2ContentHash: testCase.contentHash
    }
  };
}

function main() {
  if (!fs.existsSync(C2_PATH)) {
    throw new Error(
      'C2 gold dataset not found. Set TQG_C2_GOLD_DATASET to the private dataset path.'
    );
  }
  if (fs.existsSync(OUTPUT_PATH)) {
    throw new Error('Refusing to overwrite existing Work 1 review template: ' + OUTPUT_PATH);
  }

  const source = JSON.parse(fs.readFileSync(C2_PATH, 'utf8'));
  assert.equal(source.dataset, 'TQG-C2-real-world-gold');
  assert.equal(source.schemaVersion, '1.0');
  assert.equal(source.cases.length, 175);

  const prepared = [];
  const repairCandidates = [];
  const controlCandidates = [];

  for (const testCase of source.cases) {
    const { analysis, finding } = pickRepairFinding(testCase);
    if (REPAIR_LABELS.has(testCase.goldLabel) && finding) {
      repairCandidates.push({ testCase, analysis, finding });
    }
    if (CONTROL_LABELS.has(testCase.goldLabel) && analysis.findings.length) {
      controlCandidates.push({ testCase, analysis, finding: analysis.findings[0] });
    }
  }

  assert.ok(
    repairCandidates.length >= TARGET_REPAIR_CASES,
    'not enough repair candidates in the locked C2 dataset'
  );
  assert.ok(
    controlCandidates.length >= TARGET_CONTROL_CASES,
    'not enough flagged safety controls in the locked C2 dataset'
  );

  const selectedRepairs = stratifiedTake(
    repairCandidates,
    TARGET_REPAIR_CASES
  );
  const selectedControls = stratifiedTake(
    controlCandidates,
    TARGET_CONTROL_CASES
  );

  for (const { testCase, analysis, finding } of selectedRepairs) {
    prepared.push(buildRecord(testCase, 'REPAIR', analysis, finding));
  }
  for (const { testCase, analysis, finding } of selectedControls) {
    prepared.push(buildRecord(testCase, 'NO_REPAIR', analysis, finding));
  }

  prepared.sort((a, b) => a.caseId.localeCompare(b.caseId));
  assert.equal(new Set(prepared.map(item => item.caseId)).size, prepared.length);

  const template = {
    dataset: 'TQG-semantic-repair-gold',
    schemaVersion: '1.0',
    sourceDataset: 'TQG-C2-real-world-gold',
    status: 'REVIEW_TEMPLATE',
    reviewPolicy: {
      minimumIndependentReviewers: 2,
      independenceConfirmedRequired: true,
      requiredStatus: 'GOLD_REVIEWED'
    },
    selectionPolicy: {
      targetRepairCases: TARGET_REPAIR_CASES,
      targetSafetyControls: TARGET_CONTROL_CASES,
      maxRepairSpanChars: MAX_REPAIR_SPAN_CHARS,
      selectionMethod: 'deterministic-round-robin-by-sampling-bucket-and-caseId',
      repairLabels: [...REPAIR_LABELS],
      controlLabels: [...CONTROL_LABELS]
    },
    cases: prepared
  };

  template.selectionDigest = sha256(
    prepared.map(item => item.sourceCaseId).join('|')
  );
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(template, null, 2) + '\n',
    'utf8'
  );

  console.log(JSON.stringify({
    status: 'PREPARED',
    output: OUTPUT_PATH,
    totalCases: prepared.length,
    repairCases: selectedRepairs.length,
    safetyControls: selectedControls.length,
    selectionDigest: template.selectionDigest,
    tqgVersion: TQG.version,
    contentIncluded: true,
    note: 'Template contains private production-derived text and is intentionally gitignored; it is not gold until independently reviewed.'
  }, null, 2));
}

main();
