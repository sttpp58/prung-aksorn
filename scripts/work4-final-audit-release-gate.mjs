#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

function pass(message) {
  console.log('PASS  ' + message);
}

function check(condition, message) {
  assert.ok(condition, message);
  pass(message);
}

function read(file) {
  const fullPath = path.join(ROOT, file);
  assert.ok(fs.existsSync(fullPath), 'required release artifact exists: ' + file);
  return fs.readFileSync(fullPath, 'utf8');
}

function git(args) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + (result.stderr || '').trim());
  }
  return (result.stdout || '').trim();
}

function runNode(file, label) {
  const result = spawnSync(process.execPath, [path.join(ROOT, file)], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024
  });
  const output = (result.stdout || '') + (result.stderr || '');
  if (result.status !== 0) {
    console.error(output);
    throw new Error(label + ' failed with exit code ' + result.status);
  }
  return output;
}

const REQUIRED_FILES = [
  'index.html',
  'storage-v2.js',
  'sw.js',
  'manifest.json',
  'tqg.js',
  'tqg-inspector.js',
  'tqg-repair.js',
  'tqg-ui.js',
  'tqg-integration.js',
  'scripts/regression-gate.mjs',
  'scripts/tqg-regression.mjs',
  'scripts/tqg-phase-c-final-audit.mjs',
  'scripts/tqg-work1-semantic-gold-validation.mjs',
  'scripts/tqg-work2-effectiveness-audit.mjs',
  'scripts/tqg-semantic-gold-target-validation.mjs',
  'tests/tqg/tqg-work1-semantic-gold-regression.mjs',
  'tests/tqg/tqg-work2-effectiveness-regression.mjs',
  'tests/e2e/browser-real-user-scenario.mjs',
  'tests/e2e/failure-injection.mjs',
  'tests/e2e/backup-restore-real-world.mjs',
  'tests/e2e/translation-job-recovery-stress.mjs',
  'tests/e2e/tqg-production-assurance.mjs',
  'docs/tqg/TQG_WORK1_INDEPENDENT_SEMANTIC_GOLD.md',
  'docs/tqg/TQG_WORK2_EFFECTIVENESS_HARDENING.md',
  'docs/tqg/TQG_WORK3_PRODUCTION_ASSURANCE.md',
  'docs/tqg/TQG_SEMANTIC_GOLD_TARGET_VALIDATION.md',
  'docs/tqg/TQG_PHASE_C_FINAL_AUDIT.md'
];

for (const file of REQUIRED_FILES) read(file);
check(true, 'all required engineering and release artifacts are present');

const WORK4_DOC = read('docs/WORK4_FINAL_AUDIT_RELEASE_GATE.md');
const REGRESSION_GATE = read('scripts/regression-gate.mjs');
const TQG_SCOPE = read('docs/tqg/TQG_SCOPE.md');

check(
  WORK4_DOC.includes('WORK 4 — Final Audit / Release Gate') &&
    WORK4_DOC.includes('PASS WITH LIMITATION') &&
    WORK4_DOC.includes('Semantic repair accuracy remains DEFERRED'),
  'WORK 4 document preserves the final engineering gate and semantic limitation'
);

check(
  TQG_SCOPE.includes('translation engine rewrite') &&
    TQG_SCOPE.includes('IndexedDB redesign') &&
    TQG_SCOPE.includes('Translation Job redesign'),
  'TQG scope lock still protects core architecture boundaries'
);

check(
  REGRESSION_GATE.includes('TQG Production Assurance browser runner is present') &&
    REGRESSION_GATE.includes('Translation Job Recovery Stress runner is present'),
  'existing Regression Gate retains prior hardening and recovery contracts'
);
const WORKFLOWS = [
  '.github/workflows/regression-gate.yml',
  '.github/workflows/browser-e2e.yml',
  '.github/workflows/failure-injection.yml',
  '.github/workflows/backup-restore-real-world.yml',
  '.github/workflows/translation-job-recovery-stress.yml',
  '.github/workflows/tqg-semantic-gold-target-validation.yml',
  '.github/workflows/tqg-production-assurance.yml',
  '.github/workflows/release-gate.yml'
];

for (const workflowFile of WORKFLOWS) {
  const workflow = read(workflowFile);
  check(
    workflow.includes('pull_request:') &&
      workflow.includes('branches:') &&
      workflow.includes('- main'),
    workflowFile + ' runs against the main release boundary'
  );
  check(
    workflow.includes('permissions:') && workflow.includes('contents: read'),
    workflowFile + ' uses read-only repository permissions'
  );
  const uses = [...workflow.matchAll(/uses:\s+([^\s@]+)@([^\s]+)/g)];
  check(uses.length > 0, workflowFile + ' declares immutable-action steps');
  for (const use of uses) {
    check(
      /^[0-9a-f]{40}$/.test(use[2]),
      workflowFile + ' pins action ' + use[1] + ' to a full SHA'
    );
  }
}

const trackedBackups = git(['ls-files', 'backup/*.json']);
check(trackedBackups === '', 'no runtime/user backup JSON is tracked');

const trackedPrivateCorpus = git(['ls-files', 'tests/tqg/c2-private']);
check(trackedPrivateCorpus === '', 'private C2 corpus is not tracked');

const secretScanPaths = git(['ls-files'])
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.startsWith('tests/tqg/c2-private/'));
const SECRET_PATTERNS = [
  /(?:sk|rk)-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/
];

