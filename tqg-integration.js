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
    const analyzer = typeof input.analyze === 'function'
      ? input.analyze
      : global.TQG && typeof global.TQG.analyze === 'function'
        ? global.TQG.analyze
        : null;
    if (!analyzer) {
      return {
        status: 'ERROR',
        reason: 'TQG deterministic analyzer is unavailable.',
        analysis: null,
        meta: { aiCalls: 0 }
      };
    }
    try {
      const analysis = analyzer({
        sourceText: text(input.sourceText),
        targetText: text(input.targetText),
        glossaryText: text(input.glossaryText)
      });
      return {
        status: 'COMPLETED',
        reason: 'TQG deterministic analysis completed after output completion.',
        analysis,
        meta: { aiCalls: 0 }
      };
    } catch (error) {
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
    const inspector = input.inspector || global.TQGInspector;
    if (!inspector || typeof inspector.inspect !== 'function') {
      return {
        status: 'ERROR',
        verdict: 'UNCERTAIN',
        repairable: false,
        reason: 'TQG Inspector is unavailable.',
        meta: { aiCalls: 0 }
      };
    }
    return inspector.inspect({
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
  }

  async function repairConfirmedAnomaly(input = {}) {
    if (!isCompletedBoundary(input)) return notRun();
    if (!input.analysis) return notRun('TQG Repair requires completed TQG analysis.');
    const repairer = input.repairer || global.TQGRepair;
    if (!repairer || typeof repairer.repair !== 'function') {
      return {
        status: 'ERROR',
        accepted: false,
        output: text(input.targetText),
        reason: 'TQG Repair is unavailable.',
        meta: { aiCalls: 0 }
      };
    }
    return repairer.repair({
      analysis: input.analysis,
      originalAnalysis: input.originalAnalysis || input.analysis,
      targetContext: text(input.targetText),
      sourceContext: text(input.sourceText),
      glossaryContext: text(input.glossaryText),
      findings: input.findings || input.analysis.findings,
      suspiciousSpan: input.suspiciousSpan,
      inspectorResult: input.inspectorResult,
      transport: input.transport,
      analyze: input.analyze || (global.TQG && global.TQG.analyze),
      repairInstruction: input.repairInstruction,
      contextChars: input.contextChars,
      sourceMaxChars: input.sourceMaxChars,
      glossaryMaxChars: input.glossaryMaxChars,
      maxFindings: input.maxFindings,
      maxReplacementChars: input.maxReplacementChars,
      maxInstructionChars: input.maxInstructionChars
    });
  }

  const TQGIntegration = Object.freeze({
    version: 'TQG-08-2026-09-30',
    STATUSES,
    isCompletedBoundary,
    analyzeCompletedOutput,
    inspectCompletedOutput,
    repairConfirmedAnomaly
  });

  global.TQGIntegration = TQGIntegration;
  if (typeof module === 'object' && module.exports) module.exports = TQGIntegration;
})(typeof globalThis !== 'undefined' ? globalThis : this);
