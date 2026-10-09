#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(import.meta.url);
const corpus = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests/tqg/corpus-public.json'), 'utf8')
);
const TQG = requireFromRoot(path.join(ROOT, 'tqg.js'));
const Integration = requireFromRoot(path.join(ROOT, 'tqg-integration.js'));

const WORKLOAD_REPETITIONS = 8;
const TRIALS = 15;
const WARMUP_TRIALS = 3;
const MAX_AVG_ADDED_MS_PER_OPERATION = 0.05;
const MAX_P50_ADDED_MS_PER_OPERATION = 0.05;

function check(condition, message) {
  assert.ok(condition, message);
  console.log('PASS  ' + message);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])])
    );
  }
  return value;
}

const inputs = corpus.cases.map((testCase) => ({
  sourceText: testCase.sourceText,
  targetText: testCase.targetText,
  glossaryText: testCase.glossaryText
}));
const integrationInputs = inputs.map((input) => ({
  ...input,
  completed: true
}));
const customObserver = Object.freeze({ emit: () => true });
const customIntegrationInputs = integrationInputs.map((input) => ({
  ...input,
  observer: customObserver
}));
check(inputs.length === 120, 'D5 benchmark uses the locked 120-case public corpus');
const baselinePayload = corpus.cases.map((testCase) => ({
  id: testCase.id,
  result: stable(TQG.analyze({
    sourceText: testCase.sourceText,
    targetText: testCase.targetText,
    glossaryText: testCase.glossaryText
  }))
}));
const baselineDigest = crypto.createHash('sha256')
  .update(JSON.stringify(baselinePayload))
  .digest('hex');
check(
  baselineDigest === '8454843fcaafbc487000979ce821c94b4b63e8d4a9c8427b1595c7c85c038d95',
  'D5 preserves the locked C1 deterministic-equivalence digest'
);

function runWorkload(mode) {
  const start = performance.now();
  const workloadInputs = mode === 'direct'
    ? inputs
    : mode === 'integrated-default'
      ? integrationInputs
      : customIntegrationInputs;
  for (let repeat = 0; repeat < WORKLOAD_REPETITIONS; repeat += 1) {
    for (const input of workloadInputs) {
      if (mode === 'direct') {
        TQG.analyze(input);
      } else {
        Integration.analyzeCompletedOutput(input);
      }
    }
  }
  return performance.now() - start;
}

for (const mode of ['direct', 'integrated-default', 'integrated-custom']) {
  for (let i = 0; i < WARMUP_TRIALS; i += 1) runWorkload(mode);
}
function percentile(samples, fraction) {
  assert.ok(Array.isArray(samples) && samples.length > 0, 'percentile requires samples');
  assert.ok(fraction >= 0 && fraction <= 1, 'percentile fraction is in [0, 1]');
  const sorted = [...samples].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * weight);
}

function summarize(samples) {
  assert.ok(samples.length > 0, 'summarize requires samples');
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    count: samples.length,
    averageMs: total / samples.length,
    p50Ms: percentile(sorted, 0.50),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted[sorted.length - 1]
  };
}

check(percentile([1, 2, 3, 4, 5], 0.50) === 3,
  'D5 percentile helper uses interpolated quantile semantics');
check(percentile([1, 2, 3, 4, 5], 0.95) > 4 && percentile([1, 2, 3, 4, 5], 0.95) < 5,
  'D5 p95 reporting does not collapse to the maximum for five ordered samples');
check(percentile([1, 2, 3, 4], 0.50) === 2.5,
  'D5 percentile helper handles an even sample count');

const samples = {
  direct: [],
  'integrated-default': [],
  'integrated-custom': []
};
const modes = ['direct', 'integrated-default', 'integrated-custom'];
for (let trial = 0; trial < TRIALS; trial += 1) {
  const offset = trial % modes.length;
  const order = modes.slice(offset).concat(modes.slice(0, offset));
  for (const mode of order) samples[mode].push(runWorkload(mode));
}

const stats = {
  direct: summarize(samples.direct),
  'integrated-default': summarize(samples['integrated-default']),
  'integrated-custom': summarize(samples['integrated-custom'])
};

const operationsPerTrial = inputs.length * WORKLOAD_REPETITIONS;

