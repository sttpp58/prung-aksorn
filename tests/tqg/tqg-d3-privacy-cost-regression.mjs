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

const integrationSource = read('tqg-integration.js');
const Integration = requireFromRoot(path.join(ROOT, 'tqg-integration.js'));

check(Integration.OBSERVABILITY_SCHEMA_VERSION === 'TQG-OBS-01', 'D3 retains the locked observability schema');
check(
  Integration.MAX_OBSERVATION_EVENT_CHARS === 4096,
  'D3 exposes the locked telemetry-event size ceiling'
);
check(
  Integration.MAX_AI_CALLS_PER_EVENT === 1 &&
    Integration.MAX_TRANSPORT_CALLS_PER_EVENT === 1 &&
    Integration.MAX_FINDINGS_PER_EVENT === 64,
  'D3 exposes the locked per-event cost/volume ceilings'
);

const baseDetection = {
  status: 'COMPLETED',
  context: 'single',
  verdict: 'PASS',
  findingCodes: [],
  findingCount: 0,
  durationMs: 1,
  aiCalls: 0,
  transportCalls: 0
};

const forbiddenKeys = [
  'sourceText',
  'targetText',
  'translationText',
  'suspiciousText',
  'fullFindingText',
  'fullPrompt',
  'systemPrompt',
  'userPrompt',
  'rawAIResponse',
  'replacementText',
  'glossaryText',
  'glossaryContents',
  'bookTitle',
  'chapterTitle',
  'chapterText',
  'sourceChapter',
  'userId',
  'email',
  'credentials',
  'apiKey',
  'API keys',
  'authorization_headers',
  'cookies',
  'sessionTokens',
  'backupPayloads',
  'recoveryPayloads'
];

for (const key of forbiddenKeys) {
  const fields = { ...baseDetection, [key]: 'SECRET_VALUE' };
  check(
    Integration.buildObservationEvent('tqg.detection.completed', fields) === null,
    'D3 rejects forbidden telemetry key: ' + key
  );
}

const nestedForbidden = {
  ...baseDetection,
  metadata: {
    transport: {
      authorization_headers: 'SECRET'
    }
  }
};
check(
  Integration.buildObservationEvent('tqg.detection.completed', nestedForbidden) === null,
  'D3 rejects forbidden keys hidden in nested payloads'
);

const safeEvent = Integration.buildObservationEvent(
  'tqg.detection.completed',
  baseDetection
);
check(Integration.validateObservationEvent(safeEvent), 'D3 accepts a compliant metadata-only event');
check(
  !Object.keys(safeEvent).some((key) =>
    /source|target|prompt|response|glossary|chapter|user|token|credential|authorization|cookie|backup|recovery/i.test(key)
  ),
  'D3 compliant event has no content/secret-bearing keys'
);

const injectedContentEvent = {
  ...safeEvent,
  targetText: 'SECRET_TARGET'
};
check(
  !Integration.validateObservationEvent(injectedContentEvent),
  'D3 validator rejects injected targetText after event construction'
);

const invalidAiCalls = {
  ...safeEvent,
  aiCalls: 2
};
check(
  !Integration.validateObservationEvent(invalidAiCalls),
  'D3 rejects excessive AI-call count per event'
);

const invalidTransportCalls = {
  ...safeEvent,
  transportCalls: 2
};
check(
  !Integration.validateObservationEvent(invalidTransportCalls),
  'D3 rejects excessive transport-call count per event'
);

const invalidFindingCount = {
  ...safeEvent,
  findingCount: 65,
  findingCodes: Array(65).fill('FOREIGN_SCRIPT_SPAN')
};
check(
  !Integration.validateObservationEvent(invalidFindingCount),
  'D3 rejects excessive finding count per event'
);

