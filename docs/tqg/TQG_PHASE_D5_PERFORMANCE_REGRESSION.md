# TQG Phase D5 — Performance + Regression

**Phase:** D5
**Contract:** `TQG-OBS-01`
**Status:** PASS — D5 Gate
**Repository:** `sttpp58/prung-aksorn`
**Baseline:** `8e29365` — Phase D4 Telemetry Isolation

## 1. Purpose

D5 validates that the completed D2–D4 observability layer does not introduce
an unacceptable runtime cost and that the full TQG regression chain remains
green.

The performance measurement is deliberately outside TQG decision logic.
No detector, classifier, Inspector, Repair, translation, storage, or recovery
algorithm is tuned or replaced by D5.

## 2. Locked D5 Scope

D5 covers:

- deterministic TQG performance baseline
- TQG Integration overhead with the default in-memory observer
- TQG Integration overhead with a minimal injected observer
- p50 / p95 / p99 / average / max workload measurements
- C1 deterministic-equivalence verification
- full TQG regression integration
- repository Regression Gate
- protected-core diff verification

D5 does not authorize:
- detector threshold changes
- TQG configuration changes
- translation-prompt changes
- model/provider changes
- AI retry changes
- storage or IndexedDB changes
- Translation Job/checkpoint changes
- batch/recovery changes
- persistent telemetry
- remote analytics
- application-shell changes

## 3. Benchmark Method

The benchmark uses the locked public corpus:

```
120 cases
8 repetitions per trial
15 measured trials
3 warm-up trials per execution
960 TQG analyses per measured trial
```

Each trial measures three equivalent workloads:

```
1. direct              = TQG.analyze()
2. integrated-default  = Integration.analyzeCompletedOutput()
                            with the default in-memory observer
3. integrated-custom   = Integration.analyzeCompletedOutput()
                            with a minimal injected no-op observer
```

Inputs are preconstructed outside the timed loop so object creation does not
artificially inflate the integration measurement.

Trial order rotates between workloads to reduce fixed ordering effects.

Relative percentage overhead is not the primary D5 gate because the direct
TQG baseline is only a few tens of microseconds per operation. Small absolute
measurement changes therefore produce unstable percentages.

The gate uses added milliseconds per TQG operation.
## 4. D5 Performance Gate

The locked acceptance envelope is:

| Metric | Maximum added overhead | Gate/report use |
|---|---:|---|
| Average paired-trial delta | 0.050 ms / operation | Hard gate |
| p50 paired-trial delta | 0.050 ms / operation | Hard gate |
| p95 / p99 paired-trial deltas | Descriptive | Report only with 15 measured trials |

Overhead is calculated from paired per-trial deltas (integrated workload minus
direct workload within the same trial), not by subtracting independently
summarized percentile values. Quantiles use linear interpolation over sorted
samples. With only 15 measured trials, p95/p99 remain descriptive because their
tail estimates are not sufficiently stable to act as separate hard gates.

Negative average or p50 paired deltas are treated as zero added overhead for
the pass/fail decision. Signed deltas remain visible in the report.

The threshold is an engineering ceiling for telemetry overhead, not a claim
about total application latency.

## 5. Observed Baseline Evidence

Three independent benchmark executions were performed on the same development
machine using the same 120-case corpus.

Observed default-observer overhead:

```
Run 1
average: 0.0134 ms/op
p95:     0.0134 ms/op
p99:     0.0134 ms/op

Run 2
average: 0.0134 ms/op
p95:     0.0134 ms/op
p99:     0.0134 ms/op

Run 3
average: 0.0171 ms/op
p95:     0.0454 ms/op
p99:     0.0454 ms/op
```

Observed custom-observer overhead:

```
Run 1
average: 0.0140 ms/op
p95:     0.0143 ms/op
p99:     0.0143 ms/op

Run 2
average: 0.0135 ms/op
p95:     0.0112 ms/op
p99:     0.0112 ms/op
Run 3
average: 0.0142 ms/op
p95:     0.0201 ms/op
p99:     0.0201 ms/op
```

The highest observed default-observer p95/p99 was 0.0454 ms/op, below the
0.050 / 0.075 ms D5 limits.

A final verification run after the benchmark hardening changes measured:

```text
default observer
average: 0.0122 ms/op
p95:     0.0137 ms/op
p99:     0.0137 ms/op

custom observer
average: 0.0121 ms/op
p95:     0.0101 ms/op
p99:     0.0101 ms/op
```

These measurements are execution evidence, not a statistically significant
production-latency study.

## 6. Regression Coverage

The D5 test also verifies:

- the locked 120-case C1 digest remains unchanged
- benchmark workloads remain operational
- expected telemetry event cardinality remains stable
- D5 itself is registered in `scripts/tqg-regression.mjs`

