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
const MAX_P95_ADDED_MS_PER_OPERATION = 0.05;
const MAX_P99_ADDED_MS_PER_OPERATION = 0.075;

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
function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (fraction) => {
    const index = Math.min(
      sorted.length - 1,
      Math.ceil(sorted.length * fraction) - 1
    );
    return sorted[index];
  };
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    count: samples.length,
    averageMs: total / samples.length,
    p50Ms: percentile(0.50),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: sorted[sorted.length - 1]
  };
}

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

function addedTimePerOperation(base, observed, quantile) {
  const baseValue = base[quantile];
  const observedValue = observed[quantile];
  return Math.max(0, (observedValue - baseValue) / operationsPerTrial);
}

const defaultOverhead = {
  averageAddedMsPerOperation: addedTimePerOperation(
    stats.direct, stats['integrated-default'], 'averageMs'
  ),
  p50AddedMsPerOperation: addedTimePerOperation(
    stats.direct, stats['integrated-default'], 'p50Ms'
  ),
  p95AddedMsPerOperation: addedTimePerOperation(
    stats.direct, stats['integrated-default'], 'p95Ms'
  ),
  p99AddedMsPerOperation: addedTimePerOperation(
    stats.direct, stats['integrated-default'], 'p99Ms'
  )
};
const customOverhead = {
  averageAddedMsPerOperation: addedTimePerOperation(
    stats.direct, stats['integrated-custom'], 'averageMs'
  ),
  p50AddedMsPerOperation: addedTimePerOperation(
    stats.direct, stats['integrated-custom'], 'p50Ms'
  ),
  p95AddedMsPerOperation: addedTimePerOperation(
    stats.direct, stats['integrated-custom'], 'p95Ms'
  ),
  p99AddedMsPerOperation: addedTimePerOperation(
    stats.direct, stats['integrated-custom'], 'p99Ms'
  )
};

console.log(JSON.stringify({
  workloadCases: inputs.length,
  operationsPerTrial,
  repetitionsPerTrial: WORKLOAD_REPETITIONS,
  trials: TRIALS,
  stats,
  defaultObserverAddedMsPerOperation: defaultOverhead,
  customObserverAddedMsPerOperation: customOverhead
}, null, 2));
const gateDefault = [
  ['average', defaultOverhead.averageAddedMsPerOperation, MAX_AVG_ADDED_MS_PER_OPERATION],
  ['p95', defaultOverhead.p95AddedMsPerOperation, MAX_P95_ADDED_MS_PER_OPERATION],
  ['p99', defaultOverhead.p99AddedMsPerOperation, MAX_P99_ADDED_MS_PER_OPERATION]
];
for (const [label, value, limit] of gateDefault) {
  check(
    Number.isFinite(value) && value >= 0 && value <= limit,
    'default observer ' + label + '-added overhead stays within ' + limit + ' ms/operation'
  );
}
const gateCustom = [
  ['average', customOverhead.averageAddedMsPerOperation, MAX_AVG_ADDED_MS_PER_OPERATION],
  ['p95', customOverhead.p95AddedMsPerOperation, MAX_P95_ADDED_MS_PER_OPERATION],
  ['p99', customOverhead.p99AddedMsPerOperation, MAX_P99_ADDED_MS_PER_OPERATION]
];
for (const [label, value, limit] of gateCustom) {
  check(
    Number.isFinite(value) && value >= 0 && value <= limit,
    'custom observer ' + label + '-added overhead stays within ' + limit + ' ms/operation'
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
