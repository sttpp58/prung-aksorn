/*
 * TQG V1 — AI Inspector (TQG-05)
 *
 * AI-assisted inspection for suspicious completed-translation candidates.
 * The module is transport-agnostic: callers inject the application's
 * existing AI transport. No provider, network, storage, or translation-core
 * dependency is allowed here.
 */
(function initTQGInspector(global) {
  'use strict';

  const VERDICTS = Object.freeze([
    'TRUE_ANOMALY',
    'FALSE_POSITIVE',
    'UNCERTAIN'
  ]);

  const INSPECTION_STATUSES = Object.freeze([
    'NOT_REQUIRED',
    'COMPLETED',
    'ERROR'
  ]);

  const DEFAULTS = Object.freeze({
    contextChars: 600,
    sourceMaxChars: 1600,
    glossaryMaxChars: 800,
    maxFindings: 8,
    maxReasonChars: 1200,
    maxReplacementHintChars: 1000
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
  function resolveSuspiciousSpan(targetText, suspiciousSpan, findings) {
    const candidate = suspiciousSpan && typeof suspiciousSpan === 'object'
      ? suspiciousSpan
      : Array.isArray(findings) && findings.length
        ? findings[0]
        : null;

    if (!candidate) return null;

    const start = clamp(candidate.start, 0, targetText.length, 0);
    const end = clamp(
      candidate.end,
      start,
      targetText.length,
      start + text(candidate.text).length
    );
    if (end <= start) return null;

    return {
      code: text(candidate.code),
      start,
      end,
      text: targetText.slice(start, end)
    };
  }

  function clipAroundSpan(targetText, span, contextChars) {
    if (!span) return { before: '', suspicious: '', after: '' };

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
  function sanitizeFinding(finding) {
    if (!finding || typeof finding !== 'object') return null;

    const code = text(finding.code);
    if (!code) return null;

    return {
      code,
      severity: text(finding.severity),
      text: clipText(finding.text, 500),
      evidence: {
        reason: clipText(finding.evidence && finding.evidence.reason, 300),
        matchType: clipText(finding.evidence && finding.evidence.matchType, 200)
      }
    };
  }

  function selectRelevantFindings(findings, suspiciousSpan, maxFindings) {
    const source = Array.isArray(findings) ? findings : [];
    return source
      .filter((finding) => finding && typeof finding === 'object')
      .sort((a, b) => {
        const aOverlap = suspiciousSpan &&
          Number.isFinite(a.start) &&
          Number.isFinite(a.end) &&
          a.start < suspiciousSpan.end &&
          a.end > suspiciousSpan.start ? 0 : 1;
        const bOverlap = suspiciousSpan &&
          Number.isFinite(b.start) &&
          Number.isFinite(b.end) &&
          b.start < suspiciousSpan.end &&
          b.end > suspiciousSpan.start ? 0 : 1;
        return aOverlap - bOverlap ||
          (Number(a.start) || 0) - (Number(b.start) || 0);
      })
      .slice(0, maxFindings)
      .map(sanitizeFinding)
      .filter(Boolean);
  }
  function buildInspectorRequest(input = {}) {
    const targetText = text(input.targetContext);
    const sourceContext = clipText(
      input.sourceContext,
      clamp(input.sourceMaxChars, 200, 4000, DEFAULTS.sourceMaxChars)
    );
    const glossaryContext = clipText(
      input.glossaryContext,
      clamp(input.glossaryMaxChars, 100, 2000, DEFAULTS.glossaryMaxChars)
    );
    const span = resolveSuspiciousSpan(targetText, input.suspiciousSpan, input.findings);
    if (!span) throw new TypeError('TQG Inspector requires a bounded suspicious span.');

    const context = clipAroundSpan(targetText, span, input.contextChars);
    const findings = selectRelevantFindings(
      input.findings,
      span,
      clamp(input.maxFindings, 1, 20, DEFAULTS.maxFindings)
    );

    const systemPrompt = [
      'You are a translation-quality inspector.',
      'Inspect only the bounded suspicious span and the minimum context provided.',
      'Compare source context, target context, findings, and relevant glossary terms.',
      'Do not rewrite the full chapter or surrounding text.',
      'Do not invent a repair beyond the suspicious span.',
      'Return JSON only with exactly these fields:',
      '{"verdict":"TRUE_ANOMALY|FALSE_POSITIVE|UNCERTAIN","repairable":true|false,"reason":"...","replacementHint":"..."}',
      'Use TRUE_ANOMALY only when the evidence supports a real translation/output anomaly.',
      'Use FALSE_POSITIVE for legitimate names, terms, abbreviations, units, URLs, or other justified preserved text.',
      'Use UNCERTAIN when the evidence is insufficient.'
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
      JSON.stringify(findings)
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
        findingCount: findings.length
      }
    };
  }
  function stripJsonFence(value) {
    const source = text(value).trim();
    if (!source) return '';
    const fence = String.fromCharCode(96).repeat(3);
    const fenced = source.match(new RegExp('^' + fence + '(?:json)?\\s*([\\s\\S]*?)\\s*' + fence + '$', 'i'));
    return fenced ? fenced[1].trim() : source;
  }

  function parseInspectorResponse(rawResponse) {
    const raw = stripJsonFence(
      typeof rawResponse === 'string'
        ? rawResponse
        : rawResponse && typeof rawResponse.text === 'string'
          ? rawResponse.text
          : ''
    );

    if (!raw) throw new TypeError('TQG Inspector returned an empty response.');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (firstError) {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start < 0 || end <= start) throw firstError;
      parsed = JSON.parse(raw.slice(start, end + 1));
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new TypeError('TQG Inspector response must be a JSON object.');
    }

    const verdict = text(parsed.verdict).toUpperCase();
    if (!VERDICTS.includes(verdict)) {
      throw new TypeError('TQG Inspector returned an invalid verdict.');
    }

    const reason = normalizeSpace(parsed.reason);
    if (!reason) throw new TypeError('TQG Inspector response requires a reason.');

    const repairable = verdict === 'TRUE_ANOMALY' &&
      parsed.repairable === true;

    const replacementHint = verdict === 'TRUE_ANOMALY'
      ? clipText(parsed.replacementHint, DEFAULTS.maxReplacementHintChars)
      : '';

    return {
      verdict,
      repairable,
      reason: clipText(reason, DEFAULTS.maxReasonChars),
      replacementHint
    };
  }
  function notRequired() {
    return {
      status: 'NOT_REQUIRED',
      verdict: 'NOT_REQUIRED',
      repairable: false,
      reason: 'TQG Inspector not required for a clean analysis.',
      replacementHint: '',
      meta: {
        aiCalls: 0,
        transportCalls: 0
      }
    };
  }

  async function inspect(input = {}) {
    const analysis = input.analysis;
    const findings = Array.isArray(input.findings)
      ? input.findings
      : analysis && Array.isArray(analysis.findings)
        ? analysis.findings
        : [];

    if (
      analysis &&
      (
        analysis.status === 'PASS' ||
        findings.length === 0
      )
    ) {
      return notRequired();
    }

    if (findings.length === 0) {
      return notRequired();
    }

    if (typeof input.transport !== 'function') {
      throw new TypeError('TQG Inspector requires an injected AI transport.');
    }

    const request = buildInspectorRequest({
      ...input,
      findings
    });

    try {
      const response = await input.transport({
        systemPrompt: request.systemPrompt,
        userPrompt: request.userPrompt
      });
      const result = parseInspectorResponse(response);

      return {
        status: 'COMPLETED',
        ...result,
        span: request.span,
        contextMeta: request.contextMeta,
        meta: {
          aiCalls: 1,
          transportCalls: 1
        }
      };
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;

      return {
        status: 'ERROR',
        verdict: 'UNCERTAIN',
        repairable: false,
        reason: 'TQG Inspector transport or response parsing failed.',
        replacementHint: '',
        span: request.span,
        contextMeta: request.contextMeta,
        meta: {
          aiCalls: 1,
          transportCalls: 1,
          errorClass: error && error.constructor
            ? error.constructor.name
            : 'Error'
        }
      };
    }
  }

  const TQGInspector = Object.freeze({
    version: 'TQG-05-2026-09-30',
    VERDICTS,
    INSPECTION_STATUSES,
    DEFAULTS,
    clipText,
    clipAroundSpan,
    buildInspectorRequest,
    parseInspectorResponse,
    inspect
  });

  global.TQGInspector = TQGInspector;
  if (typeof module === 'object' && module.exports) {
    module.exports = TQGInspector;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