let secretHits = 0;
for (const file of secretScanPaths) {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) continue;
  const stat = fs.statSync(fullPath);
  if (stat.size > 2_000_000) continue;
  const content = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      console.error('SECRET-LIKE MATCH in ' + file);
      secretHits += 1;
    }
  }
}
check(secretHits === 0, 'tracked release surface passes secret-pattern scan');

const PROTECTED_FILES = [
  'storage-v2.js',
  'sw.js',
  'tqg-inspector.js',
  'tqg-repair.js',
  'tqg-integration.js',
  'tqg-ui.js'
];

for (const file of PROTECTED_FILES) {
  const baseline = git(['rev-parse', 'main:' + file]);
  const current = git(['hash-object', file]);
  check(
    current === baseline,
    file + ' remains blob-identical to main'
  );
}

const syntaxFiles = [
  'tqg.js',
  'tqg-inspector.js',
  'tqg-repair.js',
  'tqg-ui.js',
  'tqg-integration.js',
  'scripts/regression-gate.mjs',
  'scripts/tqg-regression.mjs',
  'scripts/tqg-phase-c-final-audit.mjs',
  'scripts/tqg-work1-semantic-gold-validation.mjs',
  'scripts/tqg-work2-effectiveness-audit.mjs',
  'scripts/tqg-semantic-gold-target-validation.mjs',
  'scripts/work4-final-audit-release-gate.mjs',
  'tests/tqg/tqg08-integration-regression.mjs',
  'tests/e2e/tqg-production-assurance.mjs'
];

for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  check(result.status === 0, file + ' passes Node syntax validation');
}
const diffCheck = spawnSync('git', ['diff', '--check'], {
  cwd: ROOT,
  encoding: 'utf8'
});
check(diffCheck.status === 0, 'working-tree diff has no whitespace errors');

const cachedDiffCheck = spawnSync('git', ['diff', '--cached', '--check'], {
  cwd: ROOT,
  encoding: 'utf8'
});
check(cachedDiffCheck.status === 0, 'staged diff has no whitespace errors');

const requiredDocs = [
  'docs/tqg/TQG_WORK1_INDEPENDENT_SEMANTIC_GOLD.md',
  'docs/tqg/TQG_WORK2_EFFECTIVENESS_HARDENING.md',
  'docs/tqg/TQG_WORK3_PRODUCTION_ASSURANCE.md',
  'docs/WORK4_FINAL_AUDIT_RELEASE_GATE.md'
];

for (const file of requiredDocs) {
  const content = read(file);
  check(
    !content.includes('semantic repair accuracy: 100%') &&
      !content.includes('semantic repair accuracy is 100%'),
    file + ' does not overclaim semantic repair accuracy'
  );
}
check(
  !/gold-repaired-targets\.json/.test(git(['ls-files'])),
  'real-world gold repaired-target dataset is not tracked'
);

const directChecks = [
  ['scripts/tqg-phase-c-final-audit.mjs', 'TQG Phase C Final Audit', 'TQG Phase C Final Audit: PASS WITH LIMITATION'],
  ['scripts/tqg-work1-semantic-gold-validation.mjs', 'TQG Work 1 semantic-gold validation', '"pass": true'],
  ['scripts/tqg-work2-effectiveness-audit.mjs', 'TQG Work 2 effectiveness audit', '"pass": true'],
  ['scripts/tqg-semantic-gold-target-validation.mjs', 'TQG semantic gold-target validation', '"pass": true']
];

for (const [file, label, marker] of directChecks) {
  const output = runNode(file, label);
  check(
    output.includes(marker),
    label + ' returns its expected gated result contract'
  );
}

const regression = runNode('scripts/regression-gate.mjs', 'Repository Regression Gate');
check(/Regression Gate: PASS/.test(regression), 'Repository Regression Gate: PASS');

const tqgRegression = runNode('scripts/tqg-regression.mjs', 'TQG-09 Regression');
check(/TQG-09 Regression: PASS/.test(tqgRegression), 'TQG-09 Regression: PASS');

const work2 = runNode('tests/tqg/tqg-work2-effectiveness-regression.mjs', 'WORK 2 regression');
check(/TQG WORK 2 Regression: PASS/.test(work2), 'WORK 2 regression: PASS');

const work1 = runNode('tests/tqg/tqg-work1-semantic-gold-regression.mjs', 'WORK 1 regression');
check(/PASS/.test(work1), 'WORK 1 regression: PASS');
const E2E_CHECKS = [
  ['tests/e2e/tqg-production-assurance.mjs', 'TQG Production Assurance', 'TQG Production Assurance: PASS'],
  ['tests/e2e/browser-real-user-scenario.mjs', 'Browser E2E', 'Browser E2E / Real User Scenario: PASS'],
  ['tests/e2e/failure-injection.mjs', 'Failure Injection', 'Failure Injection Matrix: PASS'],
  ['tests/e2e/backup-restore-real-world.mjs', 'Backup / Restore', 'Backup / Restore Real-world Validation: PASS'],
  ['tests/e2e/translation-job-recovery-stress.mjs', 'Recovery Stress', 'Translation Job Recovery Stress Test: PASS']
];

for (const [file, label, marker] of E2E_CHECKS) {
  const output = runNode(file, label);
  check(output.includes(marker), label + ': PASS');
}

const releaseWorkflow = read('.github/workflows/release-gate.yml');
check(
  releaseWorkflow.includes('node scripts/work4-final-audit-release-gate.mjs'),
  'release workflow invokes WORK 4 gate runner'
);

console.log('');
console.log('Engineering Release Gate: PASS WITH LIMITATION');
console.log('Semantic repair accuracy remains DEFERRED: no independent real-world gold repaired-target dataset is tracked.');
