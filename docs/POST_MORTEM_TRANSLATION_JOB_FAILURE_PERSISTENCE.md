# Post-Mortem: Single Translation Job Failure Persistence Boundary

**Date:** 2026-10-07  
**Component:** `app/12-translation-core.js`  
**Severity:** High — same-session recovery was unavailable and the browser emitted an uncaught runtime exception, but no evidence of permanent Translation Job data loss was found.  
**Status:** Resolved and merged to `main`  
**Fix commit:** `ff0d01fd1b9e3de48d9c2e1676b02be3318704d9`  
**Merge commit:** `244f1ac308de2332ba1924c49159984d3abc982b`  
**Pull request:** #40

## Summary

Single Translation handled a provider failure by persisting the Translation Job as `failed`. If that terminal-state persistence operation itself failed, the failure escaped the translation error handler. The current session therefore did not expose the normal recovery controls and the browser reported an uncaught runtime exception.

The Translation Job data was not shown to be permanently lost. After reload, the same Job could still be discovered by the recovery scanner because its durable state remained `running`.

The fix adds a second-level failure boundary around `failTranslationJob()`, preserves the existing in-memory recovery context, releases the translation UI state, and surfaces an explicit warning when durable failure-state persistence fails.

## Symptom

Under deterministic fault injection:

- Provider retries were exhausted after 3 attempts.
- `failTranslationJob()` was forced to reject.
- The Translation Job remained `running`.
- `completedChunks` remained intact.
- Same-session `pendingResume` / recovery UI was not established by the old code.
- The browser emitted an uncaught runtime exception from `runTranslation()`.
- Reloading the application rediscovered the same Job and showed the recovery UI.

There was no evidence that the stored Job or checkpoint data was destroyed.

## Root cause

In `app/12-translation-core.js`, the non-abort translation error path awaited `PrungAksornStorageV2.failTranslationJob(...)` without a nested error boundary.

The code therefore assumed that terminal failure persistence would succeed. When that assumption was false, execution stopped before:

- `activeTranslationJobId` was cleared;
- `pendingResume` was populated;
- the user-facing error was rendered;
- the resume button was shown;
- recovery UI was refreshed.

## Mechanism

Old path:

```
provider failure
  -> retry budget exhausted
  -> runTranslation() catch(err)
  -> failTranslationJob()
  -> persistence rejects
  -> outer catch exits unexpectedly
  -> click handler observes rejected async operation
  -> uncaught browser exception
```

Corrected path:

```
provider failure
  -> retry budget exhausted
  -> runTranslation() catch(err)
  -> try failTranslationJob()
       -> success: update revision
       -> failure: capture persistence error + warn
  -> clear active job reference
  -> preserve pendingResume in current context
  -> show recoverable error
  -> show resume control
  -> refresh recovery UI
  -> finally release AI/UI locks
```

## Fix

The fix is intentionally limited to `app/12-translation-core.js`.

Changes:

1. Wrap `failTranslationJob()` in a nested `try/catch`.
2. Preserve the original Translation Job revision when persistence fails.
3. Keep the existing `pendingResume` construction and recovery flow.
4. Add an explicit user-facing warning that durable Job-state persistence failed.
5. Log the persistence failure through `console.warn` rather than allowing an uncaught rejection.

No translation algorithm, retry policy, IndexedDB schema, or Translation Job state-machine semantics were changed.

## Detection

The issue was identified during a post-merge `/scrutinize` audit and then reproduced using the `/debug-mantra` workflow.

The deterministic reproduction used:

- permanent provider failure;
- 3 provider attempts;
- injected rejection from `failTranslationJob()`;
- browser runtime-error collection;
- direct inspection of Translation Job state;
- reload-based recovery verification.

The initial hypothesis of permanent recovery loss was disproved by reload: the Job remained discoverable as `running`.

## Why it slipped

The normal provider-failure path was covered by existing Failure Injection tests, including:

- retry recovery;
- permanent provider failure;
- cancellation;
- transient autosave failure.

Those tests did not inject a failure into the terminal Translation Job state write itself. The missing second-order failure test allowed the unsafe assumption that `failTranslationJob()` could not fail to escape detection.

## Validation

Validation completed before merge:

- `node --check app/12-translation-core.js` — PASS
- `git diff --check` — PASS
- TQG regression — PASS
- Repository Regression Gate — PASS
- Failure Injection FI-01..FI-04 — PASS
- Deterministic FI-05 persistence-boundary scenario — PASS
- Browser E2E / Real User Scenario — PASS
- GitHub TQG Production Assurance — SUCCESS
- GitHub Regression Gate — SUCCESS
- GitHub Browser E2E — SUCCESS
- GitHub Failure Injection — SUCCESS
- GitHub Backup/Restore Real-world Validation — SUCCESS
- GitHub Translation Job Recovery Stress Test — SUCCESS
- GitHub TQG Semantic / Gold-target Validation — SUCCESS
- GitHub Final Audit / Release Gate — SUCCESS

Post-merge verification confirmed:

- `origin/main` = `244f1ac308de2332ba1924c49159984d3abc982b`
- the merge contains only the intended `app/12-translation-core.js` change for this fix;
- local `main` is synchronized with `origin/main`.

## Actions

### Completed

- [x] Add a nested failure boundary around Single Translation `failTranslationJob()`.
- [x] Preserve in-memory resume state when durable failure-state persistence fails.
- [x] Surface an explicit durable-state warning.
- [x] Validate the edge case with deterministic failure injection.
- [x] Run full regression and browser validation.
- [x] Merge the fix into `main`.

### Follow-up

- [x] Promote the FI-05 failure-persistence scenario from temporary debug harness to the permanent Failure Injection regression suite.

The permanent FI-05 test verifies at minimum:

- no uncaught runtime exception;
- recovery control remains available in the same session;
- Job/checkpoint identity, partial results, source snapshot, and retry metadata remain intact;
- the user receives the durable-state warning;
- no additional provider request is sent during cancellation; FI-01 separately verifies the normal retry budget.

## Final assessment

The defect was an error-boundary failure in the Single Translation terminal-error path, not a Translation Job schema or state-machine defect.

The remediation is narrow, preserves existing core semantics, and has passed the repository's local and GitHub release gates. The remaining evidence gap is independently reviewed real-world semantic repair gold; FI-05 persistence-failure coverage is now permanent.
