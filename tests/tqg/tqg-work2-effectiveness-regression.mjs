#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(import.meta.url);
const TQG = requireFromRoot(path.join(ROOT, 'tqg.js'));
const audit = path.join(ROOT, 'scripts', 'tqg-work2-effectiveness-audit.mjs');

function run(file, env = {}) {
  const base = { ...process.env };
  delete base.TQG_REQUIRE_WORK2_C2;
  return spawnSync(process.execPath, [file], {
    cwd: ROOT,
    env: { ...base, ...env },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
}
function check(condition, message) {
  assert.ok(condition, message);
  console.log('PASS  ' + message);
}

check(TQG.version === 'TQG-04-2026-09-30', 'WORK 2 remains within the locked TQG V1 detector contract');

const combiningToken = TQG.analyze({
  sourceText: 'A simple source sentence.',
  targetText: 'สวรรค์สวรรค์',
  glossaryText: ''
});
const combiningFinding = combiningToken.findings.find(f => f.code === 'REPEATED_TEXT');
check(Boolean(combiningFinding), 'Unicode-complete Thai repeated unit remains detectable');
check(
  combiningFinding.text === combiningToken.findings
    .find(f => f.code === 'REPEATED_TEXT').text &&
  combiningFinding.text === 'สวรรค์สวรรค์',
  'combining-mark-safe repeated finding is not truncated'
);

const intraToken = TQG.analyze({
  sourceText: 'The great emperor shattered the heavens.',
  targetText: 'มหาจักรพรรดิสวรรค์สวรรค์ทลายเอกภพ',
  glossaryText: ''
});
const intraFinding = intraToken.findings.find(f => f.code === 'REPEATED_TEXT');
check(Boolean(intraFinding), 'bounded intra-token Thai duplication remains detectable');
check(intraFinding.text === 'สวรรค์สวรรค์', 'intra-token finding identifies the exact duplicated lexical unit');
check(
  intraFinding.code === 'REPEATED_TEXT',
  'intra-token detection is emitted through the existing REPEATED_TEXT code'
);

const sound = TQG.analyze({
  sourceText: 'A sound effect.',
  targetText: 'ฮ่าฮ่าฮ่าฮ่า',
  glossaryText: ''
});
check(
  !sound.findings.some(f => f.code === 'REPEATED_TEXT'),
  'short single-letter sound repetition remains outside the hardened intra-token rule'
);
check(
  intraFinding &&
  Number.isInteger(intraFinding.start) &&
  Number.isInteger(intraFinding.end) &&
  intraToken.findings.length > 0,
  'intra-token finding retains a structured span'
);

const privatePath = process.env.TQG_WORK2_C2_DATASET ||
  path.join(ROOT, 'tests', 'tqg', 'c2-private', 'gold-dataset.json');
if (!fs.existsSync(privatePath)) {
  const deferred = run(audit, {
    TQG_WORK2_C2_DATASET: path.join(ROOT, 'missing-work2-c2.json')
  });
  check(deferred.status === 0 && /"status": "DEFERRED"/.test(deferred.stdout),
    'Work 2 production-derived audit defers safely without private C2 data');
  const required = run(audit, {
    TQG_WORK2_C2_DATASET: path.join(ROOT, 'missing-work2-c2.json'),
    TQG_REQUIRE_WORK2_C2: '1'
  });
  check(required.status !== 0, 'Work 2 required production-derived audit fails closed without private data');
} else {
  const result = run(audit);
  check(result.status === 0 && /"pass": true/.test(result.stdout),
    'Work 2 production-derived effectiveness audit passes');
  check(/"FP": 18/.test(result.stdout) && /"FN": 0/.test(result.stdout),
    'Work 2 C2 gate preserves 18 false positives and zero false negatives');
  check(/"nonRepeat": 0/.test(result.stdout),
    'Work 2 C2 deltas are isolated to REPEATED_TEXT semantics');
}

console.log('');
console.log('TQG WORK 2 Regression: PASS');
