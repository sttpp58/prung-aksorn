# Phase 7A — Read-only Call-site, XSS-context, and Thai Glossary Audit

**Date:** 2026-10-09
**Base SHA:** `2e31ee46ffb86d47a03db863afad2f1d152776ec`
**Implementation branch:** `fix-then-ship/roadmap-implementation`
**Status:** Review-only phase complete; no D-08 or D-11 semantic change authorized by this evidence.

## 1. Splitter call-site impact matrix

| Consumer | Located path | Context | Phase 4 disposition |
|---|---|---|---|
| Main translate action | `app/13-batch.js` process handler | New single-chapter Translation Job | Use V2 for newly created jobs; record version and digest |
| Imported text files | `app/13-batch.js` batch import | New batch Translation Jobs | Use V2 for newly created jobs; persist per-item version/digest |
| Single-job recovery setup | `app/02-translation-recovery.js` | Reconstruct an existing job | Dispatch by stored version; no-metadata history defaults V1 |
| Batch recovery preparation/runtime | `app/02-translation-recovery.js` | Reconstruct an existing batch item | Dispatch by stored version; verify digest when available |
| Batch retry | `app/02-translation-recovery.js` | Reconstruct a failed batch item | Dispatch by stored version; verify digest when available |
| Editor chunk-count preview | `app/09-editor-draft.js` | UI estimate of translation parts | Review separately to keep estimate aligned with the new translation path |
| Glossary extraction | `app/07-glossary.js` | Sends book text to AI to extract terms | Keep V1; not a Translation Job |
| OCR repair | `app/13-batch.js` repair flow | AI OCR cleanup, not chapter translation | Keep V1; changing splits can affect OCR repair semantics |
| Generic OCR chunking helper | `app/10-ocr-chunking.js` | Shared helper and OCR routines | Keep default wrapper on V1 for compatibility |
| Cross-chapter consistency | `app/14-export.js` | AI analysis of translated chapter set | Keep V1 |
| Whole-book glossary scan | `app/16-book-tools.js` | AI glossary extraction | Keep V1 |
| Existing editor utility | `app/09-editor-draft.js` | Other editor operations | Keep V1 unless a narrowly tested translation-preview need requires V2 |

The shared default `splitIntoChunks` call must not be silently redirected to V2: that would change glossary extraction, OCR repair, book tools, and export behavior outside the approved translation/recovery scope. Only explicitly version-aware translation/recovery paths may dispatch to V2.

## 2. Dynamic HTML sink context review

The static inventory found no use of `insertAdjacentHTML`, `outerHTML`, `document.write`, `eval()`, or `new Function()` in the searched application JavaScript.

Observed `innerHTML` contexts were manually classified:

- Clear/reset sinks (`container.innerHTML = ''`) do not inject untrusted content.
- Fixed icon/SVG strings in project controls and reader controls are application-authored markup.
- Project/book titles inserted into HTML use `escapeHtml(book.title)`.
- Glossary `src` and `trans` are escaped before insertion.
- OCR preview text is escaped before insertion; reason labels and line numbers are generated from application rules/data, but must continue to be treated as a structured rendering boundary.
- Diff output is constructed through DOM nodes and `textContent`, not by interpolating the compared source/output strings into HTML.
- TTS icon selection uses application-authored static SVG strings.

**Disposition:** No new XSS vulnerability was established from this bounded review, so no rendering refactor is included. This is not a proof that the application is free of XSS; any new dynamic HTML sink must preserve these escaping/trust boundaries and receive source-to-sink review.

## 3. Thai glossary substring matching (D-11)

`checkMissedGlossaryTerms()` uses substring matching for the translated target term via `indexOf`. The mechanism is confirmed, but the baseline audit did not establish material false positives or false negatives with a vetted corpus. Thai writing and tone/combining marks make blanket normalization or a guessed “word boundary” rule risky.

**Disposition:** Preserve current matching semantics. Do not alter tone marks, Unicode normalization, or substring behavior until a separate fixed corpus defines expected true/false positives and negatives. Such a change would be separately reviewed rather than bundled into chunking/recovery hardening.

## 4. Required implementation safeguards

1. Preserve V1 splitter behavior and keep the general-purpose wrapper on V1.
2. Apply versioned V2 only to new translation jobs and their explicit recovery/retry readers.
3. Verify stored chunk count, per-chunk lengths, and SHA-256 digest for jobs that carry metadata.
4. For historic jobs without a digest, reconstruct as V1 and disclose that their original chunk boundaries cannot be cryptographically verified.
5. No IndexedDB schema bump, no TQG detector/repair semantic change, and no mass migration of non-translation consumers.

## 5. Review disposition

- **Deep Review 1 (scope/call sites):** shared-splitter consumer classes identified; scope boundary is V1 default + opt-in V2 for translation jobs only.
- **Deep Review 2 (security/data boundaries):** reviewed dynamic HTML sinks; no confirmed exploitable finding from inspected contexts; limitations retained above.
- **Deep Review 3 (compatibility/semantics):** glossary matching remains unchanged absent corpus evidence; OCR/glossary/export/book consumers stay V1.
- **Prerequisite decision:** Phase 4 versioned chunker may proceed under the restrictions above.
