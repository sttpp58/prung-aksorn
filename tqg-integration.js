/*
 * TQG V1 — Integration Boundary (TQG-08)
 *
 * Connects completed application outputs to deterministic TQG analysis.
 * AI inspection and targeted repair remain explicit, user-triggered calls.
 * This module is state-free and never touches translation-job/storage state.
 */
(function initTQGIntegration(global) {
  'use strict';

  const STATUSES = Object.freeze(['NOT_RUN', 'COMPLETED', 'ERROR']);

  const OBSERVABILITY_SCHEMA_VERSION = 'TQG-OBS-01';
  const OBSERVABILITY_PHASE = 'D';
  const OBSERVABILITY_EVENTS = Object.freeze([
    'tqg.output.completed',
    'tqg.detection.completed',
    'tqg.inspector.completed',
    'tqg.repair.completed',
    'tqg.revalidation.completed',
    'tqg.error'
  ]);
  const OBSERVABILITY_CONTEXTS = Object.freeze([
    'single',
    'batch',
    'recovery',
    'manual',
    'unknown'
  ]);
  const OBSERVABILITY_STATUSES = Object.freeze([
    'COMPLETED',
    'PASS',
    'REVIEW',
    'HIGH_SUSPICION',
    'ACCEPTED',
    'REJECTED',
    'ERROR',
    'NOT_RUN'
  ]);
  const OBSERVABILITY_VERDICTS = Object.freeze([
    'PASS',
    'REVIEW',
    'HIGH_SUSPICION',
    'TRUE_ANOMALY',
    'FALSE_POSITIVE',
    'UNCERTAIN'
  ]);
  const OBSERVABILITY_ERROR_CLASSES = Object.freeze([
    'NONE',
    'CONFIGURATION',
    'TRANSPORT',
    'TIMEOUT',
    'VALIDATION',
    'BOUNDARY',
    'RUNTIME',
    'OBSERVER'
  ]);
  const OBSERVABILITY_FINDING_CODES = Object.freeze([
    'FOREIGN_SCRIPT_SPAN',
    'SOURCE_LANGUAGE_RESIDUE',
    'SOURCE_TEXT_OVERLAP',
    'MIXED_LANGUAGE_SPAN',
    'PROMPT_LEAKAGE',
    'REPEATED_TEXT',
    'STRUCTURAL_TRUNCATION',
    'PARAGRAPH_LOSS',
    'QUOTE_ANOMALY',
    'PUA_OR_REPLACEMENT_CHAR'
  ]);

  const OBSERVABILITY_ALLOWED_FIELDS = Object.freeze({
    'tqg.output.completed': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context'
    ]),
    'tqg.detection.completed': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context',
      'verdict', 'findingCodes', 'findingCount', 'durationMs',
      'aiCalls', 'transportCalls'
    ]),
    'tqg.inspector.completed': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context',
      'verdict', 'durationMs', 'aiCalls', 'transportCalls',
      'findingCodes', 'findingCount', 'errorClass'
    ]),
    'tqg.repair.completed': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context',
      'durationMs', 'aiCalls', 'transportCalls', 'accepted',
      'findingCodes', 'findingCount', 'errorClass', 'revalidated'
    ]),
    'tqg.revalidation.completed': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context',
      'durationMs', 'revalidated', 'findingCodes', 'findingCount', 'errorClass'
    ]),
    'tqg.error': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context',
      'errorClass', 'durationMs', 'aiCalls', 'transportCalls'
    ])
  });

  const OBSERVABILITY_REQUIRED_FIELDS = Object.freeze({
    'tqg.output.completed': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context'
    ]),
    'tqg.detection.completed': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context',
      'verdict', 'findingCodes', 'findingCount', 'durationMs'
    ]),
    'tqg.inspector.completed': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context',
      'verdict', 'durationMs', 'aiCalls', 'transportCalls'
    ]),
    'tqg.repair.completed': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context',
      'durationMs', 'aiCalls', 'transportCalls', 'accepted'
    ]),
    'tqg.revalidation.completed': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context',
      'durationMs', 'revalidated'
    ]),
    'tqg.error': Object.freeze([
      'schemaVersion', 'event', 'timestamp', 'phase', 'status', 'context',
      'errorClass'
    ])
  });

  const OBSERVABILITY_STATUS_BY_EVENT = Object.freeze({
    'tqg.output.completed': Object.freeze(['COMPLETED']),
    'tqg.detection.completed': Object.freeze(['COMPLETED']),
    'tqg.inspector.completed': Object.freeze(['COMPLETED', 'ERROR']),
    'tqg.repair.completed': Object.freeze(['ACCEPTED', 'REJECTED', 'ERROR']),
    'tqg.revalidation.completed': Object.freeze(['COMPLETED', 'ERROR']),
    'tqg.error': Object.freeze(['ERROR'])
  });

  function observabilityNow() {
    if (global.performance && typeof global.performance.now === 'function') {
      return global.performance.now();
    }
    return Date.now();
  }

  function nonNegativeNumber(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return fallback;
    return number;
  }

  function nonNegativeInteger(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) return fallback;
    return number;
  }

  function observationContext(value) {
    const context = text(value);
    return OBSERVABILITY_CONTEXTS.includes(context) ? context : 'unknown';
  }

  function findingCodesFrom(findings) {
    if (!Array.isArray(findings)) return [];
    return findings
      .map((finding) => finding && text(finding.code))
      .filter((code) => OBSERVABILITY_FINDING_CODES.includes(code));
  }

  function normalizeErrorClass(value, message) {
    const source = (text(value) + ' ' + text(message)).toLowerCase();
    if (source.includes('abort') || source.includes('timeout')) return 'TIMEOUT';
    if (source.includes('boundary') || source.includes('span exceeds') || source.includes('stale')) return 'BOUNDARY';
    if (source.includes('validation') || source.includes('re-valid')) return 'VALIDATION';
    if (source.includes('transport') || source.includes('network') || source.includes('fetch')) return 'TRANSPORT';
    if (source.includes('config') || source.includes('unavailable') || source.includes('requires')) return 'CONFIGURATION';
    if (source.includes('observer')) return 'OBSERVER';
    return 'RUNTIME';
  }

  function errorClassForResult(result) {
    return normalizeErrorClass(
      result && result.meta && result.meta.errorClass,
      result && result.reason
    );
  }

  function buildObservationEvent(eventName, fields = {}) {
    if (!OBSERVABILITY_EVENTS.includes(eventName)) return null;
    const allowed = OBSERVABILITY_ALLOWED_FIELDS[eventName];
    const event = {
      schemaVersion: OBSERVABILITY_SCHEMA_VERSION,
      event: eventName,
      timestamp: new Date().toISOString(),
      phase: OBSERVABILITY_PHASE,
      status: fields.status,
      context: observationContext(fields.context)
    };
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(event, key)) continue;
      if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== undefined) {
        event[key] = key === 'findingCodes' && Array.isArray(fields[key])
          ? Object.freeze([...fields[key]])
          : fields[key];
      }
    }
    return event;
  }

  function validateObservationEvent(event) {
    if (!event || typeof event !== 'object') return false;
    if (!OBSERVABILITY_EVENTS.includes(event.event)) return false;
    if (event.schemaVersion !== OBSERVABILITY_SCHEMA_VERSION) return false;
    if (event.phase !== OBSERVABILITY_PHASE) return false;
    if (Number.isNaN(Date.parse(event.timestamp))) return false;
    if (!OBSERVABILITY_CONTEXTS.includes(event.context)) return false;
    if (!OBSERVABILITY_STATUS_BY_EVENT[event.event].includes(event.status)) return false;

    const allowed = OBSERVABILITY_ALLOWED_FIELDS[event.event];
    if (Object.keys(event).some((key) => !allowed.includes(key))) return false;

    for (const key of OBSERVABILITY_REQUIRED_FIELDS[event.event]) {
      if (!Object.prototype.hasOwnProperty.call(event, key)) return false;
    }

    if (event.verdict !== undefined && !OBSERVABILITY_VERDICTS.includes(event.verdict)) {
      return false;
    }
    if (event.findingCodes !== undefined) {
      if (!Array.isArray(event.findingCodes)) return false;
      if (!event.findingCodes.every((code) => OBSERVABILITY_FINDING_CODES.includes(code))) return false;
    }
    if (event.findingCount !== undefined && !Number.isInteger(event.findingCount)) return false;
    if (event.findingCodes !== undefined && event.findingCount !== undefined &&
        event.findingCount !== event.findingCodes.length) return false;
    for (const key of ['durationMs', 'aiCalls', 'transportCalls', 'findingCount']) {
      if (event[key] !== undefined && (!Number.isFinite(event[key]) || event[key] < 0)) {
        return false;
      }
    }
    for (const key of ['aiCalls', 'transportCalls', 'findingCount']) {
      if (event[key] !== undefined && !Number.isInteger(event[key])) return false;
    }
    if (event.accepted !== undefined && typeof event.accepted !== 'boolean') return false;
    if (event.revalidated !== undefined && typeof event.revalidated !== 'boolean') return false;
    if (event.errorClass !== undefined && !OBSERVABILITY_ERROR_CLASSES.includes(event.errorClass)) return false;
    if (event.event === 'tqg.inspector.completed' && event.status === 'ERROR') {
      if (event.verdict !== 'UNCERTAIN' || !event.errorClass) return false;
    }
    if (event.event === 'tqg.repair.completed' && event.status === 'ERROR' && !event.errorClass) {
      return false;
    }
    if (event.event === 'tqg.revalidation.completed' && event.status === 'ERROR' && !event.errorClass) {
      return false;
    }
    if (event.event === 'tqg.repair.completed' && event.status !== 'ACCEPTED' && event.accepted !== false) {
      return false;
    }
    if (event.event === 'tqg.revalidation.completed' && event.status === 'COMPLETED' &&
        typeof event.revalidated !== 'boolean') {
      return false;
    }
    return true;
  }

  function createEmptyObservabilityMetrics() {
    return {
      events: {},
      statuses: {},
      verdicts: {},
      findingCodes: {},
      aiCalls: 0,
      transportCalls: 0,
      accepted: 0,
      rejected: 0,
      revalidationPass: 0,
      revalidationFail: 0,
      durationsMs: {}
    };
  }

  function increment(map, key, amount = 1) {
    if (!key) return;
    map[key] = (map[key] || 0) + amount;
  }

  function recordObservabilityMetrics(metrics, event) {
    increment(metrics.events, event.event);
    increment(metrics.statuses, event.status);
    if (event.verdict) increment(metrics.verdicts, event.verdict);
    if (Array.isArray(event.findingCodes)) {
      for (const code of event.findingCodes) increment(metrics.findingCodes, code);
    }
    if (event.aiCalls !== undefined) metrics.aiCalls += event.aiCalls;
    if (event.transportCalls !== undefined) metrics.transportCalls += event.transportCalls;
    if (event.accepted === true) metrics.accepted += 1;
    if (event.status === 'REJECTED') metrics.rejected += 1;
    if (event.revalidated === true) metrics.revalidationPass += 1;
    if (event.revalidated === false) metrics.revalidationFail += 1;
    if (event.durationMs !== undefined) {
      const slot = metrics.durationsMs[event.event] || { count: 0, total: 0, max: 0 };
      slot.count += 1;
      slot.total += event.durationMs;
      slot.max = Math.max(slot.max, event.durationMs);
      metrics.durationsMs[event.event] = slot;
    }
  }

  const runtimeObservabilityMetrics = createEmptyObservabilityMetrics();
  const defaultObservabilityObserver = Object.freeze({
    emit(event) {
      recordObservabilityMetrics(runtimeObservabilityMetrics, event);
      return true;
    }
  });

  function resolveObservabilityObserver(input) {
    if (input && input.observer && typeof input.observer.emit === 'function') {
      return input.observer;
    }
    return defaultObservabilityObserver;
  }

  function deepFreezeObservationEvent(event) {
    if (!event || typeof event !== 'object') return event;
    for (const value of Object.values(event)) {
      if (value && typeof value === 'object') Object.freeze(value);
    }
    return Object.freeze(event);
  }

  function emitObservation(observer, eventName, fields) {
    const event = buildObservationEvent(eventName, fields);
    if (!validateObservationEvent(event)) return false;
    try {
      const result = observer && typeof observer.emit === 'function'
        ? observer.emit(deepFreezeObservationEvent(event))
        : true;
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).catch(() => {});
        return true;
      }
      return result !== false;
    } catch (_error) {
      return false;
    }
  }

  function emitTQGError(observer, context, errorClass, extra = {}) {
    emitObservation(observer, 'tqg.error', {
      context,
      status: 'ERROR',
      errorClass: OBSERVABILITY_ERROR_CLASSES.includes(errorClass) ? errorClass : 'RUNTIME',
      durationMs: extra.durationMs
    });
  }

  function observabilityMetrics() {
    return JSON.parse(JSON.stringify(runtimeObservabilityMetrics));
  }

  function resetObservabilityMetrics() {
    const fresh = createEmptyObservabilityMetrics();
    for (const key of Object.keys(runtimeObservabilityMetrics)) {
      runtimeObservabilityMetrics[key] = fresh[key];
    }
  }


  function text(value) {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  }

  function isCompletedBoundary(input) {
    return !!input && input.completed === true;
  }

  function notRun(reason) {
    return {
      status: 'NOT_RUN',
      reason: reason || 'TQG integration skipped before completion boundary.',
      analysis: null,
      meta: { aiCalls: 0 }
    };
  }

  function analyzeCompletedOutput(input = {}) {
    if (!isCompletedBoundary(input)) {
      return notRun('TQG requires an explicit completed-output boundary.');
    }

    const observer = resolveObservabilityObserver(input);
    const context = observationContext(input.context);
    emitObservation(observer, 'tqg.output.completed', {
      status: 'COMPLETED',
      context
    });

    const analyzer = typeof input.analyze === 'function'
      ? input.analyze
      : global.TQG && typeof global.TQG.analyze === 'function'
        ? global.TQG.analyze
        : null;
    if (!analyzer) {
      emitTQGError(observer, context, 'CONFIGURATION');
      return {
        status: 'ERROR',
        reason: 'TQG deterministic analyzer is unavailable.',
        analysis: null,
        meta: { aiCalls: 0 }
      };
    }

    const startedAt = observabilityNow();
    try {
      const analysis = analyzer({
        sourceText: text(input.sourceText),
        targetText: text(input.targetText),
        glossaryText: text(input.glossaryText)
      });
      const findingCodes = findingCodesFrom(analysis && analysis.findings);
      emitObservation(observer, 'tqg.detection.completed', {
        status: 'COMPLETED',
        context,
        verdict: text(analysis && analysis.status),
        findingCodes,
        findingCount: findingCodes.length,
        durationMs: nonNegativeNumber(observabilityNow() - startedAt),
        aiCalls: 0,
        transportCalls: 0
      });
      return {
        status: 'COMPLETED',
        reason: 'TQG deterministic analysis completed after output completion.',
        analysis,
        meta: { aiCalls: 0 }
      };
    } catch (error) {
      const durationMs = nonNegativeNumber(observabilityNow() - startedAt);
      emitTQGError(
        observer,
        context,
        normalizeErrorClass(
          error && error.name,
          error && error.message
        ),
        { durationMs }
      );
      return {
        status: 'ERROR',
        reason: 'TQG deterministic analysis failed without altering translation state.',
        analysis: null,
        meta: {
          aiCalls: 0,
          errorClass: error && error.constructor ? error.constructor.name : 'Error'
        }
      };
    }
  }

  async function inspectCompletedOutput(input = {}) {
    if (!isCompletedBoundary(input)) return notRun();
    if (!input.analysis) return notRun('TQG Inspector requires completed TQG analysis.');

    const observer = resolveObservabilityObserver(input);
    const context = observationContext(input.context);
    const inspector = input.inspector || global.TQGInspector;
    if (!inspector || typeof inspector.inspect !== 'function') {
      const result = {
        status: 'ERROR',
        verdict: 'UNCERTAIN',
        repairable: false,
        reason: 'TQG Inspector is unavailable.',
        meta: { aiCalls: 0 }
      };
      emitTQGError(observer, context, 'CONFIGURATION');
      emitObservation(observer, 'tqg.inspector.completed', {
        status: 'ERROR',
        context,
        verdict: 'UNCERTAIN',
        durationMs: 0,
        aiCalls: 0,
        transportCalls: 0,
        findingCodes: findingCodesFrom(input.findings || input.analysis.findings),
        findingCount: findingCodesFrom(input.findings || input.analysis.findings).length,
        errorClass: 'CONFIGURATION'
      });
      return result;
    }

    const startedAt = observabilityNow();
    try {
      const result = await inspector.inspect({
        analysis: input.analysis,
        sourceContext: text(input.sourceText),
        targetContext: text(input.targetText),
        glossaryContext: text(input.glossaryText),
        findings: input.findings,
        suspiciousSpan: input.suspiciousSpan,
        transport: input.transport,
        contextChars: input.contextChars,
        sourceMaxChars: input.sourceMaxChars,
        glossaryMaxChars: input.glossaryMaxChars,
        maxFindings: input.maxFindings
      });

      if (result && result.status !== 'NOT_REQUIRED') {
        const findingCodes = findingCodesFrom(input.findings || input.analysis.findings);
        emitObservation(observer, 'tqg.inspector.completed', {
          status: result.status === 'ERROR' ? 'ERROR' : 'COMPLETED',
          context,
          verdict: result.status === 'ERROR' ? 'UNCERTAIN' : text(result.verdict),
          durationMs: nonNegativeNumber(observabilityNow() - startedAt),
          aiCalls: nonNegativeInteger(result.meta && result.meta.aiCalls),
          transportCalls: nonNegativeInteger(result.meta && result.meta.transportCalls),
          findingCodes,
          findingCount: findingCodes.length,
          errorClass: result.status === 'ERROR'
            ? normalizeErrorClass(
              result.meta && result.meta.errorClass,
              result.reason
            )
            : undefined
        });
        if (result.status === 'ERROR') {
          emitTQGError(
            observer,
            context,
            normalizeErrorClass(
              result.meta && result.meta.errorClass,
              result.reason
            )
          );
        }
      }
      return result;
    } catch (error) {
      const durationMs = nonNegativeNumber(observabilityNow() - startedAt);
      emitTQGError(
        observer,
        context,
        normalizeErrorClass(
          error && error.name,
          error && error.message
        ),
        { durationMs }
      );
      throw error;
    }
  }

  async function repairConfirmedAnomaly(input = {}) {
    if (!isCompletedBoundary(input)) return notRun();
    if (!input.analysis) return notRun('TQG Repair requires completed TQG analysis.');

    const observer = resolveObservabilityObserver(input);
    const context = observationContext(input.context);
    const repairer = input.repairer || global.TQGRepair;
    if (!repairer || typeof repairer.repair !== 'function') {
      const result = {
        status: 'ERROR',
        accepted: false,
        output: text(input.targetText),
        reason: 'TQG Repair is unavailable.',
        meta: { aiCalls: 0 }
      };
      const findingCodes = findingCodesFrom(input.findings || input.analysis.findings);
      emitObservation(observer, 'tqg.repair.completed', {
        status: 'ERROR',
        context,
        durationMs: 0,
        aiCalls: 0,
        transportCalls: 0,
        accepted: false,
        findingCodes,
        findingCount: findingCodes.length,
        errorClass: 'CONFIGURATION',
        revalidated: undefined
      });
      emitTQGError(observer, context, 'CONFIGURATION');
      return result;
    }

    const startedAt = observabilityNow();
    let revalidationDurationMs = null;
    const baseAnalyze = input.analyze || (global.TQG && global.TQG.analyze);
    const observedAnalyze = typeof baseAnalyze === 'function'
      ? (analysisInput) => {
          const validationStartedAt = observabilityNow();
          try {
            return baseAnalyze(analysisInput);
          } finally {
            revalidationDurationMs = nonNegativeNumber(observabilityNow() - validationStartedAt);
          }
        }
      : baseAnalyze;
    try {
      const result = await repairer.repair({
        analysis: input.analysis,
        originalAnalysis: input.originalAnalysis || input.analysis,
        targetContext: text(input.targetText),
        sourceContext: text(input.sourceText),
        glossaryContext: text(input.glossaryText),
        findings: input.findings || input.analysis.findings,
        suspiciousSpan: input.suspiciousSpan,
        inspectorResult: input.inspectorResult,
        transport: input.transport,
        analyze: observedAnalyze,
        repairInstruction: input.repairInstruction,
        contextChars: input.contextChars,
        sourceMaxChars: input.sourceMaxChars,
        glossaryMaxChars: input.glossaryMaxChars,
        maxFindings: input.maxFindings,
        maxReplacementChars: input.maxReplacementChars,
        maxInstructionChars: input.maxInstructionChars
      });

      const findingCodes = findingCodesFrom(input.findings || input.analysis.findings);
      const validation = result && result.validation;
      const status = ['ACCEPTED', 'REJECTED', 'ERROR'].includes(text(result && result.status))
        ? result.status
        : 'ERROR';
      emitObservation(observer, 'tqg.repair.completed', {
        status,
        context,
        durationMs: nonNegativeNumber(observabilityNow() - startedAt),
        aiCalls: nonNegativeInteger(result && result.meta && result.meta.aiCalls),
        transportCalls: nonNegativeInteger(result && result.meta && result.meta.transportCalls),
        accepted: result && result.accepted === true,
        findingCodes,
        findingCount: findingCodes.length,
        errorClass: status === 'ERROR'
          ? errorClassForResult(result)
          : undefined,
        revalidated: validation && typeof validation.valid === 'boolean'
          ? validation.valid
          : undefined
      });

      if (validation && typeof validation.valid === 'boolean') {
        emitObservation(observer, 'tqg.revalidation.completed', {
          status: 'COMPLETED',
          context,
          durationMs: revalidationDurationMs === null
            ? nonNegativeNumber(observabilityNow() - startedAt)
            : revalidationDurationMs,
          revalidated: validation.valid,
          findingCodes,
          findingCount: findingCodes.length
        });
      }

      if (status === 'ERROR') {
        if (revalidationDurationMs !== null) {
          emitObservation(observer, 'tqg.revalidation.completed', {
            status: 'ERROR',
            context,
            durationMs: revalidationDurationMs,
            revalidated: false,
            findingCodes,
            findingCount: findingCodes.length,
            errorClass: errorClassForResult(result)
          });
        }
        emitTQGError(observer, context, errorClassForResult(result));
      }
      return result;
    } catch (error) {
      const durationMs = nonNegativeNumber(observabilityNow() - startedAt);
      emitTQGError(
        observer,
        context,
        normalizeErrorClass(
          error && error.name,
          error && error.message
        ),
        { durationMs }
      );
      throw error;
    }
  }

  const TQGIntegration = Object.freeze({
    version: 'TQG-08-2026-09-30',
    STATUSES,
    OBSERVABILITY_SCHEMA_VERSION,
    OBSERVABILITY_EVENTS,
    OBSERVABILITY_CONTEXTS,
    OBSERVABILITY_STATUSES,
    OBSERVABILITY_VERDICTS,
    OBSERVABILITY_ERROR_CLASSES,
    OBSERVABILITY_FINDING_CODES,
    buildObservationEvent,
    validateObservationEvent,
    observabilityMetrics,
    resetObservabilityMetrics,
    isCompletedBoundary,
    analyzeCompletedOutput,
    inspectCompletedOutput,
    repairConfirmedAnomaly
  });

  global.TQGIntegration = TQGIntegration;
  if (typeof module === 'object' && module.exports) module.exports = TQGIntegration;
})(typeof globalThis !== 'undefined' ? globalThis : this);
