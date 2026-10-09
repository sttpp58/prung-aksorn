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

function resolveReleaseBase() {
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    assert.ok(eventPath && fs.existsSync(eventPath), 'GitHub pull_request event payload is available');
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const baseSha = event && event.pull_request && event.pull_request.base && event.pull_request.base.sha;
    assert.match(String(baseSha || ''), /^[0-9a-fA-F]{40}$/, 'GitHub pull_request base SHA is valid');
    git(['fetch', '--no-tags', '--depth=1', 'origin', baseSha]);
    return git(['rev-parse', 'FETCH_HEAD']);
  }
  try {
    return git(['rev-parse', 'main']);
  } catch {
    try {
      return git(['rev-parse', 'origin/main']);
    } catch {
      return git(['rev-parse', 'HEAD']);
    }
  }
}

const RELEASE_BASE = resolveReleaseBase();

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

function replaceExactlyOnce(source, before, after) {
  if (!source || !before || source.split(before).length !== 2) return null;
  return source.replace(before, after);
}

function isApprovedServiceWorkerCoherenceFix() {
  const newline = String.fromCharCode(10);
  const baseline = git(['show', RELEASE_BASE + ':sw.js'])
    .split(String.fromCharCode(13) + newline).join(newline);
  const current = read('sw.js')
    .split(String.fromCharCode(13) + newline).join(newline).trimEnd();

  const oldVersionLine = "const APP_RELEASE_VERSION = 'v10';";
  if (baseline.split(oldVersionLine).length !== 2) return false;
  let expected = replaceExactlyOnce(
    baseline,
    oldVersionLine,
    "const APP_RELEASE_VERSION = 'v11';"
  );
  if (!expected) return false;

  const oldFetchBlock = [
    '  event.respondWith(',
    '    caches.match(event.request).then((cached) => {',
    '      const networkFetch = fetch(event.request)',
    '        .then((response) => {',
    '          if (response && response.status === 200) {',
    '            const clone = response.clone();',
    '            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));',
    '          }',
    '          return response;',
    '        })',
    '        .catch(() => cached);',
    '      return cached || networkFetch;',
    '    })',
    '  );'
  ].join(newline);
  const newFetchBlock = [
    '  event.respondWith(',
    '    caches.open(CACHE_NAME).then((cache) => cache.match(event.request).then((cached) => {',
    '      // Do not refresh a cached hit in the background. Doing so can write assets',
    '      // from a newly deployed release into the cache still serving an older worker,',
    '      // yielding a mixed app shell while the update is waiting to activate.',
    '      if (cached) {',
    '        return cached;',
    '      }',
    '',
    "      // Cache misses are fetched and written only into this worker's versioned cache.",
    '      // A new release pre-caches its complete APP_SHELL before activation.',
    '      return fetch(event.request).then((response) => {',
    '        if (response && response.status === 200) {',
    '          return cache.put(event.request, response.clone()).then(() => response);',
    '        }',
    '        return response;',
    '      }).catch(() => cached);',
    '    }))',
    '  );'
  ].join(newline);
  expected = replaceExactlyOnce(expected, oldFetchBlock, newFetchBlock);
  if (!expected || expected.trimEnd() !== current) return false;

  const sw = read('sw.js');
  const html = read('index.html');
  let manifest;
  try {
    manifest = JSON.parse(read('manifest.json'));
  } catch {
    return false;
  }
  const fixture = read('tests/e2e/browser-real-user-scenario.mjs');

  const cachedHitGuard = [
    '      if (cached) {',
    '        return cached;',
    '      }'
  ].join(newline);
  return manifest['x-app-release-version'] === 'v11' &&
    html.includes('<meta name="app-release-version" content="v11">') &&
    sw.includes("const APP_RELEASE_VERSION = 'v11';") &&
    sw.includes("if (url.origin !== self.location.origin) {") &&
    sw.includes("if (event.request.method !== 'GET') {") &&
    sw.includes(cachedHitGuard) &&
    !sw.includes('const networkFetch = fetch(event.request)') &&
    sw.includes('return cache.put(event.request, response.clone()).then(() => response);') &&
    fixture.includes('async function runServiceWorkerVersionCoherenceFixture(cdp, baseUrl)') &&
    fixture.includes('without a cache-version bump the active worker keeps serving a consistent cached A/A release instead of mixing individual B assets') &&
    fixture.includes('versioned cache isolates the B release and serves a consistent B/B asset set') &&
    fixture.includes('offline fallback keeps the active unbumped release assets consistent') &&
    fixture.includes('offline fallback keeps the newly activated versioned release assets consistent');
}

function isApprovedTQGIntegrationFix() {
  const diff = git(['diff', '--unified=0', RELEASE_BASE, 'HEAD', '--', 'tqg-integration.js']);
  const changedLines = diff
    .split(/\r?\n/)
    .filter((line) => /^[+-](?![+-])/.test(line))
    .join('\n');
  return changedLines === [
    '-        glossaryText: text(input.glossaryText)',
    '+        glossaryText: text(input.glossaryText),',
    '+        exceptions: input.exceptions'
  ].join('\n');
}

for (const file of PROTECTED_FILES) {
  const baseline = git(['rev-parse', RELEASE_BASE + ':' + file]);
  const current = git(['hash-object', file]);
  if (file === 'tqg-integration.js' && current !== baseline) {
    const head = git(['rev-parse', 'HEAD:tqg-integration.js']);
    check(
      current === head,
      'tqg-integration.js working tree matches committed HEAD'
    );
    check(
      isApprovedTQGIntegrationFix(),
      'tqg-integration.js contains only the approved explicit-exception forwarding fix'
    );
    continue;
  }
  if (file === 'sw.js' && current !== baseline) {
    const head = git(['rev-parse', 'HEAD:sw.js']);
    check(
      current === head,
      'sw.js working tree matches committed HEAD'
    );
    check(
      isApprovedServiceWorkerCoherenceFix(),
      'sw.js contains only the reproduced D-07 v10-to-v11 cache-coherence fix and passes the browser/version/bypass contract'
    );
    continue;
  }
  check(
    current === baseline,
    file + ' remains blob-identical to release base'
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
