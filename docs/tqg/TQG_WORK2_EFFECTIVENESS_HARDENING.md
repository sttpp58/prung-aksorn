# TQG WORK 2 — Evidence-Based Effectiveness Hardening

**Status:** IMPLEMENTED — C2-VALIDATED
**Scope:** Unicode-safe repeated-text detection hardening
**Core logic:** CHANGE AUTHORIZED BY WORK 2 EVIDENCE ONLY

## 1. Root cause

The C2 production-derived corpus exposed a repeat-detection defect in
word tokenization.

The previous word token pattern included Unicode letters and numbers but
excluded combining marks. Thai combining marks can therefore split a visible
Thai lexical unit during tokenization.

This produced repeated spans that ended in the middle of Thai orthography,
and several legitimate rhetorical repetitions were classified as
REPEATED_TEXT.

## 2. Locked change

The token pattern now includes Unicode combining marks:

    L + M + N

The change is limited to the tokenization boundary used by REPEATED_TEXT.

No finding code was added or renamed.

No severity/classification contract was changed.

## 3. Narrow intra-token recovery

After Unicode-safe tokenization, a genuine anomaly in C2 was found where a
duplicated Thai lexical unit occurred inside a larger token.

The hardening therefore adds a deliberately narrow secondary check:

    exact X+X inside one Thai token
    repeated unit >= 6 code points
    repeated unit starts with a Thai letter
    repeated unit contains >= 3 distinct Thai letters

This excludes short sound-effect / reduplication patterns such as:
    ฮ่าฮ่าฮ่าฮ่า

The secondary check still emits the existing REPEATED_TEXT finding code.

## 4. Evidence boundary

The production-derived C2 dataset remains private and gitignored.

The pre-change C2 baseline was:

    TP 97
    TN 53
    FP 24
    FN 0

The post-change C2 run is:

    TP 97
    TN 59
    FP 18
    FN 0

Metrics:

    Accuracy     89.66%
    Precision    84.35%
    Recall       100.00%
    Specificity  76.62%
    F1           91.51%

The evaluated population is 174 cases after excluding one AMBIGUOUS case.

## 5. Delta audit

There are 12 C2 finding-set deltas.

All real code-set changes are isolated to REPEATED_TEXT.

Six false-positive cases lose REPEATED_TEXT entirely:

    C2-101
    C2-111
    C2-122
    C2-138
    C2-159
    C2-163

Two true-anomaly cases gain additional REPEATED_TEXT evidence:

    C2-115
    C2-136

C2-116 retains its existing REPEATED_TEXT evidence under the corrected
Unicode tokenization plus the narrow intra-token guard.

No non-REPEATED_TEXT finding semantics changed in the C2 delta audit.

## 6. Public regression coverage

The WORK 2 regression verifies:

- rhetorical repetition with Thai combining marks is not falsely flagged;
- a bounded intra-token Thai duplicate remains detectable;
- short single-letter sound repetition is excluded;
- finding spans remain structured;
- private C2 validation safely defers in public environments;
- required private validation fails closed when evidence is missing.

## 7. Non-goals

WORK 2 does not:

- change translation engine behavior;
- change translation prompts;
- change AI model/provider selection;
- change Inspector rules;
- change Repair boundaries;
- change storage schema;
- change Translation Job/CAS/checkpoint semantics;
- change batch/recovery semantics;
- change observability schema;
- add new finding codes;
- tune unrelated detector thresholds.

## 8. Exit criteria

    C2 accuracy non-decreasing             PASS
    C2 precision non-decreasing            PASS
    C2 recall non-decreasing               PASS
    C2 specificity non-decreasing          PASS
    C2 F1 non-decreasing                   PASS
    false positives reduced                PASS
    false negatives remain zero            PASS
    non-repeat detector deltas             ZERO
    public regression                      PASS
    core scope audit                       PASS

## 9. Governance

WORK 2 used:

    Deep Review 1/3 — scope/baseline/root-cause
    Deep Review 2/3 — C2 evidence/adversarial trade-off
    Deep Review 3/3 — implementation and regression

The implementation is not considered complete until Full Audit Round 4
passes, including protected-core integrity and repository Regression Gate.
