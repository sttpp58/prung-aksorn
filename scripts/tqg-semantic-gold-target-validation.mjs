#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const TQG = require(path.join(root, 'tqg.js'));
const Repair = require(path.join(root, 'tqg-repair.js'));

const PUBLIC_SYNTHETIC_CASES = [
  'TQG-REPAIR-001',
  'TQG-REPAIR-002',
  'TQG-REPAIR-004',
  'TQG-REPAIR-005',
  'TQG-REPAIR-006'
];
const PRIVATE_DATASET_PATH = process.env.TQG_SEMANTIC_GOLD_DATASET ||
  path.join(root, 'tests', 'tqg', 'c2-private', 'gold-repaired-targets.json');

function fail(message) {
  throw new Error('TQG Semantic / Gold-target Validation failed: ' + message);
}
function check(condition, message) {
  if (!condition) fail(message);
}
function normalize(text) {
  return String(text).replace(/\r\n/g, '\n').trim();
}
function contentHash(...parts) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(parts.map(normalize)))
    .digest('hex');
}
function equalText(a, b) {
  return normalize(a) === normalize(b);
}
function tracked(pathname) {
  const relative = path.relative(root, pathname);
  if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    return false;
  }
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relative], {
      cwd: root,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

async function runSyntheticGoldTargetContract() {
  const corpusPath = path.join(root, 'tests', 'tqg', 'corpus-public.json');
  check(fs.existsSync(corpusPath), 'public TQG corpus is present');
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  const cases = corpus.cases.filter(testCase =>
    PUBLIC_SYNTHETIC_CASES.includes(testCase.id)
  );
  check(cases.length === PUBLIC_SYNTHETIC_CASES.length,
    'all locked public synthetic gold-target repair cases are present');

  const outcomes = [];

  for (const testCase of cases) {
    check(testCase.safety?.publicSafe === true,
      testCase.id + ': fixture must remain public-safe');
    check(testCase.safety?.syntheticOrMinimal === true,
      testCase.id + ': fixture must be explicitly synthetic/minimal');
    check(typeof testCase.repair?.expectedTarget === 'string',
      testCase.id + ': expectedTarget is required');
    check(typeof testCase.repair?.replacementText === 'string',
      testCase.id + ': replacementText is required');

    const analysis = TQG.analyze({
      sourceText: testCase.sourceText,
      targetText: testCase.targetText,
      glossaryText: testCase.glossaryText
    });
    const span = analysis.findings.find(f =>
      Number.isInteger(f.start) &&
      Number.isInteger(f.end) &&
      f.end > f.start &&
      typeof f.text === 'string' &&
      testCase.targetText.slice(f.start, f.end) === f.text &&
      (f.code === 'FOREIGN_SCRIPT_SPAN' ||
       f.code === 'SOURCE_LANGUAGE_RESIDUE' ||
       f.code === 'SOURCE_TEXT_OVERLAP' ||
       f.code === 'MIXED_LANGUAGE_SPAN')
    );
    check(Boolean(span), testCase.id + ': deterministic TQG finding provides a repair span');

    const result = await Repair.repair({
      inspectorResult: {
        status: 'COMPLETED',
        verdict: 'TRUE_ANOMALY',
        repairable: true,
        reason: 'Synthetic gold-target contract fixture.'
      },
      originalAnalysis: analysis,
      sourceContext: testCase.sourceText,
      targetContext: testCase.targetText,
      glossaryContext: testCase.glossaryText,
      findings: analysis.findings,
      suspiciousSpan: span,
      transport: async () =>
        JSON.stringify({ replacementText: testCase.repair.replacementText }),
      analyze: targetText => TQG.analyze({
        sourceText: testCase.sourceText,
        targetText,
        glossaryText: testCase.glossaryText
      })
    });

    const goldAnalysis = TQG.analyze({
      sourceText: testCase.sourceText,
      targetText: testCase.repair.expectedTarget,
      glossaryText: testCase.glossaryText
    });
    const matchesCanonicalGold = equalText(
      result.output,
      testCase.repair.expectedTarget
    );
    const goldTargetIsClean = goldAnalysis.findings.length === 0;

    const outcome = {
      caseId: testCase.id,
      status: result.status,
      accepted: result.accepted === true,
      revalidated: result.meta?.revalidated === true,
      canonicalGoldMatch: matchesCanonicalGold,
      goldTargetStatus: goldAnalysis.status,
      goldTargetIsClean,
      outputHash: crypto.createHash('sha256').update(result.output || '').digest('hex')
    };
    check(
      outcome.accepted &&
      outcome.status === 'ACCEPTED' &&
      outcome.revalidated &&
      outcome.canonicalGoldMatch &&
      outcome.goldTargetIsClean,
      testCase.id + ': repaired candidate must exactly match synthetic gold target and be clean'
    );
    outcomes.push(outcome);
  }

  return {
    mode: 'PUBLIC_SYNTHETIC_CONTRACT',
    cases: outcomes.length,
    canonicalGoldMatches: outcomes.filter(x => x.canonicalGoldMatch).length,
    cleanGoldTargets: outcomes.filter(x => x.goldTargetIsClean).length,
    revalidatedAccepted: outcomes.filter(x => x.accepted && x.revalidated).length,
    pass: true
  };
}

function validatePrivateGoldTargetCase(testCase) {
  check(typeof testCase.caseId === 'string' && testCase.caseId.length > 0,
    'private caseId is required');
  check(typeof testCase.sourceText === 'string',
    testCase.caseId + ': sourceText is required');
  check(typeof testCase.brokenTargetText === 'string',
    testCase.caseId + ': brokenTargetText is required');
  check(typeof testCase.goldTargetText === 'string',
    testCase.caseId + ': goldTargetText is required');
  check(typeof testCase.candidateTargetText === 'string',
    testCase.caseId + ': candidateTargetText is required');
  check(Array.isArray(testCase.acceptableTargetTexts) &&
    testCase.acceptableTargetTexts.length >= 1,
    testCase.caseId + ': acceptableTargetTexts must contain at least one adjudicated target');
  check(testCase.acceptableTargetTexts.some(target =>
    equalText(target, testCase.goldTargetText)
  ), testCase.caseId + ': canonical goldTargetText must be an acceptable adjudicated target');
  check(testCase.review?.status === 'GOLD_REVIEWED',
    testCase.caseId + ': review.status must be GOLD_REVIEWED');
  check(Number.isInteger(testCase.review?.independentReviewers) &&
    testCase.review.independentReviewers >= 2,
    testCase.caseId + ': at least two independent reviewers are required');
  check(testCase.adjudication?.anomalyConfirmed === true,
    testCase.caseId + ': anomalyConfirmed must be true');
  check(testCase.adjudication?.anomalyRemoved === true,
    testCase.caseId + ': anomalyRemoved must be true');
  check(testCase.adjudication?.meaningPreserved === true,
    testCase.caseId + ': meaningPreserved must be true');
  check(testCase.adjudication?.noNewMeaningChange === true,
    testCase.caseId + ': noNewMeaningChange must be true');

  const hashes = {
    source: contentHash(testCase.sourceText),
    brokenTarget: contentHash(testCase.brokenTargetText),
    goldTarget: contentHash(testCase.goldTargetText),
    candidateTarget: contentHash(testCase.candidateTargetText)
  };
  check(testCase.contentHashes && typeof testCase.contentHashes === 'object',
    testCase.caseId + ': contentHashes are required');
  {
    check(testCase.contentHashes.source === hashes.source,
      testCase.caseId + ': source content hash mismatch');
    check(testCase.contentHashes.brokenTarget === hashes.brokenTarget,
      testCase.caseId + ': broken target content hash mismatch');
    check(testCase.contentHashes.goldTarget === hashes.goldTarget,
      testCase.caseId + ': gold target content hash mismatch');
    check(testCase.contentHashes.candidateTarget === hashes.candidateTarget,
      testCase.caseId + ': candidate target content hash mismatch');
  }

  const candidateMatchesCanonical = equalText(
    testCase.candidateTargetText,
    testCase.goldTargetText
  );
  const candidateMatchesAcceptable = testCase.acceptableTargetTexts.some(
    acceptable => equalText(testCase.candidateTargetText, acceptable)
  );
  const exactGoldAnalysis = TQG.analyze({
    sourceText: testCase.sourceText,
    targetText: testCase.goldTargetText,
    glossaryText: testCase.glossaryText || ''
  });
  const candidateAnalysis = TQG.analyze({
    sourceText: testCase.sourceText,
    targetText: testCase.candidateTargetText,
    glossaryText: testCase.glossaryText || ''
  });

  return {
    caseId: testCase.caseId,
    canonicalExactMatch: candidateMatchesCanonical,
    acceptableGoldMatch: candidateMatchesAcceptable,
    goldTargetStatus: exactGoldAnalysis.status,
    goldTargetFindings: exactGoldAnalysis.findings.length,
    candidateStatus: candidateAnalysis.status,
    candidateFindings: candidateAnalysis.findings.length,
    semanticGoldAdjudicationPassed: true
  };
}

async function runPrivateGoldTargetReplay() {
  if (!fs.existsSync(PRIVATE_DATASET_PATH)) {
    return {
      mode: 'REAL_WORLD_PRIVATE',
      status: 'DEFERRED',
      reason: 'No private C2 gold-repaired-target dataset is available in this environment.',
      datasetPath: PRIVATE_DATASET_PATH,
      cases: 0,
      pass: null
    };
  }

  check(!tracked(PRIVATE_DATASET_PATH),
    'private gold-repaired-target dataset must not be tracked by Git');

  const dataset = JSON.parse(fs.readFileSync(PRIVATE_DATASET_PATH, 'utf8'));
  check(dataset.dataset === 'TQG-semantic-gold-repaired-targets',
    'unexpected private semantic gold dataset identifier');
  check(dataset.version === 1,
    'unsupported private semantic gold dataset version');
  check(dataset.sourceDataset === 'TQG-C2-real-world-gold',
    'private semantic gold dataset must derive from locked C2');
  check(dataset.reviewPolicy?.minimumIndependentReviewers >= 2,
    'private review policy must require two independent reviewers');
  check(Array.isArray(dataset.cases) && dataset.cases.length > 0,
    'private semantic gold dataset must contain cases');

  const caseIds = new Set();
  const outcomes = dataset.cases.map(testCase => {
    check(!caseIds.has(testCase.caseId),
      testCase.caseId + ': duplicate caseId');
    caseIds.add(testCase.caseId);
    return validatePrivateGoldTargetCase(testCase);
  });

  const accepted = outcomes.filter(x => x.acceptableGoldMatch);
  const canonical = outcomes.filter(x => x.canonicalExactMatch);
  const acceptableGoldMatchRate = outcomes.length ? accepted.length / outcomes.length : null;
  const canonicalExactMatchRate = outcomes.length ? canonical.length / outcomes.length : null;
  const allCasesGoldAdjudicated = outcomes.every(x => x.semanticGoldAdjudicationPassed);

  check(
    allCasesGoldAdjudicated,
    'all private semantic gold cases must carry explicit adjudication'
  );
  check(
    acceptableGoldMatchRate === 1,
    'semantic gold-target gate requires every captured candidate to match an adjudicated acceptable target'
  );

  const report = {
    mode: 'REAL_WORLD_PRIVATE',
    status: 'VALIDATED',
    cases: outcomes.length,
    canonicalExactMatches: canonical.length,
    acceptableGoldMatches: accepted.length,
    canonicalExactMatchRate,
    acceptableGoldMatchRate,
    allCasesGoldAdjudicated,
    pass: true,
    outcomes
  };
  report.digest = crypto.createHash('sha256')
    .update(JSON.stringify(report))
    .digest('hex');
  return report;
}

const synthetic = await runSyntheticGoldTargetContract();
const realWorld = await runPrivateGoldTargetReplay();

const summary = {
  pass: synthetic.pass === true &&
    (realWorld.status === 'DEFERRED' || realWorld.pass === true),
  validatorVersion: 'TQG-SEMANTIC-GOLD-01',
  tqgVersion: TQG.version,
  repairVersion: Repair.version,
  synthetic,
  realWorld,
  semanticAccuracyClaim: realWorld.status === 'VALIDATED'
    ? 'REAL_WORLD_PRIVATE_REPLAY_VALIDATED'
    : 'REAL_WORLD_GOLD_TARGET_NOT_AVAILABLE'
};

summary.digest = crypto.createHash('sha256')
  .update(JSON.stringify(summary))
  .digest('hex');

console.log(JSON.stringify(summary, null, 2));

if (!summary.pass) {
  process.exitCode = 1;
}
