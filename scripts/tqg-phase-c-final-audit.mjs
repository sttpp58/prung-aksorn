#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const BASELINE_COMMIT = '7659d7514cc389f7fc2f1cc23521b3c533a737f9';
const BASELINE_STORAGE_BLOB = 'cb193ed38ad190b9de29d466c79102833066cf70';
const LIMITATION_MARKER = 'Semantic repair accuracy remains DEFERRED: no real-world gold repaired target is committed to the public repository.';

function read(file) {
  const fullPath = path.join(ROOT, file);
  assert.ok(fs.existsSync(fullPath), `required file exists: ${file}`);
  return fs.readFileSync(fullPath, 'utf8');
}
function pass(message) { console.log(`PASS  ${message}`); }
function check(condition, message) { assert.ok(condition, message); pass(message); }
function runNode(file) {
  const result = spawnSync(process.execPath, [path.join(ROOT, file)], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024
  });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    throw new Error(`${file} failed`);
  }
  return result.stdout || '';
}
function git(args) {
  const result = spawnSync('git', args, {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

const report = read('docs/tqg/TQG_PHASE_C_FINAL_AUDIT.md');
const scope = read('docs/tqg/TQG_SCOPE.md');
const regressionGate = read('scripts/regression-gate.mjs');
const tqgRegression = read('scripts/tqg-regression.mjs');
const detector = read('tqg.js');
const inspector = read('tqg-inspector.js');
const repair = read('tqg-repair.js');
const integration = read('tqg-integration.js');
const ui = read('tqg-ui.js');
const indexHtml = read('index.html');
const app = read('app.js');
const appModuleFiles = fs.readdirSync(path.join(ROOT, 'app'))
  .filter((file) => /^\d\d-.*\.js$/.test(file))
  .sort()
  .map((file) => `app/${file}`);
const appRuntime = `${appModuleFiles.map((file) => read(file)).join('\\n')}\\n${app}`;
const sw = read('sw.js');
const workflow = read('.github/workflows/regression-gate.yml');
const gitignore = read('.gitignore');

for (const file of [
  'tqg.js', 'tqg-inspector.js', 'tqg-repair.js', 'tqg-integration.js',
  'tqg-ui.js', 'app.js', 'scripts/tqg-regression.mjs', 'scripts/regression-gate.mjs'
]) {
  const source = read(file);
  const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${file} syntax check failed: ${(result.stderr || '').trim()}`);
  }
  assert.ok(source.length > 0, `${file} is non-empty`);
  pass(`${file} parses as JavaScript`);
}

check(report.includes('C5 Phase C Final Audit'), 'C5 audit report identifies the Phase C final gate');
check(report.includes(`Baseline commit: ${BASELINE_COMMIT}`), 'C5 report records the locked TQG baseline');
check(report.includes('C1 Performance Hardening'), 'C5 report covers C1');
check(report.includes('C2 Real-World Gold Dataset'), 'C5 report covers C2');
check(report.includes('C3 Detector Effectiveness Audit'), 'C5 report covers C3');
check(report.includes('C4 Real-World Repair Validation'), 'C5 report covers C4');
check(report.includes(LIMITATION_MARKER), 'C5 report preserves the semantic repair limitation');
check(scope.includes('Deterministic First'), 'scope lock preserves deterministic-first architecture');
check(scope.includes('Every repair must be re-validated.'), 'scope lock preserves mandatory repair re-validation');
check(scope.includes('whole-chapter automatic rewriting'), 'scope lock preserves whole-chapter repair prohibition');

const corpus = JSON.parse(read('tests/tqg/corpus-public.json'));
check(corpus.schemaVersion === '1.0', 'public corpus schema is v1.0');
check(corpus.caseCount === 120, 'public corpus contains 120 locked cases');
check(Array.isArray(corpus.cases) && corpus.cases.length === 120, 'public corpus data length matches 120');
check(corpus.cases.every((item) =>
  item.safety?.publicSafe === true &&
  item.safety?.syntheticOrMinimal === true &&
  item.safety?.copyrightedFullText === false
), 'all public corpus cases satisfy repository safety flags');
const repairCases = corpus.cases.filter((item) => item.category === 'targeted_repair');
check(repairCases.length >= 6, 'public corpus contains the targeted-repair fixture set');
check(repairCases.every((item) => item.repair && typeof item.repair.expectedTarget === 'string'),
  'repair fixtures contain synthetic expected targets');
check(report.includes('synthetic expected targets'),
  'C5 distinguishes synthetic repair expectations from real-world gold repaired targets');

check(detector.includes("version: 'TQG-04-2026-09-30'"), 'detector/classifier version is locked');
check(detector.includes('aiCalls: 0') && detector.includes('networkAccess: false'),
  'deterministic detector contract remains zero-AI and no-network');
const findingCodes = [
  'FOREIGN_SCRIPT_SPAN', 'SOURCE_LANGUAGE_RESIDUE', 'SOURCE_TEXT_OVERLAP',
  'MIXED_LANGUAGE_SPAN', 'PROMPT_LEAKAGE', 'REPEATED_TEXT',
  'STRUCTURAL_TRUNCATION', 'PARAGRAPH_LOSS', 'QUOTE_ANOMALY',
  'PUA_OR_REPLACEMENT_CHAR'
];
for (const code of findingCodes) {
  check(detector.includes(`'${code}'`) || detector.includes(`"${code}"`),
    `detector retains finding code: ${code}`);
}

check(inspector.includes("version: 'TQG-05-2026-09-30'"), 'AI Inspector version is locked');
check(inspector.includes('bounded suspicious span'), 'AI Inspector keeps a bounded suspicious span');
check(repair.includes("version: 'TQG-06-2026-09-30'"), 'Targeted Repair version is locked');
for (const token of [
  'revalidateRepair',
  'original-finding-remains-in-repaired-region',
  'finding-remains-in-repaired-region',
  'preserve'
]) {
  check(repair.includes(token), `repair module retains fail-closed invariant: ${token}`);
}
check(integration.includes("version: 'TQG-08-2026-09-30'"), 'Integration version is locked');
check(integration.includes('completed-output boundary'), 'Integration retains an explicit completion boundary');
check(ui.includes("version: 'TQG-07-2026-09-30'"), 'Quality UI version is locked');
check(!/[\u{1F000}-\u{1FAFF}]/u.test(ui), 'Quality UI contains no emoji characters');

check(appRuntime.includes('TQGIntegration'), 'application runtime contains TQG integration boundary');
check(appRuntime.includes('analyzeTQGCompletedOutput'), 'application runtime uses the centralized completed-output TQG helper');
check(appRuntime.includes("state.source !== 'translate'"), 'TQG integration remains translate-only');
check(sw.includes('./tqg.js') && sw.includes('./tqg-inspector.js') &&
  sw.includes('./tqg-repair.js') && sw.includes('./tqg-ui.js') &&
  sw.includes('./tqg-integration.js'),
  'Service Worker includes all TQG runtime modules');
check(workflow.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'),
  'workflow pins actions/checkout to an immutable SHA');
check(workflow.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'),
  'workflow pins actions/setup-node to an immutable SHA');
check(gitignore.includes('/backup/*.json'), 'repository keeps the runtime backup JSON guard');

const storageBlob = git(['hash-object', 'storage-v2.js']);
check(storageBlob === BASELINE_STORAGE_BLOB,
  'storage-v2.js is byte-identical to the locked pre-TQG baseline');

const trackedBackups = git(['ls-files', 'backup/*.json']);
check(trackedBackups === '', 'no runtime/user backup JSON is tracked in the repository');

const forbiddenSecretPatterns = [
  /x-goog-api-key\s*=/i,
  /AIza[0-9A-Za-z_-]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/
];
const tqgSurface = [
  report, scope, tqgRegression, detector, inspector, repair, integration, ui,
  corpus.cases.map((item) => JSON.stringify(item)).join('\n')
].join('\n');
for (const pattern of forbiddenSecretPatterns) {
  check(!pattern.test(tqgSurface), `TQG surface passes secret-pattern scan: ${pattern}`);
}

const tqgRegressionOutput = runNode('scripts/tqg-regression.mjs');
check(/TQG-09 Regression: PASS/.test(tqgRegressionOutput),
  'TQG-09 regression passes inside the C5 gate');
check(/tqg-phase-c-final-audit\.mjs/.test(regressionGate),
  'existing Regression Gate invokes the C5 final audit');

console.log('');
console.log('Engineering safety gate: PASS');
console.log(LIMITATION_MARKER);
console.log('TQG Phase C Final Audit: PASS WITH LIMITATION');
