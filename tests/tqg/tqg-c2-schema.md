# TQG C2 — Real-World Gold Label Dataset

## Purpose

C2 creates a real-world, manually adjudicated evaluation set from completed
production-derived translations. It is an evaluation artifact, not a new
translation rule and not a detector update.

## Locked sample design

| Stratum | Cases |
|---|---:|
| RANDOM_CLEAN | 50 |
| RANDOM_MIXED | 50 |
| TQG_FLAGGED | 50 |
| EDGE_CASE | 25 |
| **Total** | **175** |

The base sample was content-deduplicated using SHA-256 over source/target
content identity. One generic edge control was replaced by an observed
prompt-leak case so every locked taxonomy class has coverage.

## Gold-label taxonomy

| Label | Meaning |
|---|---|
| TRUE_ANOMALY | Material translation/output contamination or corruption is confirmed. |
| FALSE_POSITIVE | TQG flagged content, but review found no material anomaly. |
| AMBIGUOUS | Evidence is insufficient for a definitive adjudication. |
| LEGITIMATE_FOREIGN | Foreign-language/name content is intentional and context-supported. |
| LEGITIMATE_TECHNICAL | Foreign notation is an intentional technical/unit/domain term. |
| STRUCTURAL_ERROR | Material structural defect such as paragraph loss is confirmed. |
| META/PROMPT_LEAK | Assistant/system-style text has leaked into novel output. |
| OTHER | No material anomaly under the locked TQG scope. |

## Annotation rules

Review is bounded to source, target, finding evidence, glossary/context when
available, and local context around the suspicious span. Foreign text is not
an error by itself. Proper names, technical terms, units, URLs, code-like
tokens, and deliberate quotations must be considered before labeling.

Repeated text is not automatically corruption: dialogue emphasis, hesitation,
sound effects, and repeated terminology can be legitimate.

Quote-count differences are not automatically structural errors because
quotation-style and formatting changes can alter detector counts.

A single reviewer performed the C2 adjudication. AMBIGUOUS is retained and
excluded from binary effectiveness denominators. A future independent second
reviewer can be used to measure inter-annotator agreement.

## Private-data boundary

The full source/target text is production-derived and may contain copyrighted
novel content. It remains under tests/tqg/c2-private/, which is gitignored.
Only schema, tooling, aggregate results, and non-content metadata may be
committed to the public repository.

Do not commit full chapters, backup exports, translation history, glossary
dumps, or other private production artifacts.

## Validation requirements

The C2 validator must confirm:
1. exactly 175 cases and the locked stratum counts;
2. all eight taxonomy labels are represented;
3. unique case IDs and unique source/target content hashes;
4. every case is GOLD_REVIEWED and has a rationale;
5. content hashes match the stored source/target pair;
6. the private corpus is not tracked by Git;
7. binary metrics exclude AMBIGUOUS and are reported only as
   sample-stratified effectiveness, not as production prevalence.

## Scope guard

C2 must not modify translation providers, prompts, translation-job state,
storage/recovery semantics, Reader/PWA behavior, or automatic translation
integration boundaries.
