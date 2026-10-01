#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(import.meta.url);

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function check(condition, message) {
  assert.ok(condition, message);
  console.log('PASS  ' + message);
}

const source = read('tqg-integration.js');
const Integration = requireFromRoot(path.join(ROOT, 'tqg-integration.js'));

check(Integration.OBSERVABILITY_SCHEMA_VERSION === 'TQG-OBS-01', 'D4 retains the locked observability schema');
check(Integration.OBSERVABILITY_EVENTS.length === 6, 'D4 retains the complete event vocabulary');
check(Integration.version === 'TQG-08-2026-09-30', 'D4 does not change the TQG-08 integration contract version');

const captured = [];
const observer = {
  emit(event) {
    captured.push(event);
    return true;
  }
};

Integration.resetObservabilityMetrics();
const analysis = { status: 'REVIEW', findings: [] };
const result = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'single',
  sourceText: 'PRIVATE_SOURCE',
  targetText: 'PRIVATE_TARGET',
  glossaryText: 'PRIVATE_GLOSSARY',
  analyze: () => analysis,
  observer
});
check(result.status === 'COMPLETED', 'normal TQG execution remains successful with an injected observer');
check(result.analysis === analysis, 'observer integration preserves the original analysis object');
check(captured.length === 2, 'normal execution emits only output and detection events');
check(Object.isFrozen(captured[0]) && Object.isFrozen(captured[1]), 'sink events are frozen');
check(Object.isFrozen(captured[1].findingCodes), 'finding-code arrays are frozen');

const serialized = JSON.stringify(captured);
for (const marker of ['PRIVATE_SOURCE', 'PRIVATE_TARGET', 'PRIVATE_GLOSSARY', 'analysis', 'sourceText', 'targetText']) {
  check(!serialized.includes(marker), 'telemetry remains isolated from content-bearing marker: ' + marker);
}

const metricsSnapshot = Integration.observabilityMetrics();
check(Object.isFrozen(metricsSnapshot), 'metrics snapshot is frozen at the outer boundary');
check(Object.isFrozen(metricsSnapshot.events), 'metrics event map is frozen');
check(Object.isFrozen(metricsSnapshot.durationsMs), 'metrics duration map is frozen');
assert.throws(
  () => { metricsSnapshot.events.localMutation = 99; },
  TypeError,
  'mutating a frozen telemetry snapshot is blocked'
);
check(
  Integration.observabilityMetrics().events.localMutation === undefined,
  'telemetry snapshot mutation cannot reach the internal sink'
);

const throwingObserver = {
  emit() {
    throw new Error('observer failure');
  }
};
let analyzerCalls = 0;
const preserved = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'single',
  sourceText: 'source',
  targetText: 'target',
  analyze: () => {
    analyzerCalls += 1;
    return { status: 'PASS', findings: [] };
  },
  observer: throwingObserver
});
check(preserved.status === 'COMPLETED', 'synchronous observer failure cannot fail TQG');
check(analyzerCalls === 1, 'TQG analyzer still runs when the observer throws');

const falseObserver = { emit() { return false; } };
let falseObserverAnalyzerCalls = 0;
const falseResult = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'manual',
  sourceText: 'source',
  targetText: 'target',
  analyze: () => {
    falseObserverAnalyzerCalls += 1;
    return { status: 'HIGH_SUSPICION', findings: [] };
  },
  observer: falseObserver
});
check(falseResult.analysis.status === 'HIGH_SUSPICION', 'observer false acknowledgement does not affect TQG result');
check(falseObserverAnalyzerCalls === 1, 'TQG analyzer still runs when observer acknowledgement is false');

const rejectingObserver = {
  emit() {
    return Promise.reject(new Error('async observer failure'));
  }
};
let rejectionAnalyzerCalls = 0;
const rejectionResult = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'batch',
  sourceText: 'source',
  targetText: 'target',
  analyze: () => {
    rejectionAnalyzerCalls += 1;
    return { status: 'REVIEW', findings: [] };
  },
  observer: rejectingObserver
});
check(rejectionResult.status === 'COMPLETED', 'async observer rejection cannot fail synchronous TQG completion');
check(rejectionAnalyzerCalls === 1, 'TQG analyzer runs after an async observer rejection is scheduled');
let unhandledRejection = false;
function onUnhandledRejection() {
  unhandledRejection = true;
}
process.on('unhandledRejection', onUnhandledRejection);
await new Promise((resolve) => setTimeout(resolve, 0));
process.off('unhandledRejection', onUnhandledRejection);
check(unhandledRejection === false, 'async observer rejection does not escape as an unhandled rejection');

