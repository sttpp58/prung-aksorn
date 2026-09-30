# TQG C2 — Real-World Gold Label Dataset Report

## Execution result

C2 produced a 175-case gold-label evaluation set from a completed production
snapshot containing 261 completed chapters and 1,452 glossary records.

The full source/target text is private and remains outside the tracked public
repository. The public repository contains only the schema, validator, and
this aggregate report.

## Sampling

| Stratum | Cases | Selection |
|---|---:|---|
| RANDOM_CLEAN | 50 | TQG PASS / no findings |
| RANDOM_MIXED | 50 | mixed-language/foreign-content candidates |
| TQG_FLAGGED | 50 | TQG REVIEW or HIGH_SUSPICION |
| EDGE_CASE | 25 | selected edge/structural/repetition/foreign cases |
| **Total** | **175** | content-deduplicated |

One generic edge control was replaced by a real prompt-leak case to ensure
META/PROMPT_LEAK taxonomy coverage while preserving the 25-case edge stratum.

## Gold-label distribution

| Gold label | Cases |
|---|---:|
| TRUE_ANOMALY | 95 |
| FALSE_POSITIVE | 22 |
| AMBIGUOUS | 1 |
| LEGITIMATE_FOREIGN | 1 |
| LEGITIMATE_TECHNICAL | 1 |
| STRUCTURAL_ERROR | 1 |
| META/PROMPT_LEAK | 1 |
| OTHER | 53 |
| **Total** | **175** |

Notable controls include a source-supported proper-name case classified as
LEGITIMATE_FOREIGN and a measurement-unit case classified as
LEGITIMATE_TECHNICAL. A paragraph-loss case is labeled STRUCTURAL_ERROR and
an assistant-style leakage case is labeled META/PROMPT_LEAK.

## Labeled-set detector comparison

For descriptive binary analysis only:
TRUE_ANOMALY + STRUCTURAL_ERROR + META/PROMPT_LEAK are treated as positive;
FALSE_POSITIVE + LEGITIMATE_FOREIGN + LEGITIMATE_TECHNICAL + OTHER are treated
as negative; AMBIGUOUS is excluded.

The current TQG status prediction is positive for REVIEW or HIGH_SUSPICION.
| Measure | Result |
|---|---:|
| Evaluated cases | 174 |
| Ambiguous excluded | 1 |
| TP | 97 |
| TN | 53 |
| FP | 24 |
| FN | 0 |
| Accuracy | 86.21% |
| Precision | 80.17% |
| Recall | 100.00% |
| Specificity | 68.83% |
| F1 | 88.99% |

**Important:** these are sample-stratified measurements, not estimates of
real-production prevalence. The sampling intentionally includes flagged and
mixed cases, so the metrics are suitable for gap discovery and detector
analysis, not deployment-quality claims.

## C2 gate

- 175/175 labels complete
- all 8 taxonomy labels covered
- 175/175 source-target content hashes verified
- 175/175 content identities unique
- private dataset confirmed untracked by Git
- no TQG detector, translation, storage, job-recovery, or Reader/PWA core logic
  changed by C2