const malformedTimestamp = {
  ...safeEvent,
  timestamp: 'not-a-timestamp'
};
check(
  !Integration.validateObservationEvent(malformedTimestamp),
  'D3 rejects malformed telemetry timestamps'
);
const oversizedFindingFields = {
  ...baseDetection,
  findingCodes: Array(64).fill('FOREIGN_SCRIPT_SPAN'),
  findingCount: 64
};
const boundedEvent = Integration.buildObservationEvent(
  'tqg.detection.completed',
  oversizedFindingFields
);
check(boundedEvent !== null, 'D3 accepts the maximum configured finding count');
check(
  JSON.stringify(boundedEvent).length <= 4096,
  'D3 keeps the configured event-size ceiling'
);

Integration.resetObservabilityMetrics();

const captured = [];
const observer = {
  emit(event) {
    captured.push(event);
    return true;
  }
};

const result = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'single',
  sourceText: 'PRIVATE_SOURCE_CONTENT',
  targetText: 'PRIVATE_TARGET_CONTENT',
  glossaryText: 'PRIVATE_GLOSSARY_CONTENT',
  analyze: () => ({
    status: 'REVIEW',
    findings: [{
      code: 'SOURCE_LANGUAGE_RESIDUE',
      start: 0,
      end: 4,
      text: 'PRIVATE_FINDING_TEXT'
    }]
  }),
  observer
});
check(result.status === 'COMPLETED', 'D3 preserves deterministic TQG result');
check(captured.length === 2, 'D3 does not add duplicate detection events');

const payload = JSON.stringify(captured);
for (const secretMarker of [
  'PRIVATE_SOURCE_CONTENT',
  'PRIVATE_TARGET_CONTENT',
  'PRIVATE_GLOSSARY_CONTENT',
  'PRIVATE_FINDING_TEXT',
  'SECRET_VALUE'
]) {
  check(!payload.includes(secretMarker), 'D3 telemetry contains no content marker: ' + secretMarker);
}

const maliciousObserver = {
  emit(event) {
    assert(Object.isFrozen(event), 'observer receives immutable telemetry event');
    if (event.findingCodes) assert(Object.isFrozen(event.findingCodes), 'observer receives immutable finding-code array');
    return true;
  }
};
const maliciousRun = Integration.analyzeCompletedOutput({
  completed: true,
  context: 'single',
  sourceText: 'source',
  targetText: 'target',
  analyze: () => ({ status: 'PASS', findings: [] }),
  observer: maliciousObserver
});
check(maliciousRun.status === 'COMPLETED', 'D3 observer hardening preserves TQG execution');

let unhandledRejection = false;
const previousHandler = process.listeners('unhandledRejection');
process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', () => {
  unhandledRejection = true;
});
Integration.analyzeCompletedOutput({
  completed: true,
  sourceText: 'source',
  targetText: 'target',
  analyze: () => ({ status: 'PASS', findings: [] }),
  observer: {
    emit: () => Promise.reject(new Error('SECRET_ASYNC_OBSERVER_ERROR'))
  }
});
await new Promise((resolve) => setImmediate(resolve));
process.removeAllListeners('unhandledRejection');
for (const handler of previousHandler) process.on('unhandledRejection', handler);
check(!unhandledRejection, 'D3 async observer rejection is isolated without unhandled rejection');
const metrics = Integration.observabilityMetrics();
check(
  Number.isSafeInteger(metrics.aiCalls) && metrics.aiCalls >= 0,
  'D3 runtime AI-call counter remains a safe non-negative integer'
);
check(
  Number.isSafeInteger(metrics.transportCalls) && metrics.transportCalls >= 0,
  'D3 runtime transport-call counter remains a safe non-negative integer'
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
  check(
    !integrationSource.includes(forbidden),
    'D3 remains decoupled from protected state/network paths: ' + forbidden
  );
}

check(
  !integrationSource.includes('console.log(JSON.stringify'),
  'D3 does not add raw telemetry console dumping'
);

console.log('');
console.log('TQG-D3 Privacy / Cost Guard Regression: PASS');