const getterThrowingInput = {};
Object.defineProperty(getterThrowingInput, 'observer', {
  get() {
    throw new Error('observer configuration getter failure');
  }
});

let getterAnalyzerCalls = 0;
const getterResult = Integration.analyzeCompletedOutput({
  ...getterThrowingInput,
  completed: true,
  context: 'single',
  sourceText: 'source',
  targetText: 'target',
  analyze: () => {
    getterAnalyzerCalls += 1;
    return { status: 'PASS', findings: [] };
  }
});
check(getterResult.status === 'COMPLETED', 'observer configuration getter failure is isolated from TQG');
check(getterAnalyzerCalls === 1, 'TQG analyzer still runs when observer resolution throws');
const emitGetterObserver = {};
Object.defineProperty(emitGetterObserver, 'emit', {
  get() {
    throw new Error('emit getter failure');
  }
});
let emitGetterAnalyzerCalls = 0;
const emitGetterResult = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'single',
  sourceText: 'source',
  targetText: 'target',
  analyze: () => {
    emitGetterAnalyzerCalls += 1;
    return { status: 'PASS', findings: [] };
  },
  observer: emitGetterObserver
});
check(emitGetterResult.status === 'COMPLETED', 'observer emit getter failure is isolated from TQG');
check(emitGetterAnalyzerCalls === 1, 'TQG analyzer still runs when observer emit resolution throws');

const thenableThrowingObserver = {
  emit() {
    return {
      get then() {
        throw new Error('then getter failure');
      }
    };
  }
};

let thenableAnalyzerCalls = 0;
const thenableResult = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'manual',
  sourceText: 'source',
  targetText: 'target',
  analyze: () => {
    thenableAnalyzerCalls += 1;
    return { status: 'PASS', findings: [] };
  },
  observer: thenableThrowingObserver
});
check(thenableResult.status === 'COMPLETED', 'malformed observer thenables are isolated from TQG');
check(thenableAnalyzerCalls === 1, 'TQG analyzer still runs after malformed observer thenable handling');
const proxyFields = new Proxy({ status: 'COMPLETED', context: 'single' }, {
  ownKeys() {
    throw new Error('malformed telemetry fields');
  }
});
assert.doesNotThrow(
  () => Integration.validateObservationEvent(proxyFields),
  'telemetry validation is total for malformed observer payloads'
);
check(!Integration.validateObservationEvent(proxyFields), 'malformed observer payloads fail closed');
check(
  Integration.buildObservationEvent('tqg.output.completed', proxyFields) === null,
  'malformed observer payloads cannot be converted into sink events'
);

const nestedGetterFields = {};
Object.defineProperty(nestedGetterFields, 'safe', {
  enumerable: true,
  get() {
    throw new Error('unexpected payload getter');
  }
});
check(
  Integration.buildObservationEvent('tqg.output.completed', nestedGetterFields) === null,
  'payload getter failures are rejected before sink delivery'
);

const outboundPatterns = [
  'localStorage',
  'indexedDB',
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'sendBeacon',
  'navigator.sendBeacon',
  'PrungAksornStorageV2',
  'checkpointTranslationJob',
  'updateTranslationJob',
  'translationJobs'
];
for (const pattern of outboundPatterns) {
  check(!source.includes(pattern), 'D4 telemetry layer has no direct app/storage/network coupling: ' + pattern);
}

check(!source.includes('callOpenAI('), 'D4 telemetry layer does not invoke the OpenAI provider');
check(!source.includes('callGemini('), 'D4 telemetry layer does not invoke the Gemini provider');

const independentA = [];
const independentB = [];
Integration.analyzeCompletedOutput({
  completed: true,
  context: 'single',
  sourceText: 'a',
  targetText: 'b',
  analyze: () => ({ status: 'PASS', findings: [] }),
  observer: { emit: (event) => independentA.push(event) }
});
Integration.analyzeCompletedOutput({
  completed: true,
  context: 'batch',
  sourceText: 'c',
  targetText: 'd',
  analyze: () => ({ status: 'PASS', findings: [] }),
  observer: { emit: (event) => independentB.push(event) }
});
check(independentA.length === 2 && independentB.length === 2, 'independent observers receive independent event streams');
check(independentA[0] !== independentB[0], 'observer events are not shared object references');

console.log('');
console.log('TQG-D4 Telemetry Isolation Regression: PASS');
