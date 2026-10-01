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

check(Integration.OBSERVABILITY_SCHEMA_VERSION === 'TQG-OBS-01', 'D2 uses the locked observability schema');
check(
  Integration.OBSERVABILITY_EVENTS.length === 6 &&
    Integration.OBSERVABILITY_EVENTS.includes('tqg.output.completed') &&
    Integration.OBSERVABILITY_EVENTS.includes('tqg.detection.completed') &&
    Integration.OBSERVABILITY_EVENTS.includes('tqg.inspector.completed') &&
    Integration.OBSERVABILITY_EVENTS.includes('tqg.repair.completed') &&
    Integration.OBSERVABILITY_EVENTS.includes('tqg.revalidation.completed') &&
    Integration.OBSERVABILITY_EVENTS.includes('tqg.error'),
  'D2 exposes the complete locked event vocabulary'
);
check(Integration.OBSERVABILITY_FINDING_CODES.length === 10, 'D2 preserves all 10 locked finding codes');

const captured = [];
const observer = {
  emit(event) {
    captured.push(event);
    return true;
  }
};

Integration.resetObservabilityMetrics();
const detectionAnalysis = {
  status: 'HIGH_SUSPICION',
  findings: [
    {
      code: 'FOREIGN_SCRIPT_SPAN',
      severity: 'medium',
      start: 10,
      end: 18,
      text: 'SECRET_TARGET_CONTENT',
      evidence: { reason: 'foreign span' }
    },
    {
      code: 'SOURCE_LANGUAGE_RESIDUE',
      severity: 'high',
      start: 20,
      end: 27,
      text: 'SECRET_TARGET_CONTENT',
      evidence: { reason: 'source residue' }
    }
  ]
};

const detected = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'single',
  sourceText: 'SECRET_SOURCE_CONTENT',
  targetText: 'SECRET_TARGET_CONTENT',
  glossaryText: 'SECRET_GLOSSARY_CONTENT',
  analyze: () => detectionAnalysis,
  observer
});
check(detected.status === 'COMPLETED', 'D2 instrumentation preserves deterministic analysis result');
check(captured.length === 2, 'completed output emits output and detection terminal events');
check(captured[0].event === 'tqg.output.completed', 'output completion event is emitted first');
check(captured[1].event === 'tqg.detection.completed', 'detection completion event is emitted second');
check(captured[1].status === 'COMPLETED', 'detection event uses terminal COMPLETED status');
check(captured[1].verdict === 'HIGH_SUSPICION', 'detection event reports the existing verdict');
check(captured[1].findingCount === 2, 'detection event counts finding occurrences');
check(
  JSON.stringify(captured[1].findingCodes) ===
    JSON.stringify(['FOREIGN_SCRIPT_SPAN', 'SOURCE_LANGUAGE_RESIDUE']),
  'detection event reports only locked finding codes'
);
check(Number.isFinite(captured[1].durationMs) && captured[1].durationMs >= 0, 'detection duration is finite and non-negative');
check(captured[1].aiCalls === 0 && captured[1].transportCalls === 0, 'deterministic detection reports zero AI and transport calls');
check(Object.isFrozen(captured[1]), 'emitted telemetry event is immutable at the sink boundary');
check(Object.isFrozen(captured[1].findingCodes), 'finding-code telemetry array is immutable at the sink boundary');

const serialized = JSON.stringify(captured);
for (const forbidden of [
  'SECRET_SOURCE_CONTENT',
  'SECRET_TARGET_CONTENT',
  'SECRET_GLOSSARY_CONTENT',
  'fullPrompt',
  'rawAIResponse',
  'replacementText',
  'apiKey'
]) {
  check(!serialized.includes(forbidden), 'telemetry payload excludes sensitive content marker: ' + forbidden);
}