The complete regression sequence therefore includes:

```
TQG-03
TQG-04
TQG-05
TQG-06
TQG-07
TQG-08
D2 Observability
D3 Privacy / Cost Guard
D4 Telemetry Isolation
D5 Performance / Regression
C1 Equivalence
```

The repository Regression Gate remains the final cross-system validation.
## 7. Scope / Core Preservation

D5 changes only:

```
tests/tqg/tqg-d5-performance-regression.mjs
scripts/tqg-regression.mjs
TQG_PHASE_D5_PERFORMANCE_REGRESSION.md
```

Protected files remain unchanged:

```
tqg.js
tqg-inspector.js
tqg-repair.js
tqg-ui.js
storage-v2.js
index.html
sw.js
TQG_PHASE_D_OBSERVABILITY_CONTRACT.md
TQG_PHASE_D3_PRIVACY_COST_GUARD.md
TQG_PHASE_D4_TELEMETRY_ISOLATION.md
```

The D5 benchmark does not invoke real AI providers or network transport.

## 8. Deep Review Record

### Review 1 — Performance Correctness / Regression

Checks:

- benchmark methodology is paired and repeatable
- C1 deterministic digest preserved
- D2/D3/D4 regression tests remain passing
- performance gate uses absolute added latency
- benchmark does not mutate TQG behavior

Result:

```
PASS
```
### Review 2 — Adversarial Performance / Scope

Checks:

- no benchmark-only mutation leaks into production code
- no real network/AI call is introduced
- no storage or Translation Job coupling appears
- no detector/configuration threshold is changed
- benchmark input allocation is outside measured loops
- negative timing noise is not treated as a regression
- protected core remains unchanged

Result:

```
PASS
```

### Review 3 — Final Release Integrity

Checks:

- staged diff contains only D5-authorized paths
- `git diff --check` is clean
- full TQG regression passes
- repository Regression Gate passes
- D1/D3/D4 documents remain unchanged
- private C2 corpus remains untracked/ignored
- main remains free of unrelated changes

Result:

```
PASS
```

## 9. Exit Criteria

- [x] deterministic C1 equivalence preserved
- [x] performance methodology is reproducible
- [x] default observer overhead is within gate
- [x] custom observer overhead is within gate
- [x] D2 regression passes
- [x] D3 regression passes
- [x] D4 regression passes
- [x] D5 regression passes
- [x] full TQG regression passes
- [x] repository Regression Gate passes
- [x] protected core remains unchanged
- [x] no new AI/network/storage path
- [x] Deep Review 1/3 passed
- [x] Deep Review 2/3 passed
- [x] Deep Review 3/3 passed

## 10. Final Decision

```
D5 Performance Gate            PASS
D5 Regression                  PASS
C1 Equivalence Preservation   PASS
D1/D2/D3/D4 Preservation      PASS
Core Preservation             PASS
Scope Compliance              PASS
Repository Regression Gate    PASS
```

D5 is complete at the implementation and repository-gate level.

Phase D can now be considered **closed for the locked D1–D5 scope**.

No production telemetry backend, new persistence layer, new AI provider, or
semantic-quality expansion is implied by this closure.

## 11. Locked Principle

> Observability overhead must remain bounded, measurable, and downstream of
> the system it observes. Performance instrumentation must never require a
> change to the TQG decision itself.


## Appendix A — Fix-Then-Ship measurement hardening (2026-10-09)

The implementation branch `fix-then-ship/roadmap-implementation` updates the
measurement method without changing any TQG detection, classification, repair,
or telemetry semantics.

Changes:
- percentile calculation uses linear interpolation and has explicit odd/even and tail-boundary tests;
- direct and integrated runs are compared by paired trial deltas;
- average and p50 paired overhead remain the hard performance limits;
- p95/p99 remain in the report but are not independent gates at a 15-trial sample size;
- a deterministic injected-above-threshold test rejects 10/10 synthetic regressed measurements (minimum acceptance is 9/10);
- the locked C1 digest and telemetry cardinality assertions remain unchanged.

Observed post-change standalone run on Windows Node v24.20.0:
- 15 measured paired trials; 960 analyses per trial; 120-case public corpus;
- default observer average paired overhead: approximately 0.01376 ms/operation;
- default observer p50 paired overhead: approximately 0.01296 ms/operation;
- custom observer average paired overhead: approximately 0.01297 ms/operation;
- custom observer p50 paired overhead: approximately 0.01321 ms/operation;
- D5 PASS.
- Post-change D5 standalone gate passed 50/50 consecutive runs on Windows Node v24.20.0 (132.5 seconds total); Linux/GitHub Actions history remains unverified.

This is local benchmark evidence only. It is not a claim about production end-to-end latency or CI stability. Repeated post-change execution and available CI checks remain release gates.
