/*
 * TQG V1 — Targeted Repair (TQG-06)
 *
 * User-triggered, bounded repair for confirmed TQG anomalies.
 * The module never mutates application state, never writes storage, and
 * never contacts an AI provider directly. Callers inject the existing
 * application transport and deterministic analyzer.
 */
(function initTQGRepair(global) {
  'use strict';

  const REPAIR_STATUSES = Object.freeze([
    'ACCEPTED',
    'REJECTED',
    'ERROR'
  ]);

  const DEFAULTS = Object.freeze({
    contextChars: 600,
    sourceMaxChars: 1600,
    glossaryMaxChars: 800,
    maxFindings: 8,
    maxReplacementChars: 1000,
    maxRepairSpanChars: 2000,
    maxInstructionChars: 1000
  });

  function text(value) {
    return typeof value === 'string'
      ? value
      : value == null
        ? ''
        : String(value);
  }

  function normalizeSpace(value) {
    return text(value).replace(/\s+/g, ' ').trim();
  }

  function clipText(value, maxChars) {
    const source = text(value);
    if (source.length <= maxChars) return source;
    if (maxChars <= 3) return source.slice(0, Math.max(maxChars, 0));
    return source.slice(0, maxChars - 3) + '...';
  }

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(Math.floor(number), minimum), maximum);
  }

  function resolveRepairSpan(targetText, suspiciousSpan) {
    if (!suspiciousSpan || typeof suspiciousSpan !== 'object') {
      throw new TypeError('TQG Repair requires a bounded suspicious span.');
    }

    const start = clamp(suspiciousSpan.start, 0, targetText.length, -1);
    const end = clamp(
      suspiciousSpan.end,
      start,
      targetText.length,
      start + text(suspiciousSpan.text).length
    );

    if (start < 0 || end <= start) {
      throw new TypeError('TQG Repair suspicious span is invalid.');
    }
    if (end - start > DEFAULTS.maxRepairSpanChars) {
      throw new RangeError('TQG Repair suspicious span exceeds the bounded length.');
    }

    const actualText = targetText.slice(start, end);
    if (
      typeof suspiciousSpan.text === 'string' &&
      suspiciousSpan.text !== actualText
    ) {
      throw new Error('TQG Repair span is stale or does not match target text.');
    }

    return {
      code: text(suspiciousSpan.code),
      start,
      end,
      text: actualText
    };
  }

  function clipTargetContext(targetText, span, contextChars) {
    const radius = clamp(contextChars, 100, 2000, DEFAULTS.contextChars);
    const beforeStart = Math.max(0, span.start - radius);
    const afterEnd = Math.min(targetText.length, span.end + radius);
    return {
      before: targetText.slice(beforeStart, span.start),
      suspicious: targetText.slice(span.start, span.end),
      after: targetText.slice(span.end, afterEnd),
      start: beforeStart,
      end: afterEnd
    };
  }

  function sanitizeFindings(findings, maxFindings) {
    return (Array.isArray(findings) ? findings : [])
      .filter((finding) => finding && typeof finding === 'object')
      .slice(0, maxFindings)
      .map((finding) => ({
        code: text(finding.code),
        severity: text(finding.severity),
        text: clipText(finding.text, 500),
        evidence: {
          reason: clipText(finding.evidence && finding.evidence.reason, 300),
          matchType: clipText(finding.evidence && finding.evidence.matchType, 200)
        }
      }))
      .filter((finding) => finding.code);
  }

  function buildRepairRequest(input = {}) {
    const targetText = text(input.targetContext);
    const sourceContext = clipText(
      input.sourceContext,
      clamp(input.sourceMaxChars, 200, 4000, DEFAULTS.sourceMaxChars)
    );
    const glossaryContext = clipText(
      input.glossaryContext,
      clamp(input.glossaryMaxChars, 100, 2000, DEFAULTS.glossaryMaxChars)
    );
    const span = resolveRepairSpan(targetText, input.suspiciousSpan);
    const context = clipTargetContext(targetText, span, input.contextChars);
    const findings = sanitizeFindings(
      input.findings,
      clamp(input.maxFindings, 1, 20, DEFAULTS.maxFindings)
    );
    const instruction = clipText(
      normalizeSpace(input.repairInstruction),
      clamp(input.maxInstructionChars, 100, 2000, DEFAULTS.maxInstructionChars)
    );

    const systemPrompt = [
      'You are a bounded translation repair assistant.',
      'Repair only the exact suspicious span provided.',
      'Preserve all text before and after the suspicious span exactly.',
      'Do not rewrite the chapter, sentence outside the span, or unrelated findings.',
      'Return JSON only with exactly this field:',
      '{"replacementText":"..."}',
      'The replacementText must contain only the replacement for the suspicious span.',
      'Use the source context, target context, glossary, findings, and repair instruction as evidence.'
    ].join('\n');

    const userPrompt = [
      '[SOURCE CONTEXT]',
      sourceContext || '(empty)',
      '',
      '[TARGET CONTEXT BEFORE]',
      context.before || '(empty)',
      '',
      '[SUSPICIOUS SPAN]',
      context.suspicious,
      '',
      '[TARGET CONTEXT AFTER]',
      context.after || '(empty)',
      '',
      '[RELEVANT GLOSSARY]',
      glossaryContext || '(empty)',
      '',
      '[DETERMINISTIC FINDINGS]',
      JSON.stringify(findings),
      '',
      '[REPAIR INSTRUCTION]',
      instruction || '(none)'
    ].join('\n');

    return {
      systemPrompt,
      userPrompt,
      span,
      contextMeta: {
        sourceChars: sourceContext.length,
        targetContextChars: context.before.length +
          context.suspicious.length +
          context.after.length,
        glossaryChars: glossaryContext.length,
        findingCount: findings.length,
        instructionChars: instruction.length
      }
    };
  }

  function parseRepairResponse(rawResponse) {
    const raw = text(
      typeof rawResponse === 'string'
        ? rawResponse
        : rawResponse && typeof rawResponse.text === 'string'
          ? rawResponse.text
          : ''
    ).trim();

    if (!raw) throw new TypeError('TQG Repair returned an empty response.');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (firstError) {
      const fence = String.fromCharCode(96).repeat(3);
      const fenced = raw.match(new RegExp(
        '^' + fence + '(?:json)?\\s*([\\s\\S]*?)\\s*' + fence + '$',
        'i'
      ));
      if (fenced) {
        parsed = JSON.parse(fenced[1].trim());
      } else {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start < 0 || end <= start) throw firstError;
        parsed = JSON.parse(raw.slice(start, end + 1));
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new TypeError('TQG Repair response must be a JSON object.');
    }

    const replacementText = text(parsed.replacementText);
    if (!replacementText.trim()) {
      throw new TypeError('TQG Repair response requires replacementText.');
    }

    if (replacementText.length > DEFAULTS.maxReplacementChars) {
      throw new RangeError('TQG Repair replacement exceeds the bounded length.');
    }

    return {
      replacementText
    };
  }

  function applyBoundedReplacement(targetText, span, replacementText) {
    const replacement = text(replacementText);
    if (!replacement.trim()) {
      throw new TypeError('TQG Repair replacement must not be empty.');
    }
    if (replacement.length > DEFAULTS.maxReplacementChars) {
      throw new RangeError('TQG Repair replacement exceeds the bounded length.');
    }

    const prefix = targetText.slice(0, span.start);
    const original = targetText.slice(span.start, span.end);
    if (typeof span.text === 'string' && span.text !== original) {
      throw new Error('TQG Repair span is stale or does not match target text.');
    }
    const suffix = targetText.slice(span.end);
    const repairedTarget = prefix + replacement + suffix;

    if (repairedTarget.slice(0, prefix.length) !== prefix) {
      throw new Error('TQG Repair prefix boundary was not preserved.');
    }
    if (repairedTarget.slice(prefix.length + replacement.length) !== suffix) {
      throw new Error('TQG Repair suffix boundary was not preserved.');
    }

    return {
      repairedTarget,
      prefix,
      original,
      replacement,
      suffix,
      repairedStart: prefix.length,
      repairedEnd: prefix.length + replacement.length
    };
  }

  function findingSignature(finding) {
    return [
      text(finding.code),
      text(finding.severity),
      text(finding.text),
      JSON.stringify(finding.evidence || {})
    ].join('|');
  }

  function findingsOutsideRange(findings, start, end) {
    return (Array.isArray(findings) ? findings : [])
      .filter((finding) => {
        if (
          !finding ||
          !Number.isFinite(finding.start) ||
          !Number.isFinite(finding.end)
        ) return false;
        return finding.end <= start || finding.start >= end;
      })
      .map(findingSignature)
      .sort();
  }

  function rangesOverlap(finding, start, end) {
    return Number.isFinite(finding && finding.start) &&
      Number.isFinite(finding && finding.end) &&
      finding.start < end &&
      finding.end > start;
  }

  function revalidateRepair(input = {}) {
    if (typeof input.analyze !== 'function') {
      throw new TypeError('TQG Repair requires the deterministic TQG analyzer.');
    }

    const originalTarget = text(input.originalTarget);
    const repairedTarget = text(input.repairedTarget);
    const originalAnalysis = input.originalAnalysis ||
      input.analyze(originalTarget);
    const repairedAnalysis = input.analyze(repairedTarget);
    const start = Number(input.repairedStart);
    const end = Number(input.repairedEnd);

    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
      return {
        valid: false,
        reason: 'invalid-repaired-range',
        originalAnalysis,
        repairedAnalysis
      };
    }

    const originalFindingCode = text(input.originalFindingCode);
    const repairedRegionFindings = repairedAnalysis.findings.filter((finding) =>
      rangesOverlap(finding, start, end)
    );

    const preservedOriginal = findingsOutsideRange(
      originalAnalysis.findings,
      Number(input.originalStart),
      Number(input.originalEnd)
    );
    const preservedRepaired = findingsOutsideRange(
      repairedAnalysis.findings,
      start,
      end
    );

    const originalCodeRemainingInRegion = repairedRegionFindings.some((finding) =>
      !originalFindingCode || finding.code === originalFindingCode
    );

    if (originalCodeRemainingInRegion) {
      return {
        valid: false,
        reason: 'original-finding-remains-in-repaired-region',
        originalAnalysis,
        repairedAnalysis,
        repairedRegionFindings
      };
    }

    if (repairedRegionFindings.length) {
      return {
        valid: false,
        reason: 'finding-remains-in-repaired-region',
        originalAnalysis,
        repairedAnalysis,
        repairedRegionFindings
      };
    }

    if (JSON.stringify(preservedOriginal) !== JSON.stringify(preservedRepaired)) {
      return {
        valid: false,
        reason: 'outside-findings-changed',
        originalAnalysis,
        repairedAnalysis
      };
    }

    return {
      valid: true,
      reason: 'repair-passed-revalidation',
      originalAnalysis,
      repairedAnalysis,
      repairedRegionFindings: []
    };
  }

  function rejected(reason, originalTarget, extra = {}) {
    return {
      status: 'REJECTED',
      accepted: false,
      output: originalTarget,
      reason,
      ...extra
    };
  }

  async function repair(input = {}) {
    const originalTarget = text(input.targetContext);
    let request;

    if (!input.inspectorResult ||
        input.inspectorResult.status !== 'COMPLETED' ||
        input.inspectorResult.verdict !== 'TRUE_ANOMALY' ||
        input.inspectorResult.repairable !== true) {
      return rejected(
        'repair-requires-confirmed-inspector-anomaly',
        originalTarget
      );
    }

    if (typeof input.transport !== 'function') {
      throw new TypeError('TQG Repair requires an injected AI transport.');
    }

    try {
      request = buildRepairRequest(input);
      const response = await input.transport({
        systemPrompt: request.systemPrompt,
        userPrompt: request.userPrompt
      });
      const parsed = parseRepairResponse(response);
      const applied = applyBoundedReplacement(
        originalTarget,
        request.span,
        parsed.replacementText
      );

      const validation = revalidateRepair({
        analyze: input.analyze,
        originalTarget,
        repairedTarget: applied.repairedTarget,
        originalAnalysis: input.originalAnalysis,
        originalFindingCode: request.span.code,
        originalStart: request.span.start,
        originalEnd: request.span.end,
        repairedStart: applied.repairedStart,
        repairedEnd: applied.repairedEnd
      });

      if (!validation.valid) {
        return rejected(
          validation.reason,
          originalTarget,
          {
            replacementText: applied.replacement,
            repairedOutput: applied.repairedTarget,
            validation,
            span: request.span,
            contextMeta: request.contextMeta,
            meta: {
              aiCalls: 1,
              transportCalls: 1,
              revalidated: true
            }
          }
        );
      }

      return {
        status: 'ACCEPTED',
        accepted: true,
        output: applied.repairedTarget,
        replacementText: applied.replacement,
        span: request.span,
        validation,
        contextMeta: request.contextMeta,
        meta: {
          aiCalls: 1,
          transportCalls: 1,
          revalidated: true
        }
      };
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;

      return {
        status: 'ERROR',
        accepted: false,
        output: originalTarget,
        reason: 'TQG Repair failed before acceptance.',
        span: request ? request.span : null,
        meta: {
          aiCalls: request ? 1 : 0,
          transportCalls: request ? 1 : 0,
          revalidated: false,
          errorClass: error && error.constructor
            ? error.constructor.name
            : 'Error'
        }
      };
    }
  }

  const TQGRepair = Object.freeze({
    version: 'TQG-06-2026-09-30',
    REPAIR_STATUSES,
    DEFAULTS,
    buildRepairRequest,
    parseRepairResponse,
    applyBoundedReplacement,
    revalidateRepair,
    repair
  });

  global.TQGRepair = TQGRepair;
  if (typeof module === 'object' && module.exports) {
    module.exports = TQGRepair;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
