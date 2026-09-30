#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(import.meta.url);
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/tqg/corpus-public.json'), 'utf8'));
const TQG = requireFromRoot(path.join(ROOT, 'tqg.js'));

const EXPECTED_BASELINE_SHA256 = '8454843fcaafbc487000979ce821c94b4b63e8d4a9c8427b1595c7c85c038d95';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

const payload = corpus.cases.map((testCase) => ({
  id: testCase.id,
  result: stable(TQG.analyze({
    sourceText: testCase.sourceText,
    targetText: testCase.targetText,
    glossaryText: testCase.glossaryText
  }))
}));

const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
assert.equal(corpus.caseCount, 120, 'C1 equivalence uses the locked 120-case corpus');
assert.equal(digest, EXPECTED_BASELINE_SHA256, 'TQG output is exactly equivalent to the pre-C1 baseline');

console.log('PASS  C1 deterministic equivalence: 120/120 corpus results match baseline');
console.log('PASS  baseline digest: ' + digest);