const invalidExtra = { ...captured[1], targetText: 'SECRET_TARGET_CONTENT' };
check(!Integration.validateObservationEvent(invalidExtra), 'schema validator rejects arbitrary content fields');
const invalidCount = { ...captured[1], findingCount: 99 };
check(!Integration.validateObservationEvent(invalidCount), 'schema validator rejects mismatched finding count');
const invalidCode = { ...captured[1], findingCodes: ['UNKNOWN_CODE'], findingCount: 1 };
check(!Integration.validateObservationEvent(invalidCode), 'schema validator rejects unknown finding codes');
Integration.analyzeCompletedOutput({
  completed: true,
  context: 'single',
  sourceText: 'source',
  targetText: 'target',
  analyze: () => detectionAnalysis
});
const metricsAfterDetection = Integration.observabilityMetrics();
check(
  metricsAfterDetection.events['tqg.output.completed'] === 1 &&
    metricsAfterDetection.events['tqg.detection.completed'] === 1,
  'default runtime observer records terminal event counts'
);
check(
  metricsAfterDetection.findingCodes.FOREIGN_SCRIPT_SPAN === 1 &&
    metricsAfterDetection.findingCodes.SOURCE_LANGUAGE_RESIDUE === 1,
  'default runtime observer records finding-code counts'
);

let throwingObserverCalls = 0;
const throwingObserver = {
  emit() {
    throwingObserverCalls += 1;
    throw new Error('observer failure');
  }
};
const preservedAnalysis = { status: 'REVIEW', findings: [] };
const preserved = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'single',
  sourceText: 'source',
  targetText: 'target',
  analyze: () => preservedAnalysis,
  observer: throwingObserver
});
check(preserved.status === 'COMPLETED', 'observer failure does not fail deterministic TQG');
check(preserved.analysis === preservedAnalysis, 'observer failure preserves the original analysis object');
check(throwingObserverCalls === 2, 'observer is attempted without coupling success to TQG');

const inspectorCaptured = [];
const inspector = {
  inspect: async () => ({
    status: 'COMPLETED',
    verdict: 'TRUE_ANOMALY',
    repairable: true,
    reason: 'confirmed',
    meta: { aiCalls: 1, transportCalls: 1 }
  })
};
const inspected = await Integration.inspectCompletedOutput({
  completed: true,
  context: 'manual',
  analysis: detectionAnalysis,
  sourceText: 'source',
  targetText: 'target',
  findings: detectionAnalysis.findings,
  suspiciousSpan: detectionAnalysis.findings[0],
  inspector,
  observer: { emit: (event) => inspectorCaptured.push(event) }
});
check(inspected.status === 'COMPLETED', 'Inspector result is preserved');
check(inspectorCaptured.length === 1, 'completed Inspector emits one terminal event');
check(inspectorCaptured[0].event === 'tqg.inspector.completed', 'Inspector event uses the locked name');
check(inspectorCaptured[0].verdict === 'TRUE_ANOMALY', 'Inspector event preserves Inspector verdict');
check(inspectorCaptured[0].aiCalls === 1 && inspectorCaptured[0].transportCalls === 1, 'Inspector event preserves actual call counts');
check(inspectorCaptured[0].context === 'manual', 'explicit execution context is preserved');

const inspectorErrorEvents = [];
const inspectorError = await Integration.inspectCompletedOutput({
  completed: true,
  context: 'single',
  analysis: detectionAnalysis,
  inspector: {
    inspect: async () => ({
      status: 'ERROR',
      verdict: 'UNCERTAIN',
      repairable: false,
      reason: 'TQG Inspector transport or response parsing failed.',
      meta: { aiCalls: 1, transportCalls: 1, errorClass: 'Error' }
    })
  },
  observer: { emit: (event) => inspectorErrorEvents.push(event) }
});
check(inspectorError.status === 'ERROR', 'Inspector error result is preserved');
check(inspectorErrorEvents.length === 2, 'Inspector error emits terminal and error events');
check(inspectorErrorEvents[0].status === 'ERROR', 'Inspector terminal event records ERROR status');
check(inspectorErrorEvents[0].verdict === 'UNCERTAIN', 'Inspector error is forced to UNCERTAIN');
check(inspectorErrorEvents[0].errorClass === 'TRANSPORT', 'Inspector error is mapped to a stable error class');
check(inspectorErrorEvents[1].event === 'tqg.error' && inspectorErrorEvents[1].status === 'ERROR', 'Inspector failure also emits the operational error event');
const repairCaptured = [];
const repairAccepted = await Integration.repairConfirmedAnomaly({
  completed: true,
  context: 'manual',
  analysis: detectionAnalysis,
  originalAnalysis: detectionAnalysis,
  targetText: 'target',
  sourceText: 'source',
  findings: detectionAnalysis.findings,
  suspiciousSpan: detectionAnalysis.findings[0],
  inspectorResult: {
    status: 'COMPLETED',
    verdict: 'TRUE_ANOMALY',
    repairable: true
  },
  repairer: {
    repair: async (input) => {
      input.analyze({ sourceText: 'source', targetText: 'repaired' });
      return {
        status: 'ACCEPTED',
        accepted: true,
        output: 'repaired',
        validation: { valid: true }
      };
    }
  },
  analyze: () => ({ status: 'PASS', findings: [] }),
  observer: { emit: (event) => repairCaptured.push(event) }
});
check(repairAccepted.status === 'ACCEPTED', 'accepted Repair result is preserved');
check(repairCaptured.length === 2, 'accepted Repair emits Repair and revalidation terminal events');
check(repairCaptured[0].event === 'tqg.repair.completed', 'Repair terminal event uses the locked name');
check(repairCaptured[0].status === 'ACCEPTED' && repairCaptured[0].accepted === true, 'accepted Repair telemetry is explicit');
check(repairCaptured[0].revalidated === true, 'accepted Repair telemetry records successful revalidation');
check(repairCaptured[1].event === 'tqg.revalidation.completed', 'accepted Repair emits revalidation telemetry');
check(repairCaptured[1].status === 'COMPLETED' && repairCaptured[1].revalidated === true, 'accepted Repair records successful revalidation');

