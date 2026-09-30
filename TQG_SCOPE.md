# TQG V1 — Translation Quality Guard
## Phase 0 — Scope / Contract Lock

**Repository:** `sttpp58/prung-aksorn`  
**Branch baseline:** `main`  
**Baseline commit:** `7659d7514cc389f7fc2f1cc23521b3c533a737f9`  
**Phase:** TQG-00  
**Status:** LOCKED  
**Purpose:** Freeze the TQG V1 boundary before implementation.

---

## 1. Mission

TQG (Translation Quality Guard) is a quality-guard layer around the existing translation pipeline.

Its mission is:

> Detect and mitigate obvious translation contamination and output anomalies produced by the existing small AI translation model, without replacing, rewriting, or redesigning the translation engine.

The primary problem addressed by TQG V1 is:

- Thai translation is mostly usable.
- A portion of the source language may remain untranslated.
- Foreign-language spans may appear inside otherwise Thai output.
- The output may contain obvious structural or duplication anomalies.
- The system should identify, localize, inspect, and safely repair such failures without requiring a better translation model.

TQG is **not** intended to make the translation semantically perfect.

---

## 2. Primary Target

TQG V1 primarily guards the output of:

`state.source === 'translate'`

where the target language is Thai.

The `polish` mode is **not a primary TQG V1 integration target**.

TQG may remain architecturally reusable for other modes later, but such support is outside the locked V1 implementation scope.

---

## 3. Core Operating Model

The locked V1 pipeline is:

```
Existing Translation Engine
        |
        v
Completed Translation Output
        |
        v
TQG Deterministic Guard
        |
        +---- PASS ----------------------------+
        |                                      |
        v                                      |
  Findings / Candidates                       |
        |                                      |
        v                                      |
  Exception Layer                             |
        |                                      |
        v                                      |
  Suspicion Classification                    |
        |                                      |
        +---- REVIEW / HIGH_SUSPICION ---------+
                         |
                         v
                  Optional AI Inspector
                         |
              +----------+----------+
              |          |          |
              v          v          v
           FALSE       TRUE      UNCERTAIN
           POSITIVE    ANOMALY
                          |
                          v
                  Targeted Repair
                          |
                          v
                  Mandatory Re-validation
                          |
                    +-----+-----+
                    |           |
                    v           v
                  ACCEPT      REJECT
                                |
                                v
                       Preserve original
```

### Locked design principles

1. Deterministic detection happens before AI inspection.
2. `PASS` does not trigger an AI call.
3. AI Inspector and AI Repair are separate responsibilities.
4. Repair is localized and bounded.
5. Every repair must be re-validated.
6. Failed repair validation preserves the original output.
7. TQG must not change translation-job checkpoint/recovery semantics.

---

## 4. In Scope

### TQG-01 — Build Test Corpus

Create a labeled corpus for TQG development and regression.

The corpus must contain, at minimum:

- clean translations
- legitimate foreign names
- legitimate foreign terminology
- glossary-approved terms
- source-language residue
- mixed-language contamination
- partial sentence translation
- full source-text copy
- structural truncation
- paragraph loss
- repeated sentences / repeated spans
- prompt or meta-text leakage
- PUA/replacement-character anomalies
- targeted repair cases
- repair failure cases
- re-validation failure cases

The project must distinguish:

```
TRUE POSITIVE
FALSE POSITIVE
AMBIGUOUS / REVIEW
```

Real-world novel-derived samples may be stored privately/local-only.

Only sanitized fixtures suitable for a public repository may be committed.

### TQG-02 — Deterministic Detector

Implement a deterministic, local-only detector with zero AI/API calls that analyzes completed translation output.

Minimum V1 detection categories:

- `FOREIGN_SCRIPT_SPAN`
- `SOURCE_LANGUAGE_RESIDUE`
- `SOURCE_TEXT_OVERLAP`
- `MIXED_LANGUAGE_SPAN`
- `PROMPT_LEAKAGE`
- `REPEATED_TEXT`
- `STRUCTURAL_TRUNCATION`
- `PARAGRAPH_LOSS`
- `QUOTE_ANOMALY`
- `PUA_OR_REPLACEMENT_CHAR`

Detector findings must be deterministic and explainable.

The detector must not call any AI provider and must not require network access.

### TQG-03 — Exception Layer

Foreign text is not automatically an error.

The exception layer must account for legitimate content such as:

- glossary terms
- source-preserved names
- known terminology
- abbreviations
- units
- URLs
- email addresses
- code-like tokens
- other explicitly justified structural tokens

An exception suppresses only the finding it explains. Source overlap is evidence, not by itself a final error verdict.

It must not globally disable TQG checking for the surrounding paragraph or chapter.

### TQG-04 — Suspicion Classification

TQG V1 uses:

- `PASS`
- `REVIEW`
- `HIGH_SUSPICION`

Classification must be explainable from findings.

Numeric 0–100 quality scores are not required for V1.

TQG V1 is a guard, not a general translation-quality score.

### TQG-05 — AI Inspector

The AI Inspector is optional and is invoked only after deterministic analysis produces a suspicious candidate.

