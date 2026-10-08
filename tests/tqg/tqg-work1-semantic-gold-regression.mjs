#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const prepare = path.join(ROOT, 'scripts', 'tqg-work1-semantic-gold-prepare.mjs');
const validate = path.join(ROOT, 'scripts', 'tqg-work1-semantic-gold-validation.mjs');
const generatedTemplateDir = process.env.TQG_WORK1_TEMPLATE ? null :
  fs.mkdtempSync(path.join(os.tmpdir(), 'prung-aksorn-work1-'));
const output = process.env.TQG_WORK1_TEMPLATE ||
  path.join(generatedTemplateDir, 'gold-repaired-targets.review-template.json');
if (generatedTemplateDir) {
  process.on('exit', () => {
    try { fs.rmSync(generatedTemplateDir, { recursive: true, force: true }); } catch {}
  });
}

function run(file, env = {}) {
  const baseEnv = { ...process.env };
  delete baseEnv.TQG_WORK1_SELF_TEST;
  delete baseEnv.TQG_REQUIRE_WORK1_GOLD;
  return spawnSync(process.execPath, [file], {
    cwd: ROOT,
    env: { ...baseEnv, ...env },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
}
function check(condition, message) {
  assert.ok(condition, message);
  console.log('PASS  ' + message);
}

check(fs.existsSync(prepare), 'WORK 1 preparation runner exists');
check(fs.existsSync(validate), 'WORK 1 semantic validator exists');

const syntaxPrepare = run(prepare, { TQG_C2_GOLD_DATASET: path.join(ROOT, 'missing-c2.json') });
check(syntaxPrepare.status !== 0 && /C2 gold dataset not found/.test(syntaxPrepare.stderr),
  'preparation runner refuses missing private C2 dataset');

const deferred = run(validate, {
  TQG_WORK1_GOLD_DATASET: path.join(ROOT, 'missing-work1-gold.json')
});
check(deferred.status === 0 && /"status": "DEFERRED"/.test(deferred.stdout),
  'semantic validator defers safely when private gold dataset is unavailable');

const required = run(validate, {
  TQG_WORK1_GOLD_DATASET: path.join(ROOT, 'missing-work1-gold.json'),
  TQG_REQUIRE_WORK1_GOLD: '1'
});
check(required.status !== 0 && /not available/.test(required.stdout),
  'required semantic-gold mode fails closed when gold dataset is unavailable');

const self = run(validate, { TQG_WORK1_SELF_TEST: '1' });
check(self.status === 0 && /SELF_TEST_PASS/.test(self.stdout),
  'semantic validator self-test passes');
check(/"acceptableGoldMatchRate": 1/.test(self.stdout),
  'self-test verifies acceptable-target semantic match');

const privateC2 = process.env.TQG_C2_GOLD_DATASET ||
  path.join(ROOT, 'tests', 'tqg', 'c2-private', 'gold-dataset.json');
if (!fs.existsSync(privateC2)) {
  console.log('INFO  private C2 dataset unavailable locally; preparation replay remains deferred');
  console.log('TQG WORK 1 Regression: DEFERRED');
  process.exit(0);
}

try {
  fs.unlinkSync(output);
} catch {}
const prepared = run(prepare, { TQG_WORK1_TEMPLATE: output });
check(prepared.status === 0, 'preparation runner creates the Work 1 review template');
const parsed = JSON.parse(fs.readFileSync(output, 'utf8'));
check(parsed.status === 'REVIEW_TEMPLATE', 'prepared dataset remains explicitly a review template');
check(parsed.cases.length === 48, 'prepared review set contains 48 deterministic cases');
check(parsed.selectionPolicy.targetRepairCases === 32 &&
  parsed.selectionPolicy.targetSafetyControls === 16,
  'prepared review set preserves the locked 32/16 split');
check(parsed.cases.filter(item => item.expectedAction === 'REPAIR').length === 32,
  'prepared review set contains 32 repair candidates');
check(parsed.cases.filter(item => item.expectedAction === 'NO_REPAIR').length === 16,
  'prepared review set contains 16 safety controls');
check(new Set(parsed.cases.map(item => item.sourceCaseId)).size === 48,
  'prepared review set has unique C2 source cases');
check(parsed.cases
  .filter(item => item.expectedAction === 'REPAIR')
  .every(item => item.repairSpan &&
    item.repairSpan.end - item.repairSpan.start <= 2000),
  'prepared repair spans stay within the locked 2000-character boundary');
check(parsed.cases.every(item =>
  item.review.status === 'PENDING' &&
  item.review.independentReviewers === 0 &&
  item.tqgBaselineSnapshot &&
  item.tqgCurrentSnapshot &&
  item.candidateTargetText === null &&
  item.goldTargetText === null),
  'prepared cases cannot be mistaken for adjudicated gold');
check(parsed.cases.every(item => item.contentHashes.candidateTarget === null &&
  item.contentHashes.goldTarget === null),
  'prepared cases do not fabricate semantic target hashes');
check(parsed.cases.every(item => item.review.status !== 'GOLD_REVIEWED'),
  'prepared cases do not self-assert gold review');
const firstDigest = parsed.selectionDigest;
fs.unlinkSync(output);

const secondPrepared = run(prepare, { TQG_WORK1_TEMPLATE: output });
check(secondPrepared.status === 0, 'second preparation replay completes');
const secondParsed = JSON.parse(fs.readFileSync(output, 'utf8'));
check(secondParsed.selectionDigest === firstDigest,
  'preparation selection is deterministic across two runs');
fs.unlinkSync(output);
console.log('PASS  review template removed after regression');
console.log('');
console.log('TQG WORK 1 Regression: PASS');