function summarizePairedOverhead(baseSamples, observedSamples, operationCount) {
  assert.equal(baseSamples.length, observedSamples.length,
    'paired overhead requires an equal number of base and observed trials');
  assert.ok(baseSamples.length > 0, 'paired overhead requires trials');
  assert.ok(Number.isFinite(operationCount) && operationCount > 0,
    'paired overhead requires a positive operation count');
  const deltas = observedSamples.map((value, index) => value - baseSamples[index]);
  return {
    count: deltas.length,
    averageDeltaMs: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
    p50DeltaMs: percentile(deltas, 0.50),
    p95DeltaMs: percentile(deltas, 0.95),
    p99DeltaMs: percentile(deltas, 0.99),
    maxDeltaMs: Math.max(...deltas),
    averageAddedMsPerOperation: deltas.reduce((sum, value) => sum + value, 0) / deltas.length / operationCount,
    p50AddedMsPerOperation: percentile(deltas, 0.50) / operationCount,
    p95AddedMsPerOperation: percentile(deltas, 0.95) / operationCount,
    p99AddedMsPerOperation: percentile(deltas, 0.99) / operationCount,
    maxAddedMsPerOperation: Math.max(...deltas) / operationCount
  };
}

function passesOverheadGate(metrics) {
  // Negative paired deltas indicate no added overhead; p95/p99 remain descriptive.
  return Math.max(0, metrics.averageAddedMsPerOperation) <= MAX_AVG_ADDED_MS_PER_OPERATION &&
    Math.max(0, metrics.p50AddedMsPerOperation) <= MAX_P50_ADDED_MS_PER_OPERATION;
}

const defaultOverhead = summarizePairedOverhead(
  samples.direct, samples['integrated-default'], operationsPerTrial
);
const customOverhead = summarizePairedOverhead(
  samples.direct, samples['integrated-custom'], operationsPerTrial
);

// Test the gate decision independently from noisy wall-clock timing. Ten injected,
// above-threshold regressions must all be rejected; normal timing remains benchmarked below.
const injectedAttempts = Array.from({ length: 10 }, () => {
  const base = Array(15).fill(1);
  const regressed = base.map((value) => value + MAX_AVG_ADDED_MS_PER_OPERATION * 2);
  return !passesOverheadGate(summarizePairedOverhead(base, regressed, 1));
});
check(injectedAttempts.filter(Boolean).length >= 9,
  'D5 gate rejects at least 9/10 deterministic injected performance regressions');

console.log(JSON.stringify({
  workloadCases: inputs.length,
  operationsPerTrial,
  repetitionsPerTrial: WORKLOAD_REPETITIONS,
  trials: TRIALS,
  quantileMethod: 'linear interpolation over sorted paired-trial deltas',
  stats,
  defaultObserverPairedAddedMsPerOperation: defaultOverhead,
  customObserverPairedAddedMsPerOperation: customOverhead
}, null, 2));

for (const [label, metrics] of [
  ['default observer', defaultOverhead],
  ['custom observer', customOverhead]
]) {
  check(
    Number.isFinite(metrics.averageAddedMsPerOperation) &&
      Math.max(0, metrics.averageAddedMsPerOperation) <= MAX_AVG_ADDED_MS_PER_OPERATION,
    label + ' average paired-added overhead stays within ' + MAX_AVG_ADDED_MS_PER_OPERATION + ' ms/operation'
  );
  check(
    Number.isFinite(metrics.p50AddedMsPerOperation) &&
      Math.max(0, metrics.p50AddedMsPerOperation) <= MAX_P50_ADDED_MS_PER_OPERATION,
    label + ' p50 paired-added overhead stays within ' + MAX_P50_ADDED_MS_PER_OPERATION + ' ms/operation'
  );
}

Integration.resetObservabilityMetrics();
const before = Integration.observabilityMetrics();
const result = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'single',
  sourceText: 'source',
  targetText: 'target',
  analyze: () => ({ status: 'PASS', findings: [] })
});
const after = Integration.observabilityMetrics();
check(result.status === 'COMPLETED', 'performance benchmark leaves TQG integration operational');
check(
  after.events['tqg.output.completed'] === (before.events['tqg.output.completed'] || 0) + 1 &&
  after.events['tqg.detection.completed'] === (before.events['tqg.detection.completed'] || 0) + 1,
  'performance benchmark preserves expected telemetry event cardinality'
);

console.log('');
console.log('TQG-D5 Performance / Regression: PASS');
