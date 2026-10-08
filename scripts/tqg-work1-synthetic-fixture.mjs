#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(import.meta.url);
const TQG = requireFromRoot(path.join(ROOT, 'tqg.js'));
const output = process.argv[2];

if (!output) {
  throw new Error('Usage: node scripts/tqg-work1-synthetic-fixture.mjs <output.json>');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function makeCase(index) {
  const caseNumber = String(index).padStart(3, '0');
  const sourceText = 'The synthetic warrior walks to the gate in case ' + caseNumber + '.';
  const isRepair = index <= 32;
  const isControl = index > 32 && index <= 64;
  const targetText = isRepair
    ? 'นักรบสังเคราะห์เดินไปที่ประตู The synthetic warrior.'
    : isControl
      ? 'นักรบสังเคราะห์เดินไปที่ประตู WebSocket.'
      : 'นักรบสังเคราะห์เดินไปที่ประตูอย่างระมัดระวัง.';
  const analysis = TQG.analyze({ sourceText, targetText, glossaryText: '' });
  const labels = isRepair
    ? 'TRUE_ANOMALY'
    : isControl
      ? 'FALSE_POSITIVE'
      : ['LEGITIMATE_FOREIGN', 'LEGITIMATE_TECHNICAL', 'STRUCTURAL_ERROR', 'META/PROMPT_LEAK'][index % 4];
  const buckets = ['RANDOM_CLEAN', 'RANDOM_MIXED', 'TQG_FLAGGED', 'EDGE_CASE'];

  return {
    caseId: 'C2-' + caseNumber,
    samplingBucket: buckets[(index - 1) % buckets.length],
    id: 'synthetic-' + caseNumber,
    bookId: 'synthetic-book',
    chapterNumber: index,
    sourceLen: sourceText.length,
    targetLen: targetText.length,
    goldLabel: labels,
    goldRationale: 'Synthetic fixture for harness isolation only; not a real-world gold judgment.',
    goldEvidence: analysis.findings.slice(0, 4).map(item => ({ code: item.code, text: item.text })),
    reviewStatus: 'SYNTHETIC_FIXTURE',
    contentHash: sha256(sourceText + '\0' + targetText),
    sourceText,
    targetText,
    glossaryText: '',
    tqg: {
      status: analysis.status,
      codes: [...new Set(analysis.findings.map(item => item.code))].sort(),
      detectorVersion: TQG.version
    }
  };
}

const fixture = {
  dataset: 'TQG-C2-real-world-gold',
  schemaVersion: '1.0',
  synthetic: true,
  warning: 'Synthetic fixture for harness/concurrency testing only. It is not private production data or semantic gold.',
  cases: Array.from({ length: 175 }, (_, index) => makeCase(index + 1))
};

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(path.resolve(output), JSON.stringify(fixture, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ output: path.resolve(output), cases: fixture.cases.length, synthetic: true }, null, 2));
