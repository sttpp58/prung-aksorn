# TQG V1 — C5 Phase C Final Audit

Repository: sttpp58/prung-aksorn
Audited branch: tqg-phase-c5-reconciled
Audited commit: 83a78374b88fde007a1b8d3d83f166d2a5b1eef5
Reconciliation inputs: C4 4d676bcd69f9076b889605cec7857b68a93eac1a + C5 97c0c286a2cbaa7e806256cb1887a526b4c831db
Baseline commit: 7659d7514cc389f7fc2f1cc23521b3c533a737f9
Audit date: 2026-09-30
Audit scope: C5 Phase C Final Audit / Gate
Core-logic policy: no translation-engine, storage, Translation Job, checkpoint/CAS, recovery, batch, or Reader core changes.

## Final decision

C5 Engineering Gate: PASS

Phase C Final Status: PASS WITH LIMITATION

Semantic repair accuracy remains DEFERRED: no real-world gold repaired target is committed to the public repository.

This limitation is retained intentionally. It is a semantic-evaluation limitation, not an engineering-safety failure.

## Phase C status matrix

| Phase | Status | C5 disposition |
|---|---|---|
| C1 Performance Hardening | PASS | Carried forward from the TQG-10 audit result; C5 does not change detector performance logic. |
| C2 Real-World Gold Dataset | PASS | Carried forward. The public repository verifies the sanitized 120-case corpus; private real-world gold data is not directly auditable here. |
| C3 Detector Effectiveness Audit | CONDITIONAL PASS | Carried forward. Deterministic evidence, exception handling, classification, and all 10 locked finding codes remain covered. |
| C4 Real-World Repair Validation | PASS WITH LIMITATION | Re-audited on the reconciled C1+C2+C4 tree; real-world repair validation, boundaries, re-validation, fail-closed behavior, preservation, and regression remain enforced. |
| C5 Phase C Final Audit / Gate | PASS | Engineering safety gate passes; the semantic gold limitation remains explicit. |

## C5 objectives

The gate verifies runtime/version consistency, public corpus safety, deterministic zero-AI/no-network behavior, bounded Inspector and Repair behavior, mandatory repair re-validation, completion-boundary integration, non-destructive UI behavior, protected storage/core logic, repository hygiene, and preservation of the semantic-repair limitation.

## Scope boundary

storage-v2.js must remain byte-identical to the pre-TQG baseline.

Baseline storage blob: cb193ed38ad190b9de29d466c79102833066cf70

TQG remains outside Translation Job checkpoint/CAS semantics.

No C5 change authorizes translation-engine, prompt, model/provider, storage, recovery, batch, backup/restore, or Reader redesign.

## C1 — Performance Hardening

Status: PASS — carried forward.

The TQG-10 audit recorded approximately 0.0528 ms per deterministic analysis. C5 does not alter the detector/classifier implementation or add a runtime dependency.

## C2 — Real-World Gold Dataset

Status: PASS — carried forward.

The public repository contains the sanitized 120-case corpus, including targeted-repair fixtures. The fixtures include synthetic expected targets.

Synthetic expected targets are test fixtures and are not equivalent to a real-world gold repaired-target dataset.

C5 therefore does not convert synthetic fixtures into a claim of real-world semantic repair accuracy.

## C3 — Detector Effectiveness

Status: CONDITIONAL PASS — carried forward.

The locked ten finding codes remain present and covered by the existing TQG regression suite:

FOREIGN_SCRIPT_SPAN, SOURCE_LANGUAGE_RESIDUE, SOURCE_TEXT_OVERLAP, MIXED_LANGUAGE_SPAN, PROMPT_LEAKAGE, REPEATED_TEXT, STRUCTURAL_TRUNCATION, PARAGRAPH_LOSS, QUOTE_ANOMALY, PUA_OR_REPLACEMENT_CHAR.

C5 does not reinterpret conditional effectiveness as universal semantic correctness.

## C4 — Real-World Repair Validation

Status: PASS WITH LIMITATION — carried forward.

The repair layer continues to enforce bounded spans, stale-span rejection, bounded replacement size, exact prefix/suffix preservation, mandatory deterministic re-validation, rejection of remaining/new findings in the repair region, rejection when findings outside the repair region change, and preservation of the original output on rejected repair.

The empty-output structural anchor remains inspectable, but V1 still does not reconstruct missing output.

Semantic repair accuracy remains DEFERRED: no real-world gold repaired target is committed to the public repository.

## Integration safety

The locked integration flow is:

completed translation -> deterministic TQG analysis -> optional Inspector -> confirmed targeted Repair -> mandatory re-validation

The forbidden V1 pattern remains:

checkpoint -> TQG -> checkpoint

TQG remains outside Translation Job checkpoint/CAS semantics.

## Repository and release hygiene

C5 verifies no tracked backup/*.json runtime/user backups, the backup .gitignore guard, immutable CI action pins, public-corpus safety flags, synthetic/minimal fixtures, no copyrighted full-text fixtures, a TQG-surface secret-pattern scan, and emoji-free TQG UI.

## Regression gate

C5 runs the existing scripts/tqg-regression.mjs suite and requires TQG-09 Regression: PASS.

The existing Regression Gate is extended to invoke the C5 audit, rather than replacing the established regression system.

## What C5 does not claim

C5 does not claim semantic equivalence of repaired translations, human-level translation quality, universal foreign-language detection, universal false-negative elimination, correctness for every novel/domain/style, real-world gold repaired-target accuracy, automatic missing-output reconstruction, or whole-chapter rewriting safety.

## Gate failure conditions

The C5 gate fails when protected storage changes, a locked TQG version drifts, public corpus safety invariants fail, TQG-09 fails, integration loses its completion/translate-only boundary, storage/Translation Job coupling appears, Repair loses fail-closed/re-validation enforcement, immutable action pins are removed, runtime backup JSON is reintroduced, or the semantic limitation is removed without an actual real-world gold repaired-target evaluation.

## Phase C exit

Engineering: CLOSED

Semantic validation: DEFERRED

The remaining evidence required to close the limitation is a real-world gold repaired-target dataset suitable for semantic comparison.

No C5 change fabricates, infers, or silently substitutes that missing evidence.

## Audit conclusion

C5 Phase C Final Audit / Gate: PASS

Phase C final state: PASS WITH LIMITATION
