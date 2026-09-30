#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import TQG from '../tqg.js';

const SIZES = [2000, 5000, 10000, 20000];
const RUNS = 7;

function repeatToLength(value, targetLength) {
  let output = '';
  while (output.length < targetLength) output += value;
  return output.slice(0, targetLength);
}

function makeCase(size, mode) {
  if (mode === 'repeat') {
    const unit = 'นักรบเดินผ่านประตูอย่างระมัดระวัง แล้วมองกลับไปยังหอคอยที่อยู่ไกลออกไป ';
    const target = repeatToLength(unit, size);
    return { sourceText: 'The warrior walked through the gate carefully and looked back at the distant tower.', targetText: target, glossaryText: '' };
  }

  if (mode === 'foreign') {
    const sourceUnit = 'The warrior walked toward the gate and watched the river carefully. ';
    const targetUnit = 'นักรบเดินไปยังประตูและเฝ้ามองแม่น้ำอย่างระมัดระวัง';
    const targetWithResidue = 'นักรบเดินไปยัง gate and watched the river อย่างระมัดระวัง';
    const sourceText = repeatToLength(sourceUnit, size);
    const targetText = repeatToLength(targetWithResidue + ' ', size);
    const glossaryText = Array.from({ length: 500 }, (_, i) => 'KnownTerm' + i + ' = ศัพท์' + i).join('\n');
    return { sourceText, targetText, glossaryText };
  }

  const unit = 'นักรบเดินไปยังประตูและเฝ้ามองแม่น้ำอย่างระมัดระวัง ';
  return { sourceText: repeatToLength('The warrior walked toward the gate and watched the river carefully. ', size), targetText: repeatToLength(unit, size), glossaryText: '' };
}

function benchmark(input) {
  TQG.analyze(input);
  const samples = [];
  for (let i = 0; i < RUNS; i += 1) {
    const start = performance.now();
    const result = TQG.analyze(input);
    const elapsed = performance.now() - start;
    if (!result || !['PASS', 'REVIEW', 'HIGH_SUSPICION'].includes(result.status)) throw new Error('Invalid TQG benchmark result.');
    samples.push(elapsed);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)];
  return { medianMs: Number(median.toFixed(2)), p95Ms: Number(p95.toFixed(2)), maxMs: Number(samples[samples.length - 1].toFixed(2)) };
}

console.log('TQG-C1 Performance Benchmark');
for (const mode of ['clean', 'repeat', 'foreign']) {
  for (const size of SIZES) {
    const input = makeCase(size, mode);
    const metrics = benchmark(input);
    console.log(JSON.stringify({ mode, size, sourceChars: input.sourceText.length, targetChars: input.targetText.length, glossaryChars: input.glossaryText.length, ...metrics }));
  }
}

const realCasePath = process.env.TQG_C1_REAL_CASE;
if (realCasePath) {
  const resolved = path.resolve(realCasePath);
  if (!fs.existsSync(resolved)) throw new Error('TQG_C1_REAL_CASE does not exist: ' + resolved);
  const real = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const metrics = benchmark({ sourceText: real.source, targetText: real.target, glossaryText: real.glossary || '' });
  console.log(JSON.stringify({ mode: 'real-world', chapterNumber: real.chapterNumber ?? null, sourceChars: real.source.length, targetChars: real.target.length, glossaryChars: (real.glossary || '').length, ...metrics }));
}