Inspector responsibilities:

- inspect the flagged span
- inspect the minimum required surrounding context
- compare against source text when necessary
- consider relevant glossary information
- return `TRUE_ANOMALY`, `FALSE_POSITIVE`, or `UNCERTAIN`
- state whether targeted repair is appropriate
- return structured inspection data
- never rewrite the full chapter as part of inspection

The Inspector must reuse the application's existing AI transport/provider selection.

No new AI provider is introduced by TQG V1.

### TQG-06 — Targeted Repair

Repair is limited to localized, bounded anomalies.

V1 repair targets:

- untranslated foreign-language spans
- localized source-language residue
- localized malformed spans
- other explicitly bounded repair regions

V1 does not reconstruct missing chunks or rewrite whole chapters.

Targeted repair is user-triggered in V1.

### Re-validation requirement (TQG-06 gate)

Every targeted repair must be re-validated.

Re-validation must include, as applicable:

- the original finding is resolved
- no new TQG finding is introduced in the repaired region
- repair boundaries are respected
- text outside the allowed repair region remains unchanged
- relevant glossary/exception rules remain satisfied

If validation fails:

```
Reject repair
Keep original output
```

### TQG-07 — Quality UI

Add a dedicated TQG quality panel.

The UI must expose:

- current TQG status
- finding code/reason
- affected text/span
- relevant evidence
- applicable exception
- AI inspection status/result
- repair availability
- repair status
- re-validation result

TQG UI must be non-destructive.

No automatic whole-chapter rewrite is allowed.

New TQG controls follow the application's SVG/vector icon policy and must not introduce emoji-based controls.

### TQG-08 — Integration

TQG may be integrated at completion boundaries:

- completed single translation
- completed batch item
- completed recovery output

TQG must not run against incomplete checkpoint output.

Integration must preserve existing translation, batch, and recovery behavior when no TQG action is required.

### TQG-09 — Regression

Extend the existing dependency-free regression gate to cover TQG.

Regression must cover:

- deterministic detection
- legitimate foreign-term exceptions
- source overlap
- source-overlap-as-evidence behavior
- glossary behavior
- structural anomalies
- suspicion classification
- AI-result validation
- repair boundaries
- failed-repair preservation
- re-validation
- integration boundaries
- no out-of-scope core modification

### TQG-10 — Final Audit

Final TQG audit must cover:

- false-positive review
- false-negative review
- reliability
- API cost
- latency
- repair safety
- integration safety
- repository hygiene
- documentation

---

## 5. Out of Scope

The following are explicitly excluded from TQG V1:

- translation engine rewrite
- translation algorithm rewrite
- translation prompt rewrite
- translation model replacement
- translation model upgrade
- adding a better model as a TQG dependency
- adding a new AI provider
- full standalone language-identification subsystem
- full standalone NER/entity-recognition subsystem
- full bilingual alignment engine
- full semantic translation evaluation
- general grammar correction
- general style evaluation
- stylistic rewriting
- whole-chapter automatic rewriting
- automatic missing-chunk reconstruction
- translation retry as a quality repair mechanism
- IndexedDB redesign
- storage schema redesign
- Translation Job redesign
- checkpoint redesign
- revision/CAS redesign
- recovery redesign
- batch architecture redesign
- batch retry redesign
- backup/restore redesign
- Reader redesign
- PWA redesign

Unrelated findings must be recorded separately and must not be fixed inside a TQG change unless the scope is explicitly unlocked later.

---

## 6. Protected Existing Logic

The following areas are protected by this scope lock.

### Translation core

- `buildTranslatePrompt()`
- `splitIntoChunks()`
- `callOpenAI()`
- `callGemini()`
- `callAIWithRetry()`
- translation execution flow

### Translation Job / reliability core

- `storage-v2.js`
- `translationJobs` schema
- revision/CAS semantics
- checkpoint semantics
- `partialResults`
- `previousTail`
- recovery state transitions
- batch recovery semantics

### Existing data systems

- backup/restore pipeline
- IndexedDB model
- existing glossary storage semantics
- Reader data model

TQG integration must not modify these systems' semantics.

---

## 7. TQG Core Contract

The implementation should expose a testable analysis boundary equivalent to:

```js
TQG.analyze({
  sourceText,
  targetText,
  glossaryText
})
```

Expected conceptual return shape:

```js
{
  status: "PASS" | "REVIEW" | "HIGH_SUSPICION",
  findings: [
    {
      code: "SOURCE_LANGUAGE_RESIDUE",
      severity: "low" | "medium" | "high",
      text: "...",
      start: 123,
      end: 145,
      evidence: {}
    }
  ]
}
```

The exact JavaScript implementation may evolve during TQG-02, but the semantic contract is locked:

- analysis is deterministic
- findings are structured
- findings are localized where possible
- evidence is explainable
- no API call occurs inside deterministic analysis

---

## 8. AI Inspector Contract

Conceptual input:

```js
{
  sourceContext,
  targetContext,
  suspiciousSpan,
  glossaryContext,
  findings
}
```

Conceptual output:

