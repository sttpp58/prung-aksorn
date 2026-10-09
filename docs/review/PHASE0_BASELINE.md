# Phase 0 โ€” Baseline and Evidence Record

**Captured:** 2026-10-09 (Asia/Bangkok)
**Repository:** `sttpp58/prung-aksorn`
**Base main SHA:** `2e31ee46ffb86d47a03db863afad2f1d152776ec`
**Implementation branch:** `fix-then-ship/roadmap-implementation`
**Roadmap baseline commit:** `0e8e62a7aa4308489649c33d6d0b7ff5a857328a`
**Local environment:** Windows; Node.js v24.20.0; npm 11.19.0; Chrome 154.0.8037.98.
**Credential boundary:** all browser translation fixtures use mocked providers and test-only credentials; no real API key/provider call is required.

## Starting tree and branch verification

- Implementation worktree was created clean from the remote branch after pushing the roadmap baseline.
- The baseline commit is a documentation-only scope/acceptance lock; no application runtime code was changed by that commit.
- The earlier source audit was performed against the same `main` SHA. No application/core files had changed in the baseline PR merges identified by that audit.
- This branch is the only integration line for Fix-Then-Ship. Do not merge to `main` until the Phase 9 gate passes and the user explicitly authorizes merge.

## Baseline commands and outcomes observed on this worktree

| Command | Result | Evidence boundary |
|---|---|---|
| `node scripts/regression-gate.mjs` | PASS, exit code 0, about 17.1 seconds | Repository regression gate on implementation branch before runtime changes |
| `node tests/e2e/browser-real-user-scenario.mjs` | PASS, exit code 0, about 9.3 seconds | Real Chromium with mocked provider; UI, IndexedDB/reload, book isolation, mobile recovery dismiss, no unexpected external calls |
| `node tests/e2e/failure-injection.mjs` | PASS, exit code 0, about 18.5 seconds | Pre-change failure-injection matrix (FI-01 through FI-06); used test-only credential and mocked/faulted calls |
| `node tests/tqg/tqg-d5-performance-regression.mjs` | PASS | Baseline D5 is included in the repository Regression Gate; the standalone post-change paired-trial output is recorded in the implementation history |
| `node --version` | `v24.20.0` | Local Windows runtime |
| Chrome file version | `154.0.8037.98` | Local E2E browser |

An earlier pre-change audit also ran D5 50 times on this Windows Node environment with 50/50 passing. After the paired-trial/statistical change, the new D5 gate was run 50 additional times and passed 50/50 (132.5 seconds total). Both are local-only evidence; neither establishes Linux/GitHub Actions stability. The current CI historical flake rate was not independently established and must not be stated as zero. FI-04 failed once while multiple browser suites overlapped, then passed in the latest isolated full FI matrix (including FI-14). This is evidence of timing sensitivity, but the exact cause is unproven; keep the assertion and require the PR CI result.

## Confirmed risks retained in the plan

- OpenAI finish reason `length` was ignored; Gemini `MAX_TOKENS` warned but returned the partial text to callers.
- D5 used 15 trials and nearest-rank indexing that made p95/p99 both select the maximum sample; its old overhead calculation subtracted independent summary percentiles rather than pairing individual trials.
- Existing oversized-paragraph chunking can hard-slice Thai text when sentence boundaries are insufficient.
- Recovery reconstructed chunks and compared count only; equal counts did not establish equal chunk content/order.
- AI-assisted glossary correction checked context/snapshot but silently replaced output without an edit-magnitude confirmation or undo.
- Service-worker mixed-version concern was not reproduced at baseline and remains conditional on a controlled browser fixture.
- Dynamic HTML sinks and Thai substring glossary matching require contextual/corpus-based review; static grep alone is not proof of safety or semantic correctness.

## Required follow-up

1. Run the D5 normal benchmark repeatedly after the methodology change and preserve raw output/exit codes.
2. Run the entire regression gate after each implementation unit, plus relevant E2E/failure-injection and backup/recovery suites.
3. Capture CI run history and verify actual repository rules/required checks before the final release decision if access is available.
4. Keep limitations explicit where runtime or service access prevents verification.

## Review log

- Phase 0 evidence record: completed.
- Deep Review rounds and Full Audit for each implementation unit: record with the relevant commit and final audit report.
- No merge authorization is implied by a passing test result.


## Fix-Then-Ship implementation evidence (same implementation branch)

| Command | Result | Evidence boundary |
|---|---|---|
| node tests/tqg/tqg-d5-performance-regression.mjs | PASS, 50/50 consecutive post-change runs; 132.5 seconds total | Windows Node v24.20.0, synthetic benchmark; not CI/Linux evidence |
| node tests/fix-then-ship-contract.mjs | PASS, 35 assertions in the latest contract suite | V1 wrapper, V2 Thai/no-space/sentence/whitespace/paragraph/emoji boundaries, deterministic SHA-256 metadata, same-count/reordered/modified chunk rejection, legacy handling, edit magnitude thresholds |
| node tests/e2e/browser-real-user-scenario.mjs | PASS, about 12 seconds | Real Chromium; mocked provider; SW release A/B, no-version-bump cache consistency, versioned release consistency and offline cached asset checks |
| node tests/e2e/failure-injection.mjs | PASS, final isolated serial matrix including FI-14; 30.43 seconds | OpenAI/Gemini truncation, repeat/second-half truncation, same-session digest mismatch before provider call, glossary confirmation/Undo/stale output, cancellation and autosave. One overlapping-browser run failed FI-04; the isolated serial rerun passed. Root cause of that timing-sensitive failure is not proven. |
| node tests/e2e/translation-job-recovery-stress.mjs | PASS | Repeated browser restart; verifies chunkerVersion/chunkLengths/chunkDigest persistence through checkpoints/reloads |
| node tests/e2e/backup-restore-real-world.mjs | PASS, about 14.18 seconds | Real Backup V2 export/restore with chunkerVersion/chunkLengths/chunkDigest checked in exported JSON and restored IndexedDB; test-only provider mocks, not user-specific real backup data |
| node scripts/regression-gate.mjs | PASS, final run 15.89 seconds | Final working-tree gate includes Service Worker cache checks, same-session digest validation static assertion, TQG/C5, model catalog and chunker/integrity contract |

GitHub Actions history: the GitHub status and commit-workflow-run queries for baseline SHA 2e31ee46ffb86d47a03db863afad2f1d152776ec returned no status entries and no associated workflow runs. This means the historical CI signal is unavailable from those queries, not that CI is clean or has never failed. The implementation branch has not yet received a commit containing these working-tree changes, so branch CI cannot assess this diff until it is committed and pushed.
