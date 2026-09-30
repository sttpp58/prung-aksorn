/*
 * TQG V1 — Deterministic Detector (TQG-02)
 *
 * Local-only, deterministic analysis for completed translation output.
 * No AI provider, network request, storage mutation, or translation-core
 * dependency is allowed in this module.
 *
 * TQG-03 may extend the exception surface later. The built-in protections
 * here are conservative token recognition only; they do not disable TQG.
 */
(function initTQG(global) {
  'use strict';

  const CODES = Object.freeze([
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

  const CONFIG = Object.freeze({
    minOverlapWords: 2,
    minOverlapChars: 8,
    minRepeatChars: 10,
    truncationRatio: 0.55,
    maxForeignWordTokensForName: 4
  });

  const PROMPT_MARKERS = Object.freeze([
    'here is the translation',
    'here is the requested thai translation',
    'as an ai language model',
    'i translated the text as follows',
    'sure!',
    'i hope this helps',
    'translation:',
    'i cannot guarantee accuracy',
    'คำแปลคือ'
  ]);

  const TECHNICAL_PATTERNS = Object.freeze([
    /^wi-fi$/i, /^wifi$/i, /^gpt(?:[-_.]\d+)?$/i, /^hp$/i, /^mp$/i,
    /^lv$/i, /^pdf$/i, /^url$/i, /^usb$/i, /^rpg$/i, /^3d$/i,
    /^[a-z]{1,5}\.[a-z0-9]+$/i, /^[a-z]+-\d+(?:\.\d+)*$/i,
    /^[a-z]+\d+[a-z0-9]*$/i
  ]);

  const FOREIGN_LETTER = /\p{L}/u;
  const THAI_LETTER = /\p{Script=Thai}/u;
  const THAI_CODEPOINT = /[\u0E00-\u0E7F]/;
  const PUA_OR_REPLACEMENT = /[\uE000-\uF8FF\uFFF0-\uFFFF\uFFFD]/u;
  const LATIN_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/u;
  const LATIN_WORD = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[’'\-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

  function text(value) {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  }

  function normalizeSpace(value) {
    return text(value).replace(/\s+/g, ' ').trim();
  }

  function normalizeComparable(value) {
    return normalizeSpace(value)
      .replace(/[“”„‟«»「」『』]/g, '"')
      .replace(/[‐‑‒–—−]/g, '-')
      .toLocaleLowerCase();
  }

  function wordTokens(value) {
    const source = text(value);
    const tokens = [];
    const pattern = /[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      tokens.push({
        text: match[0],
        normalized: match[0].toLocaleLowerCase(),
        start: match.index,
        end: match.index + match[0].length
      });
    }
    return tokens;
  }

  function normalizeGlossary(value) {
    const ranges = [];
    for (const line of text(value).split(/\r?\n/)) {
      const match = line.match(/^\s*(.*?)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      for (const side of [match[1], match[2]]) {
        const term = normalizeSpace(side);
        if (term) ranges.push(term);
      }
    }
    return ranges.sort((a, b) => b.length - a.length);
  }

  function rangeContains(ranges, start, end) {
    return ranges.some((range) => start >= range.start && end <= range.end);
  }

  function addRange(ranges, start, end, reason) {
    if (end <= start) return;
    ranges.push({ start, end, reason });
  }

  function findLiteralRanges(source, needles) {
    const ranges = [];
    const haystack = text(source);
    for (const needle of needles) {
      if (!needle) continue;
      let from = 0;
      while (true) {
        const index = haystack.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase(), from);
        if (index < 0) break;
        addRange(ranges, index, index + needle.length, 'protected');
        from = index + needle.length;
      }
    }
    return ranges;
  }

  function isTechnicalToken(value) {
    const token = normalizeSpace(value).replace(/[.,!?;:]+$/g, '');
    if (!token || token.length > 24) return false;
    return TECHNICAL_PATTERNS.some((pattern) => pattern.test(token));
  }

  function isLikelyName(value, sourceText) {
    const parts = normalizeSpace(value).split(/\s+/);
    if (parts.length < 2 || parts.length > CONFIG.maxForeignWordTokensForName) return false;
    if (!parts.every((part) => /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]+$/u.test(part))) return false;
    const needle = normalizeComparable(value);
    return needle.length >= 5 &&
      normalizeComparable(sourceText).includes(needle);
  }

  function expandPromptRange(targetText, range) {
    let end = range.end;
    while (end < targetText.length && !THAI_LETTER.test(targetText[end])) end += 1;
    return { ...range, end };
  }

  function buildProtectedRanges(targetText, sourceText, glossaryText) {
    const ranges = [];
    const promptRanges = mergeRanges(findLiteralRanges(targetText, PROMPT_MARKERS))
      .map((range) => expandPromptRange(targetText, range));
    promptRanges.forEach((range) => {
      range.reason = 'prompt-marker';
      ranges.push(range);
    });

    const urlPattern = /(?:https?:\/\/|www\.)\S+|[^\s@]+@[^\s@]+\.[^\s@]+/giu;
    let match;
    while ((match = urlPattern.exec(text(targetText))) !== null) {
      addRange(ranges, match.index, match.index + match[0].length, 'url-or-email');
    }

    for (const term of normalizeGlossary(glossaryText)) {
      let from = 0;
      const haystack = text(targetText);
      while (true) {
        const index = haystack.toLocaleLowerCase().indexOf(term.toLocaleLowerCase(), from);
        if (index < 0) break;
        addRange(ranges, index, index + term.length, 'glossary-term');
        from = index + term.length;
      }
    }
    const tokens = wordTokens(targetText);
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index].text;
      if (!LATIN_LETTER.test(token) || !isTechnicalToken(token)) continue;
      addRange(ranges, tokens[index].start, tokens[index].end, 'technical-token');
    }

    const foreignSpans = collectForeignSpans(targetText);
    for (const span of foreignSpans) {
      if (isLikelyName(span.text, sourceText)) {
        addRange(ranges, span.start, span.end, 'preserved-source-name');
      }
    }
    return mergeRanges(ranges);
  }

  function mergeRanges(ranges) {
    if (!ranges.length) return [];
    const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const range of sorted) {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
        if (previous.reason !== range.reason) previous.reason = 'protected';
      } else {
        merged.push({ ...range });
      }
    }
    return merged;
  }

  function isForeignChar(char) {
    return /\p{L}/u.test(char) && !THAI_LETTER.test(char);
  }

  function collectForeignSpans(targetText) {
    const source = text(targetText);
    const spans = [];
    let start = -1;
    let end = -1;

    const flush = () => {
      if (start >= 0 && end > start) {
        spans.push({
          start,
          end,
          text: source.slice(start, end)
        });
      }
      start = -1;
      end = -1;
    };

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (isForeignChar(char)) {
        if (start < 0) start = index;
        end = index + 1;
        continue;
      }

      if (start < 0) continue;
      const next = source[index + 1] || '';
      const connector = /[ \t\-/'’\.]/u.test(char);
      if (connector && isForeignChar(next)) {
        end = index + 1;
        continue;
      }
      flush();
    }
    flush();

    return spans;
  }

  function findOverlap(targetSpan, sourceText) {
    const targetTokens = wordTokens(targetSpan.text);
    const sourceTokens = wordTokens(sourceText);
    if (!targetTokens.length || !sourceTokens.length) return null;

    const targetWords = targetTokens.map((token) => token.normalized);
    const sourceWords = sourceTokens.map((token) => token.normalized);
    let best = null;

    for (let start = 0; start < targetWords.length; start += 1) {
      for (let length = targetWords.length - start; length >= 1; length -= 1) {
        if (length < CONFIG.minOverlapWords) break;
        const phraseWords = targetWords.slice(start, start + length);
        let sourceMatch = false;
        for (let sourceStart = 0; sourceStart + length <= sourceWords.length; sourceStart += 1) {
          if (sourceWords.slice(sourceStart, sourceStart + length)
            .every((word, offset) => word === phraseWords[offset])) {
            sourceMatch = true;
            break;
          }
        }
        if (!sourceMatch) continue;

        const matched = targetTokens.slice(start, start + length);
        const matchedText = targetSpan.text.slice(
          matched[0].start,
          matched[matched.length - 1].end
        );
        if (matchedText.length < CONFIG.minOverlapChars) continue;

        best = {
          start: targetSpan.start + matched[0].start,
          end: targetSpan.start + matched[matched.length - 1].end,
          text: matchedText,
          wordCount: length
        };
        break;
      }
      if (best) break;
    }
    return best;
  }

  function findExactSourceCopy(sourceText, targetText) {
    const source = normalizeComparable(sourceText);
    const target = normalizeComparable(targetText);
    return Boolean(source && target && source === target && source.length >= CONFIG.minOverlapChars);
  }

  function splitSentences(value) {
    const source = normalizeSpace(value);
    if (!source) return [];
    const chunks = source.split(/(?<=[.!?。！？])\s+|\n+/u).map(normalizeSpace).filter(Boolean);
    return chunks.length ? chunks : [source];
  }

  function splitParagraphs(value) {
    return text(value).split(/\r?\n\s*\r?\n/u).map(normalizeSpace).filter(Boolean);
  }

  function countQuotePairs(value) {
    const source = text(value);
    const pairs = [
      ['"', '"'],
      ['“', '”'],
      ['「', '」'],
      ['『', '』']
    ];
    let openings = 0;
    let closings = 0;
    let quoted = [];
    for (const [open, close] of pairs) {
      if (open === close) {
        const count = [...source].filter((char) => char === open).length;
        openings += Math.floor(count / 2);
        closings += Math.floor(count / 2);
        if (count % 2) openings += 1;
      } else {
        openings += [...source].filter((char) => char === open).length;
        closings += [...source].filter((char) => char === close).length;
      }
    }
    const stripped = source.replace(/"[^"]*"/gs, '')
      .replace(/“[^”]*”/gs, '')
      .replace(/「[^」]*」/gs, '')
      .replace(/『[^』]*』/gs, '');
    return { openings, closings, quoted, outside: normalizeSpace(stripped) };
  }

  function findRepeatedText(targetText) {
    const tokens = wordTokens(targetText);
    let best = null;
    for (let start = 0; start < tokens.length; start += 1) {
      const maxLength = Math.floor((tokens.length - start) / 2);
      for (let length = maxLength; length >= 1; length -= 1) {
        const left = tokens.slice(start, start + length).map((token) => token.normalized);
        const right = tokens.slice(start + length, start + length * 2)
          .map((token) => token.normalized);
        if (left.join(' ') !== right.join(' ')) continue;
        const repeatStart = tokens[start].start;
        const repeatEnd = tokens[start + length * 2 - 1].end;
        const repeated = text(targetText).slice(repeatStart, repeatEnd);
        if (repeated.length < CONFIG.minRepeatChars) continue;
        if (!best || repeated.length > best.text.length) {
          best = { start: repeatStart, end: repeatEnd, text: repeated, repeats: 2 };
        }
        break;
      }
    }
    return best;
  }

  function severityFor(code) {
    if ([
      'SOURCE_LANGUAGE_RESIDUE',
      'SOURCE_TEXT_OVERLAP',
      'MIXED_LANGUAGE_SPAN',
      'PROMPT_LEAKAGE',
      'STRUCTURAL_TRUNCATION',
      'PARAGRAPH_LOSS'
    ].includes(code)) return 'high';
    return 'medium';
  }

  function analyze(input = {}) {
    const sourceText = text(input.sourceText);
    const targetText = text(input.targetText);
    const glossaryText = text(input.glossaryText);
    const findings = [];
    const seen = new Set();

    const addFinding = (code, range, evidence = {}) => {
      if (!CODES.includes(code) || !range || range.end <= range.start) return;
      const key = [
        code, range.start, range.end, normalizeComparable(range.text)
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      findings.push({
        code,
        severity: severityFor(code),
        text: range.text,
        start: range.start,
        end: range.end,
        evidence: { ...evidence }
      });
    };

    if (PUA_OR_REPLACEMENT.test(targetText)) {
      const match = PUA_OR_REPLACEMENT.exec(targetText);
      addFinding('PUA_OR_REPLACEMENT_CHAR', {
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      }, { reason: 'private-use-area-or-replacement-character' });
    }

    const promptRanges = mergeRanges(findLiteralRanges(targetText, PROMPT_MARKERS));
    for (const range of promptRanges) {
      addFinding('PROMPT_LEAKAGE', {
        start: range.start,
        end: range.end,
        text: targetText.slice(range.start, range.end)
      }, { marker: targetText.slice(range.start, range.end) });
    }

    const sourceCopy = findExactSourceCopy(sourceText, targetText);
    const protectedRanges = buildProtectedRanges(targetText, sourceText, glossaryText);

    if (sourceCopy) {
      addFinding('SOURCE_LANGUAGE_RESIDUE', {
        start: 0, end: targetText.length, text: targetText
      }, { matchType: 'exact-source-copy' });
      addFinding('SOURCE_TEXT_OVERLAP', {
        start: 0, end: targetText.length, text: targetText
      }, { matchType: 'exact-source-copy' });
    }

    if (!sourceCopy) {
      for (const span of collectForeignSpans(targetText)) {
        if (rangeContains(protectedRanges, span.start, span.end)) continue;

        const overlap = findOverlap(span, sourceText);
        const nonLatinForeign = !LATIN_LETTER.test(span.text);
        const thaiContext = THAI_CODEPOINT.test(targetText);
        const contextualOverlap = !overlap && nonLatinForeign && thaiContext &&
          splitSentences(sourceText).length === 1 &&
          splitSentences(targetText).length === 1;

        if (overlap) {
          addFinding('FOREIGN_SCRIPT_SPAN', span, {
            reason: 'foreign-script-span',
            protected: false
          });
          if (thaiContext && LATIN_LETTER.test(span.text)) {
            addFinding('MIXED_LANGUAGE_SPAN', span, {
              reason: 'foreign-latin-span-inside-thai-output',
              overlapEvidence: true
            });
          }
          addFinding('SOURCE_LANGUAGE_RESIDUE', {
            start: overlap.start, end: overlap.end, text: overlap.text
          }, { matchType: 'exact-normalized-token-overlap' });
          addFinding('SOURCE_TEXT_OVERLAP', {
            start: overlap.start, end: overlap.end, text: overlap.text
          }, { matchType: 'exact-normalized-token-overlap' });
          continue;
        }

        if (contextualOverlap) {
          addFinding('FOREIGN_SCRIPT_SPAN', span, {
            reason: 'foreign-script-span', protected: false
          });
          addFinding('SOURCE_LANGUAGE_RESIDUE', span, {
            matchType: 'cross-script-source-context'
          });
          addFinding('SOURCE_TEXT_OVERLAP', span, {
            matchType: 'cross-script-source-context'
          });
          continue;
        }

        if (thaiContext && nonLatinForeign) {
          addFinding('FOREIGN_SCRIPT_SPAN', span, {
            reason: 'foreign-script-span', protected: false
          });
          addFinding('SOURCE_LANGUAGE_RESIDUE', span, {
            matchType: 'non-target-script'
          });
        } else if (thaiContext && LATIN_LETTER.test(span.text)) {
          addFinding('FOREIGN_SCRIPT_SPAN', span, {
            reason: 'foreign-script-span', protected: false
          });
          addFinding('MIXED_LANGUAGE_SPAN', span, {
            reason: 'foreign-span-without-source-overlap'
          });
        } else {
          addFinding('FOREIGN_SCRIPT_SPAN', span, {
            reason: 'foreign-script-span', protected: false
          });
        }
      }
    }
    const sourceSentences = splitSentences(sourceText);
    const targetSentences = splitSentences(targetText);
    const sourceParagraphs = splitParagraphs(sourceText);
    const targetParagraphs = splitParagraphs(targetText);
    const sourceComparable = normalizeComparable(sourceText);
    const targetComparable = normalizeComparable(targetText);

    if (sourceComparable && !targetComparable) {
      addFinding('STRUCTURAL_TRUNCATION', {
        start: 0, end: targetText.length, text: targetText
      }, { reason: 'empty-target-output' });
    } else if (
      sourceSentences.length >= 3 &&
      targetSentences.length <= sourceSentences.length - 2 &&
      targetComparable.length / Math.max(sourceComparable.length, 1) < CONFIG.truncationRatio
    ) {
      addFinding('STRUCTURAL_TRUNCATION', {
        start: 0, end: targetText.length, text: targetText
      }, {
        reason: 'source-sentence-count-minus-two-and-length-ratio',
        sourceSentences: sourceSentences.length,
        targetSentences: targetSentences.length,
        lengthRatio: targetComparable.length / Math.max(sourceComparable.length, 1)
      });
    }

    if (
      sourceParagraphs.length >= 2 &&
      targetParagraphs.length < sourceParagraphs.length &&
      targetComparable.length / Math.max(sourceComparable.length, 1) < 0.8
    ) {
      addFinding('PARAGRAPH_LOSS', {
        start: 0, end: targetText.length, text: targetText
      }, {
        reason: 'fewer-target-paragraphs-with-shortened-output',
        sourceParagraphs: sourceParagraphs.length,
        targetParagraphs: targetParagraphs.length
      });
    }

    const repeated = findRepeatedText(targetText);
    if (repeated) {
      addFinding('REPEATED_TEXT', repeated, {
        repeats: repeated.repeats,
        reason: 'adjacent-identical-token-sequence'
      });
    }

    const sourceQuotes = countQuotePairs(sourceText);
    const targetQuotes = countQuotePairs(targetText);
    if (
      sourceQuotes.openings !== targetQuotes.openings ||
      sourceQuotes.closings !== targetQuotes.closings ||
      (
        sourceQuotes.openings > 0 &&
        sourceQuotes.outside.length >= 8 &&
        targetQuotes.outside.length < sourceQuotes.outside.length * 0.25
      )
    ) {
      addFinding('QUOTE_ANOMALY', {
        start: 0, end: targetText.length, text: targetText
      }, {
        reason: 'quote-count-or-outside-quote-structure-mismatch',
        sourceOpen: sourceQuotes.openings,
        targetOpen: targetQuotes.openings,
        sourceClose: sourceQuotes.closings,
        targetClose: targetQuotes.closings
      });
    }

    findings.sort((a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      a.code.localeCompare(b.code)
    );

    return {
      status: findings.length ? 'REVIEW' : 'PASS',
      findings,
      meta: {
        detectorVersion: 'TQG-02-2026-09-30',
        deterministic: true,
        aiCalls: 0,
        networkAccess: false
      }
    };
  }

  const TQG = Object.freeze({
    version: 'TQG-02-2026-09-30',
    FINDING_CODES: CODES,
    CONFIG,
    analyze
  });

  global.TQG = TQG;
  if (typeof module === 'object' && module.exports) module.exports = TQG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
