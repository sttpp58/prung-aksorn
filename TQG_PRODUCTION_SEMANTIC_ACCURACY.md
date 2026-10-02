# TQG Production Semantic Accuracy — Re-run

**Validator:** `TQG-PRODUCTION-SEMANTIC-01`

**TQG:** `TQG-04-2026-09-30`

**Dataset:** `TQG-C2-real-world-gold`
**Run date:** 2026-10-02

## Scope

This audit re-runs the current deterministic TQG detector against the
production-derived, human-adjudicated C2 dataset.

It measures semantic anomaly-detection effectiveness only. It does not measure
semantic repair accuracy because the private C2 dataset contains no
independently adjudicated repaired target text.

No detector threshold, translation logic, Inspector, Repair, storage,
Translation Job, batch, or Reader/PWA core logic is changed by this audit.

## Dataset Integrity

| Check | Result |
|---|---:|
| C2 cases | 175 |
| RANDOM_CLEAN | 50 |
| RANDOM_MIXED | 50 |
| TQG_FLAGGED | 50 |
| EDGE_CASE | 25 |
| AMBIGUOUS excluded | 1 |
| Private dataset tracked by Git | No |
| Current TQG status parity | 175/175 |
| Current TQG finding-code parity | 175/175 |

Dataset SHA-256:

`6bb13c19b17b00b4d16eec4a4c7cf425cef0cf275569686f3b7d7c0c61974aa5`
## Production Semantic Results

Binary evaluation groups
`TRUE_ANOMALY`, `STRUCTURAL_ERROR`, and `META/PROMPT_LEAK` as positive;
`FALSE_POSITIVE`, `LEGITIMATE_FOREIGN`,
`LEGITIMATE_TECHNICAL`, and `OTHER` as negative.
`AMBIGUOUS` is excluded.

| Metric | Result |
|---|---:|
| Evaluated cases | 174 |
| TP | 97 |
| TN | 53 |
| FP | 24 |
| FN | 0 |
| Accuracy | 86.21% |
| Precision | 80.17% |
| Recall | 100.00% |
| Specificity | 68.83% |
| F1 | 88.99% |

### By Sampling Bucket

| Bucket | Cases | Accuracy | Precision | Recall | Specificity |
|---|---:|---:|---:|---:|---:|
| RANDOM_CLEAN | 50 | 100.00% | N/A | N/A | 100.00% |
| RANDOM_MIXED | 50 | 100.00% | 100.00% | 100.00% | N/A |
| TQG_FLAGGED | 49 | 65.31% | 65.31% | 100.00% | 0.00% |
| EDGE_CASE | 25 | 72.00% | 68.18% | 100.00% | 30.00% |
## Findings

The fresh run reproduced the existing C2 detector measurements exactly:
`97 TP / 53 TN / 24 FP / 0 FN`.

All 175 production-derived cases produced the same TQG status and finding-code
set as the stored C2 snapshot. No detector drift was observed.

The false-positive burden is concentrated in the deliberately selected
`TQG_FLAGGED` and `EDGE_CASE` strata. This is expected to be visible in a
sample designed for gap discovery and must not be interpreted as production
prevalence.

## Review Record

### Deep Review 1 — Scope / Baseline
- Production-derived C2 dataset located and verified.
- Repair-gold target absence confirmed.
- Measurement scope locked to semantic anomaly detection.
- Protected production logic excluded.

**PASS**

### Deep Review 2 — Data / Measurement
- 175-case corpus and locked strata verified.
- Source/target content hashes verified by the runner.
- Current TQG re-execution matches stored status/code snapshot 175/175.
- Binary metrics exclude the single AMBIGUOUS case.

**PASS**

### Deep Review 3 — Implementation
- Runner syntax validated.
- Missing private dataset defaults to DEFERRED.
- Required-private mode fails closed when the dataset is absent.
- Runner performs no AI/network work.

**PASS**

## Full Audit — Review 4
- Only semantic-validation tooling and aggregate evidence are in scope.
- Private dataset remains ignored/untracked.
- No TQG core file is modified.
- Existing TQG regression and repository Regression Gate remain required.
- No semantic repair accuracy claim is made without repaired gold targets.

**PASS**
## Final Status

```
Production C2 semantic detection accuracy   VALIDATED
Cases                                     175
Evaluated (non-ambiguous)                 174
Accuracy                                  86.21%
Precision                                 80.17%
Recall                                   100.00%
Specificity                               68.83%
F1                                        88.99%
Snapshot status parity                    175/175
Snapshot code parity                      175/175
Repair semantic accuracy                  NOT ESTABLISHED
```

The result is a sample-stratified effectiveness measurement from a
single-reviewer C2 annotation set. It is not a production-prevalence estimate
and is not an independent multi-reviewer repair gold-target evaluation.