```js
{
  verdict: "TRUE_ANOMALY" | "FALSE_POSITIVE" | "UNCERTAIN",
  repairable: true | false,
  reason: "...",
  replacementHint: "..."
}
```

The Inspector must not directly mutate application state.

Mutation belongs to the controlled integration/repair layer.

---

## 9. Targeted Repair Contract

Conceptual input:

```js
{
  sourceContext,
  targetContext,
  suspiciousSpan,
  glossaryContext,
  repairInstruction
}
```

The repair operation must produce a bounded replacement or bounded repaired segment.

The integration layer must verify:

```
prefixBeforeRepair is unchanged
suffixAfterRepair is unchanged
```

before accepting the result.

No repair may silently expand its edit region.

---

## 10. Integration Boundary

### Single translation

```
runTranslation()
    |
    v
translation complete
    |
    v
TQG analyze()
```

### Batch item

```
runSingleTranslationForBatch()
    |
    v
batch item complete
    |
    v
TQG analyze()
```

### Recovery

```
recovery completes
    |
    v
final output becomes available
    |
    v
TQG analyze()
```

### Explicitly forbidden

```
checkpoint
    |
    v
TQG
    |
    v
checkpoint
```

TQG must never become part of Translation Job checkpoint/CAS semantics in V1.

---

## 11. Cost / Performance Contract

TQG V1 follows:

```
Deterministic First
        |
        v
AI Only When Needed
        |
        v
Repair Only When Confirmed
```

Expected behavior:

- PASS → no TQG AI call
- deterministic REVIEW → AI inspection is optional/controlled
- HIGH_SUSPICION → AI inspection may be triggered
- repair → separate AI action only after confirmation
- every repair → deterministic re-validation

TQG must not perform an unnecessary AI call for every chapter.

All additional AI token/cost usage caused by TQG must be measurable.

---

## 12. Privacy / Public Repository Boundary

The application repository is public.

Therefore:

- do not commit user backup JSON
- do not commit full private translation history
- do not commit full copyrighted novel chapters as regression data
- do not commit API keys or secrets
- sanitize public regression fixtures
- keep sensitive real-world corpus local/private

TQG documentation must not make absolute privacy claims that cannot be substantiated by the implementation.

---

## 13. Implementation File Boundary

Preferred additions:

```
tqg.js

tests/
  tqg/
    corpus-public.json
    corpus-schema.md
    expected.json

scripts/
  tqg-regression.mjs
```

Minimal integration changes may be made to:

- `index.html`
- `sw.js` only when app-shell inclusion/version handling is required
- existing regression gate only when required to run TQG tests
- README/TQG documentation

No storage/core redesign is authorized by this Phase 0 lock.

---

## 14. Development Sequence

The locked implementation order is:

```
TQG-00  Scope / Contract Lock
   |
   v
TQG-01  Build Test Corpus
   |
   v
TQG-02  Deterministic Detector
   |
   v
TQG-03  Exception Layer
   |
   v
TQG-04  Suspicion Engine
   |
   v
TQG-05  AI Inspector
   |
   v
TQG-06  Targeted Repair
   |
   v
TQG-07  Quality UI
   |
   v
TQG-08  Integration
   |
   v
TQG-09  Regression
   |
   v
TQG-10  Final TQG Audit
```

TQG-01 must be completed before implementing the production detector.

---

## 15. Deep Review / Commit Governance

Every implementation change in TQG follows:

```
Scope Check
    |
    v
Implement
    |
    v
Deep Review 1/3
    |
    v
Deep Review 2/3
    |
    v
Deep Review 3/3
    |
    v
Regression / Validation
    |
    v
Out-of-scope diff check
    |
    v
Commit
```

A commit is blocked when:

- any review round identifies an unresolved scope violation
- protected core behavior is changed without explicit scope unlock
- regression fails
- repair safety invariants are not satisfied
- public test fixtures expose sensitive/private data

---

## 16. Phase 0 Exit Criteria

TQG-00 is complete only when all are true:

- [x] mission defined
- [x] primary target defined
- [x] deterministic-first architecture defined
- [x] in-scope capabilities defined
- [x] out-of-scope capabilities defined
- [x] detection contract defined
- [x] exception boundary defined
- [x] AI Inspector boundary defined
- [x] targeted Repair boundary defined
- [x] re-validation requirement defined
- [x] integration boundaries defined
- [x] protected core logic defined
- [x] public/private corpus boundary defined
- [x] implementation sequence defined
- [x] Deep Review / commit governance defined

---

## 17. Phase 0 Locked Decision

**TQG V1 is approved to proceed to TQG-01.**

The next implementation milestone is:

> **TQG-01 — Build Test Corpus**

No production detector, AI Inspector, repair logic, storage change, translation-engine change, or unrelated refactor is part of Phase 0.

---

## 18. Scope Unlock Rule

Any future request that requires one of the following must stop and create a new explicit scope decision before implementation:

- translation-engine behavior change
- prompt behavior change
- model/provider change
- storage schema change
- Translation Job/recovery/batch semantic change
- whole-chapter repair
- semantic quality evaluation
- new persistent TQG data model

Such changes are not implicitly authorized by TQG V1.
