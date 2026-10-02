# TQG WORK 3 — Production Assurance

**Status:** IMPLEMENTED — BROWSER-VALIDATED
**Scope:** Real-browser production assurance for the TQG completion boundary
**Core-logic policy:** TQG boundary hardening only; no translation/storage semantic redesign

## 1. Objective

WORK 3 closes the gap between dependency-free TQG integration tests and
real browser execution.

The gate verifies that a completed translation reaches the TQG quality UI
after the final output is rendered, that incomplete output is not analyzed,
and that a deterministic TQG failure cannot erase a completed translation.

No real AI provider is contacted by this test.

## 2. Production defect found

The normal single-translation path previously called TQG immediately after
completeTranslationJob(), before the final setOutput(translationOutput).

setOutput() resets the TQG quality panel. The resulting order therefore
executed deterministic TQG analysis and then immediately discarded its UI
state.

This was reproduced in a real Chromium browser.

## 3. Minimal correction

The normal runTranslation() path now:

1. completes the Translation Job;
2. commits the completed translation history;
3. renders the final translation output;
4. invokes analyzeTQGCompletedOutput().

The correction changes only the TQG completion-boundary ordering.

It does not change translation prompts, provider selection, chunking,
checkpoint/CAS behavior, job state semantics, storage schema, Inspector,
Repair, or batch/recovery semantics.

## 4. Browser assurance matrix

| Case | Assertion |
| --- | --- |
| TQG-PRD-01 | Browser loads TQG runtime modules |
| TQG-PRD-02 | Completed clean output reaches TQG PASS |
| TQG-PRD-03 | TQG panel remains collapsed/non-destructive |
| TQG-PRD-04 | Deterministic PASS adds zero provider/AI calls |
| TQG-PRD-05 | In-flight translation exposes no TQG result |
| TQG-PRD-06 | Source-copy anomaly reaches HIGH_SUSPICION |
| TQG-PRD-07 | SOURCE_LANGUAGE_RESIDUE is visible in the UI |
| TQG-PRD-08 | Browser deterministic TQG performance stays within assurance ceilings |
| TQG-PRD-09 | Injected TQG analyzer failure does not erase completed output |
| TQG-PRD-10 | TQG failure does not surface as an application error |
| TQG-PRD-11 | No unexpected external calls occur |
| TQG-PRD-12 | No uncaught browser/runtime errors occur |

## 5. Browser test architecture

The runner is dependency-free and uses:

- a temporary local HTTP origin;
- a clean Chromium-family profile;
- Chrome DevTools Protocol;
- deterministic in-page provider mocking;
- external-network blocking/recording;
- browser runtime-error capture.

No real API credential is used.

## 6. Performance assurance boundary

The browser test performs 200 direct deterministic TQG.analyze() calls.

The assurance ceilings are:

    p95 < 20 ms per analysis
    p99 < 40 ms per analysis

These are operational browser ceilings, not a replacement for the dedicated
D5 performance benchmark. D5 remains the authoritative performance and
regression measurement.

The deterministic path must continue to report:

    aiCalls = 0
    networkAccess = false

## 7. Completion-boundary rule

The intended runtime order is:

    Translation provider
          |
          v
    checkpoint(s)
          |
          v
    completeTranslationJob()
          |
          v
    final output render
          |
          v
    TQG deterministic analysis

The forbidden pattern remains:

    checkpoint
       |
       v
      TQG
       |
       v
    checkpoint

TQG remains outside Translation Job checkpoint/CAS semantics.

## 8. Regression protection

tests/tqg/tqg08-integration-regression.mjs now explicitly asserts that
runTranslation() invokes TQG only after the final
setOutput(translationOutput) call.

This protects the exact production defect discovered by the browser test.

The existing static checks for batch/recovery completion boundaries remain
in force.

## 9. CI

The browser assurance workflow is:

    .github/workflows/tqg-production-assurance.yml

It runs on pull requests and pushes to main, uses pinned GitHub Actions,
installs Chromium only when required, and runs:

    node tests/e2e/tqg-production-assurance.mjs

The workflow does not inject secrets or contact a production provider.

## 10. Protected scope

WORK 3 does not modify:

- translation algorithm or prompts;
- AI model/provider selection;
- storage-v2.js semantics;
- IndexedDB schema;
- Translation Job state machine;
- revision/CAS/checkpoint semantics;
- recovery or batch semantics;
- TQG detector semantics beyond the already-locked WORK 2 result;
- TQG Inspector/Repair semantics;
- Reader/PWA architecture.

## 11. Evidence

The real-browser assurance run passed all browser cases.

Observed browser benchmark on the Work 3 run:

    p50: 0.00 ms
    p95: 0.20 ms
    p99: 0.40 ms
    max: 0.60 ms

Observed scenario results:

    clean output -> TQG PASS
    in-flight output -> TQG not exposed
    source-copy output -> HIGH_SUSPICION
    analyzer failure -> translation preserved
    unexpected external calls -> 0
    uncaught browser/runtime errors -> 0

The exact benchmark values are environment-dependent; the recorded run is
evidence for this browser session, not a universal hardware guarantee.

## 12. Governance

WORK 3 followed the repository rule:

    Deep Review 1/3
      scope / root cause / evidence boundary

    Deep Review 2/3
      browser reproduction / harness isolation / minimal fix

    Deep Review 3/3
      implementation / regression / protected-core review

    Full Audit Round 4
      final diff, regression, E2E, repository hygiene, protected-core integrity

Commit is blocked unless all required gates pass.

## 13. Exit criteria

    Browser E2E TQG assurance                 PASS
    Completion-boundary regression            PASS
    Deterministic zero-AI/no-network         PASS
    Suspicious UI evidence                   PASS
    TQG failure isolation                    PASS
    Browser performance ceiling              PASS
    Existing E2E / failure / recovery gates  PASS
    Scope / protected-core audit             PASS
    Repository hygiene                       PASS

## 14. Limitation preserved

WORK 3 does not establish real-world semantic repair accuracy.

The independent real-world gold repaired-target dataset remains
NOT ESTABLISHED / DEFERRED under WORK 1.

No synthetic browser result is promoted into a semantic repair-accuracy claim.