const validationFailureEvents = [];
const rejected = await Integration.repairConfirmedAnomaly({
  completed: true,
  context: 'manual',
  analysis: detectionAnalysis,
  originalAnalysis: detectionAnalysis,
  targetText: 'target',
  sourceText: 'source',
  findings: detectionAnalysis.findings,
  suspiciousSpan: detectionAnalysis.findings[0],
  inspectorResult: {
    status: 'COMPLETED',
    verdict: 'TRUE_ANOMALY',
    repairable: true
  },
  repairer: {
    repair: async (input) => {
      input.analyze({ sourceText: 'source', targetText: 'repaired' });
      return {
        status: 'REJECTED',
        accepted: false,
        output: 'target',
        validation: { valid: false, reason: 'new finding introduced' },
        meta: { aiCalls: 1, transportCalls: 1, revalidated: true }
      };
    }
  },
  analyze: () => ({ status: 'PASS', findings: [] }),
  observer: { emit: (event) => validationFailureEvents.push(event) }
});
check(rejected.status === 'REJECTED' && rejected.accepted === false, 'rejected Repair result is preserved');
check(validationFailureEvents[0].status === 'REJECTED' && validationFailureEvents[0].accepted === false, 'rejected Repair telemetry is explicit');
check(
  validationFailureEvents.some(
    (event) => event.event === 'tqg.revalidation.completed' &&
      event.status === 'COMPLETED' &&
      event.revalidated === false
  ),
  'failed revalidation is measured without changing fail-closed Repair'
);

const notRequiredEvents = [];
const cleanInspection = await Integration.inspectCompletedOutput({
  completed: true,
  analysis: { status: 'PASS', findings: [] },
  observer: { emit: (event) => notRequiredEvents.push(event) },
  inspector: { inspect: async () => ({ status: 'NOT_REQUIRED' }) }
});
check(cleanInspection.status === 'NOT_REQUIRED', 'clean Inspector path remains NOT_REQUIRED');
check(notRequiredEvents.length === 0, 'NOT_REQUIRED does not fabricate an Inspector completion event');

const beforeMetrics = Integration.observabilityMetrics();
check(
  beforeMetrics.aiCalls >= 0 &&
    beforeMetrics.transportCalls >= 0 &&
    beforeMetrics.revalidationPass >= 0 &&
    beforeMetrics.revalidationFail >= 0,
  'runtime metrics expose non-negative operational counters'
);

for (const forbidden of [
  'PrungAksornStorageV2',
  'translationJobs',
  'checkpointTranslationJob',
  'updateTranslationJob',
  'localStorage',
  'indexedDB',
  'fetch('
]) {
  check(!source.includes(forbidden), 'D2 integration remains decoupled from protected system state: ' + forbidden);
}

console.log('');
console.log('TQG-D2 Observability Regression: PASS');
