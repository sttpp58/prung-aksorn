# Translation Job Recovery Stress Test — Stage 5

## Purpose

Validate the existing Translation Job recovery path under repeated browser lifecycle interruption and provider failure.

The test exercises the real application UI in a real Chromium-family browser over a local HTTP origin. The provider is mocked in page context, so no real AI provider API call is made.

## Locked scope

- Real Chromium/CDP browser execution.
- Real Translation Job creation and IndexedDB checkpoint persistence.
- Browser reload while a provider request is in flight after at least one checkpoint.
- Repeated manual recovery from the visible Translation Recovery UI.
- Failed Translation Job rediscovery after reload and user-driven recovery.
- Checkpoint continuity, duplicate prevention, final completion and visible output.
- Runtime exception, console error and unexpected external-network detection.
- Dedicated CI workflow and Regression Gate contract.

## Explicitly out of scope

- Translation prompt, chunking or provider implementation changes.
- TQG detector, Inspector, Repair or semantic-quality changes.
- IndexedDB schema/version redesign.
- Translation Job state-machine redesign.
- Checkpoint/CAS semantic redesign.
- Batch translation redesign.
- Backup/Restore redesign.
- Reader/PWA redesign.
- Large-scale quota exhaustion or storage corruption.
- Cross-device synchronization or cloud recovery.
- Historical Git hygiene/remediation.

## Stress matrix

| Case | Fault / lifecycle boundary | Required evidence |
|---|---|---|
| RS-01 | Repeated browser reload while a checkpointed Job is running | Recovery UI reappears, checkpoint count remains exact, indexes remain contiguous, repeated recovery continues from the next chunk, final completion is persisted |
| RS-02 | Provider permanently fails, then browser reloads | Failed Job remains queryable, visible recovery is user-driven, recovery resumes at the saved checkpoint, final completion is persisted |

## RS-01 details

The scenario creates a multi-chunk single Translation Job with a small test chunk size. The mocked provider alternates successful checkpoint creation with an in-flight stalled request. The browser is reloaded while the request is stalled, then the visible Recovery action is used to continue the Job.

Three consecutive recovery cycles are exercised before final completion. Each cycle verifies that previously checkpointed results are preserved and that the next checkpoint index increments exactly once.

## RS-02 details

The first provider attempt is configured to fail permanently. The resulting failed Translation Job is verified, the browser is reloaded, and the visible Recovery UI is used to resume the failed Job after re-entering the test credential.

The test confirms that failure does not delete the Job or create an uncheckpointed partial result.

## Safety boundary

All credentials used by the stress runner are synthetic test strings. Cross-origin HTTP(S) requests are blocked by the harness and recorded as failures. The test does not install npm dependencies or call an external AI service.

## Pass criteria

The stage is PASS only when every matrix case succeeds and:

1. No uncaught browser runtime exception is observed.
2. No unexpected browser console error is observed.
3. No unexpected external network call is observed.
4. Job checkpoint counts match partialResults.length.
5. Every checkpoint index remains contiguous from zero.
6. Recovery never skips, duplicates or rewrites a previously checkpointed chunk.
7. A completed recovered Job reaches completedChunks equal to totalChunks.
8. The final recovered output is visible through the application UI.

## Local command

    node --check tests/e2e/translation-job-recovery-stress.mjs
    node tests/e2e/translation-job-recovery-stress.mjs

The broader Regression Gate remains required before commit. This document records validation scope; it does not change production recovery semantics.
