# Fix-Then-Ship Roadmap V1.0 — Implementation Baseline

**Repository:** `sttpp58/prung-aksorn`  
**Baseline branch:** `main`  
**Baseline commit at branch creation:** `2e31ee46ffb86d47a03db863afad2f1d152776ec`  
**Implementation branch:** `fix-then-ship/roadmap-implementation`  
**Policy:** All implementation and verification stays on this branch. Do not merge to `main` until every mandatory gate in Phase 9 passes and a human explicitly authorizes merge.

## 1. Goal and scope lock

Close the confirmed reliability and data-integrity risks identified in the Fix-Then-Ship audit while preserving existing translation behavior outside the explicitly approved scope. This roadmap is an execution baseline, not evidence that any phase has already been implemented or passed.

### In scope
- D-01/D-06: prevent provider-truncated output from being checkpointed as successful; align provider warning/recovery guidance.
- D-02: make the TQG D5 performance regression gate statistically defensible and resistant to environmental noise while retaining regression sensitivity.
- D-03: introduce a versioned safer chunking path for new translation jobs and preserve legacy chunker behavior for existing jobs.
- D-04: verify recovery/retry chunk identity, not only chunk count.
- D-05: constrain AI glossary edits, detect unexpectedly large changes, and offer exact undo.
- D-07: investigate service-worker mixed-version behavior with a reproducible browser test; change service-worker code only if reproduced.
- D-08/D-11: read-only security-context and Thai glossary matching audit before any scoped, test-backed changes.
- Documentation, regression coverage, evidence, and release-candidate gate.

### Explicitly out of scope
- Rewriting or upgrading the translation engine/provider strategy.
- General prompt rewrites, general grammar correction, or semantic translation-quality redesign.
- IndexedDB schema/version changes or translation-job state-machine redesign unless evidence proves they are necessary and the scope is separately reviewed.
- TQG detection/inspection/repair semantic changes unrelated to a confirmed finding.
- Unrelated UI features, model catalog work, broad reader/batch redesign, or cleanup-only refactors.
- Committing private user backups, credentials, API keys, personal data, or private C2 corpus artifacts.
- Merging to `main` as part of this implementation task.

## 2. Baseline audit findings

| ID | Finding | Evidence status at baseline | Required disposition |
|---|---|---|---|
| D-01 | Provider truncation can still be returned/accepted as translation output | Confirmed; OpenAI ignores `finish_reason`; Gemini warns on `MAX_TOKENS` but still returns text | Prevent truncation from being checkpointed as success |
| D-02 | D5 percentile gate is statistically weak with 15 trials | Methodology defect confirmed; actual CI flake rate not yet established | Capture baseline and improve paired measurements; prove regression sensitivity |
| D-03 | Oversized Thai paragraphs can be hard-sliced mid-word | Confirmed | Add opt-in/versioned V2 chunker without silently changing old jobs |
| D-04 | Recovery verifies chunk count but not exact chunk sequence/content | Confirmed | Persist/verify digest metadata for new jobs; preserve explicit legacy behavior |
| D-05 | AI glossary correction can replace output without a magnitude guard/undo | Confirmed | Bounded diff, large-change confirmation, exact undo, stale-context guard |
| D-06 | Truncation guidance does not reliably match the stored resume chunk size; OpenAI path lacks equivalent warning | Confirmed | Align user guidance and fail-safe truncation behavior |
| D-07 | Service-worker mixed-version behavior may be possible | Not reproduced | Reproduce with controlled browser fixture; fix only if evidence demonstrates failure |
| D-08 | Dynamic HTML/XSS contexts need manual contextual review | Partially assessed; static search is not proof of absence | Read-only audit first; make changes only for demonstrated unsafe sinks |
| D-09 | CSP/library integrity contract | Existing CSP and integrity map found; font CSS without SRI is known limitation | Record evidence and limitations; avoid unsupported security claims |
| D-10 | CI workflow permissions/action pinning | Audited workflows used SHA-pinned actions and read-only permissions at baseline | Recheck final diff/workflows; do not weaken permissions |
| D-11 | Thai glossary matching uses `indexOf` substring matching | Mechanism confirmed; material false positives/negatives not yet established | Build corpus and prove behavior before changing matching semantics |

### Baseline runtime evidence already observed
- Local Windows Node v24.20.0: D5 performance regression script passed 50/50 runs. This does not establish Linux/CI stability; actual GitHub CI history remains to be captured if accessible.
- Current regression gate passed on baseline.
- Browser real-user scenario passed on baseline using mocked provider; it does not validate a live external AI service.
- Browser E2E lifecycle checks passed on baseline, including test-only setup failure, timeout, SIGINT, and SIGTERM cleanup.
- Runtime chunking probe demonstrated hard slicing can split Thai words. The originally reported exact sample cannot be verified without the original input.
- No application changes were made in the three-round roadmap audit. This file records the approved execution plan.

## 3. Mandatory engineering constraints

1. One implementation branch only: `fix-then-ship/roadmap-implementation`.
2. No merge to `main` until Phase 9 Release Candidate gate passes, final evidence is recorded, CI/branch-protection requirements are satisfied, and the user authorizes merge.
3. Keep every change directly traceable to a finding, test, or required documentation update.
4. No scope-expanding refactor and no silent schema/state-machine changes.
5. Preserve the current public function return contracts unless a backward-compatible optional argument is sufficient.
6. Any persisted metadata must be optional for historical records and survive backup/restore.
7. No claim of 100% security, universal semantic accuracy, or full legacy integrity without test evidence.
8. Stop and mark FAIL/HOLD when a mandatory gate fails; do not weaken/delete tests merely to obtain green results.

## 4. Per-change review protocol

Every implementation unit receives four reviews before its commit is considered complete:

- **Deep Review 1 — Correctness and scope:** trace production code paths, call sites, state transitions, data contracts, and exact scope.
- **Deep Review 2 — Adversarial regression:** malformed/partial outputs, boundary sizes, stale state, retries, interrupted operations, historical records, and injected failures.
- **Deep Review 3 — Compatibility and persistence:** legacy jobs, backup/restore, reload, batch flows, browser behavior, and all relevant consumers.
- **Full Audit 4 — Independent release-style audit:** inspect the complete diff, run the relevant regression gate, confirm no unrelated/core behavior changes, inspect generated artifacts/secrets, and record PASS/FAIL with evidence.

A review round is not a code change by itself; each round must identify findings, disposition them, and rerun affected tests.

## 5. Implementation phases and acceptance criteria

### Phase 0 — Baseline/evidence collection (P0)
**Goal:** Freeze the starting point and quantify known test-gate behavior before changing runtime behavior.

Tasks:
1. Record branch/commit, Node/browser/OS versions, exact commands, exit codes, run durations, and artifacts.
2. Capture available GitHub Actions results for D5; distinguish unavailable history from a confirmed CI failure.
3. Preserve current 50/50 Windows D5 result as local-only evidence.
4. Run baseline regression gate and relevant browser E2E tests on the selected implementation worktree.
5. Record known limitations and test-fixture identities.

Acceptance:
- `docs/review/PHASE0_BASELINE.md` contains reproducible commands and results.
- No private data, tokens, API keys, user backups, or private C2 corpus are committed.
- Baseline checks can be rerun on the implementation branch.

### Phase 1 — Performance gate reliability (P1 / D-02)
**Goal:** Improve measurement validity without masking real regressions.

Tasks:
1. Correct percentile indexing/sample-size handling. With 15 samples, p95 and p99 currently select the maximum; do not present them as robust tail estimates.
2. Measure paired per-trial overhead deltas (optimized minus baseline) so noise is compared within a trial rather than by subtracting independently computed percentiles.
3. Report p50 and distribution/sample count; use p95/p99 descriptively unless the sample size supports them.
4. Establish the hard-gate threshold from baseline evidence and documented variance; do not blindly replace thresholds with median or simply relax the gate.
5. Add a deterministic injected-regression mode and demonstrate that the gate catches the injected regression in at least 9 of 10 attempts.
6. Run the normal gate 50 times on the supported local environment and the prescribed CI environment when available.
7. Keep the TQG C1 algorithm/detection semantics unchanged.

Acceptance:
- Deterministic statistical unit tests cover percentile boundaries, even/odd sample counts, and paired deltas.
- Injected performance regression is caught at least 9/10 times.
- Normal runs are stable in baseline environment; results and any unresolved CI uncertainty are documented.
- No TQG detection/repair behavior changes.

### Phase 2 — Provider truncation guard (P2 / D-01, D-06)
**Goal:** A truncated provider response must never be persisted as a successful complete translation.

Tasks:
1. Inspect all provider response paths and every translation checkpoint call site, including app/12 translation core, app/13 batch, and both relevant app/02 recovery paths.
2. Detect OpenAI `finish_reason === 'length'` and Gemini `finishReason === 'MAX_TOKENS'` from provider metadata.
3. Preserve existing provider function string-return contract where feasible by using an optional metadata argument/internal result wrapper with a backward-compatible default.
4. Centralize translation acceptance logic so the same truncation rule applies to single, batch, retry, and resume flows.
5. For a truncated response, attempt at most one bounded split-and-retry at a safe boundary: translate the first portion, carry its output tail/context into the second portion as required, and combine the result. Do not checkpoint partial halves.
6. If either half is truncated again, reject with a typed non-retryable truncation result/error; do not mark that chunk as successful or advance a success checkpoint.
7. Update error/help text to match the actual stored chunk size/resume behavior; do not tell users that changing a setting will retroactively change an already-persisted job.
8. Add a characterization test documenting pre-fix behavior and a separate desired-behavior regression test that fails pre-fix and passes after the guard.
9. Inject OpenAI length truncation, Gemini MAX_TOKENS, second-half truncation, network/provider failure, empty/whitespace output, and checkpoint/reload interruption.

Acceptance:
- No truncated output can be recorded as a successful complete translation.
- No partial halves become durable checkpoints.
- Retry/resume honors the typed failure and never enters an infinite retry loop.
- Legacy provider callers retain their API contract.
- Existing translation and batch regressions pass without changing general translation strategy or IndexedDB/state-machine architecture.

### Phase 3 — Recovery integrity metadata (P3 / D-04)
**Goal:** Detect changed/reordered chunks during retry/recovery, not just a matching chunk count.

Tasks:
1. For newly created jobs, record optional `chunkerVersion`, `chunkLengths`, and a deterministic SHA-256 `chunkDigest` over a documented serialization of the ordered chunk sequence.
2. Treat the digest as the integrity check; lengths are diagnostic and cannot replace the digest.
3. Verify sequence digest before resuming/retrying reconstructed chunks and fail closed when a newly created job's digest mismatches.
4. Ensure every recovery/retry entry point applies the same validation, including partial job recovery.
5. Prove metadata survives checkpoint updates, app reload, backup, restore, and cloning without schema migration.
6. Historic jobs with no digest are explicitly treated as legacy V1 jobs with limited integrity verification and an honest warning; do not pretend their original chunks can be verified retrospectively.
7. Validate optional fields without rejecting historical records; do not bump IndexedDB DB_VERSION unless a separately reviewed necessity is proven.

Acceptance:
- Tests catch same-count/reordered/modified/truncated chunk sequences.
- New metadata survives all persistence/backup/restore paths tested.
- Legacy jobs still load and resume under the legacy path and are clearly identified as limited verification.
- No job-state machine or schema change.

### Phase 4 — Versioned Thai-safe chunker (P4 / D-03)
**Prerequisite:** Phase 7A read-only call-site audit is complete.

Goal: use safer chunk boundaries for new translation jobs, without changing how existing jobs reconstruct their chunks.

Tasks:
1. Preserve the existing splitter as explicit V1 with compatibility tests proving its output/semantics remain unchanged.
2. Add V2 for new jobs only, using boundary preference order: sentence punctuation; whitespace; Thai `Intl.Segmenter` word boundary; hard-slice only as last resort.
3. If `Intl.Segmenter` is unavailable, use an explicit deterministic fallback and test/document it; never assume the API exists in every supported browser.
4. Store selected chunker version and exact chunk digest at job creation, and dispatch resume/recovery using the stored version.
5. Freeze a Thai regression corpus with punctuation, no spaces, Thai/Latin mixtures, glossary terms, numbers, quotations, oversized single tokens, and exact length boundaries.
6. Ensure each chunk respects the provider input limit, except a single indivisible token where documented fallback behavior is necessary.
7. Rollback strategy: stop assigning V2 to new jobs if needed, but retain V1 and V2 readers while any V2 job may still be pending.

Acceptance:
- V1 compatibility tests prove old-job chunk reconstruction does not change.
- V2 tests demonstrate fewer mid-word splits on the locked corpus without dropping/duplicating characters.
- Digest reconstruction is deterministic across reload/browser environments.
- No changes to unrelated call sites in this phase.

### Phase 5 — AI glossary edit safety (P5 / D-05)
**Goal:** keep small targeted correction behavior while protecting the user's current output from unexpectedly large edits.

Tasks:
1. Capture an immutable pre-edit snapshot and recheck that output/context is unchanged before applying a response.
2. Calculate a bounded diff/magnitude ratio using existing text-diff utilities where suitable; define threshold from fixtures, not intuition alone.
3. Apply small expected edits as currently intended. Require explicit confirmation for large or structurally suspicious replacements, including likely truncation or unexpectedly short output.
4. Add an Undo action restoring the exact pre-edit text; prevent repeated/stale actions from overwriting a newer edit.
5. Preserve context checks and safe DOM rendering. No schema changes.
6. Add tests for accepted small correction, large replacement requiring confirmation, truncated replacement, empty output, stale context, exact undo, and missing UI references.

Acceptance:
- Large edits cannot silently replace user output.
- Undo exactly restores the previous string and does not overwrite newer content.
- Existing glossary fix and TQG regression tests pass.

### Phase 6 — Service worker mixed-version investigation (conditional / D-07)
**Goal:** resolve the suspected mixed-release cache issue based on reproducible evidence.

Tasks:
1. Add/use a controlled browser fixture with release A assets loaded, then release B deployed without cache-version bump; test install/activate/fetch and navigation behavior.
2. Repeat with the version bump expected by current release workflow.
3. Test offline load and network failure fallback for consistency of HTML/JS/CSS.
4. If the mixed-version failure cannot be reproduced, close D-07 with fixture details and limitations; do not make speculative runtime changes.
5. If reproduced, implement the smallest version-coherence fix, add regression coverage, then run cache lifecycle tests and review cache cleanup.
6. Do not change cross-origin or AI provider caching policy as part of this finding.

Acceptance:
- D-07 has a documented reproduce/not-reproduce decision.
- Any code change is backed by a failing reproduction test.
- Existing version guard and release workflow remain consistent.

### Phase 7A — Read-only call-site, XSS, and Thai glossary audit (prerequisite to Phase 4)
**Goal:** complete prerequisite analysis before changing chunking call sites or glossary semantics.

Tasks:
1. Map all `splitIntoChunks` consumers and classify translation/recovery versus glossary, editor draft, batch/OCR, export, and book tools.
2. Review each dynamic `innerHTML` use with source-to-sink context, escaping/sanitization, trusted/untrusted data boundaries, and CSP behavior. A grep result alone is not proof of safety.
3. Review `checkMissedGlossaryTerms()` and `indexOf` substring semantics using a fixed corpus of true positives, false positives, false negatives, Thai marks, and whole-word/substring cases.
4. No behavior change to glossary matching until evidence shows a material defect and explicit tests define desired semantics.
5. Publish a call-site impact matrix and findings disposition in review docs.

Acceptance:
- All relevant splitter call sites are classified and current behavior is recorded.
- Security findings are either closed with context-specific evidence or become a narrowly scoped follow-up with regression tests.
- Thai matching semantics remain unchanged unless separately approved.
- Phase 4 can proceed without accidentally changing non-translation call sites.

### Phase 7B — Splitter consumer migration (separate review unit after Phase 4)
**Goal:** migrate non-translation call sites only when a concrete need and expected output are documented.

Tasks:
1. Review each consumer separately against the Phase 7A matrix.
2. Keep consumers on V1 unless there is a user-visible defect and a fixture proving V2 is correct for that context.
3. Do not bulk-replace all calls or change OCR/export/editor/batch semantics by default.

Acceptance:
- Every changed call site has its own targeted regression test and explicit rationale.
- No accidental output changes across glossary/editor/OCR/export/book tools.

### Phase 8 — Documentation and governance evidence (P8)
Tasks:
1. Add `docs/review/PHASE0_BASELINE.md` with reproducible baseline results.
2. Update D5 performance documentation and `docs/tqg/STATUS_EVIDENCE_MATRIX.md` with current, exact evidence.
3. Qualify README claims such as resume behavior if they overstate integrity for legacy jobs or make guarantees not supported by tests.
4. Record compatibility limitations, chunker versions, typed truncation behavior, test environment, and rollout/rollback strategy.
5. Keep workflow permissions least-privileged and Actions SHA-pinned; document what was actually checked.
6. Do not commit private user backup JSON, secrets, credentials, or private corpus data.

Acceptance:
- Docs match implemented behavior and observed evidence.
- No unsupported universal security/privacy/semantic accuracy claims.
- No unrelated documentation churn.

### Phase 9 — Release candidate / final audit (P9; mandatory merge gate)
Run after all code and docs are complete:
1. Syntax/static checks for all changed JavaScript and scripts.
2. Full repository regression gate (including TQG, C5, model catalog, static gates, core scope checks, and browser harness diagnostics).
3. D5 performance normal runs and injected-regression sensitivity evidence.
4. Browser real-user scenario, E2E lifecycle, service-worker reproduction fixture (if applicable), failure injection, and backup/restore/recovery stress suites.
5. Provider truncation tests for OpenAI and Gemini including repeated truncation and checkpoint boundaries.
6. V1/V2 chunker corpus, same-count digest mismatch tests, historical job compatibility, and metadata backup/restore validation.
7. Glossary edit magnitude/undo/stale-context tests and read-only XSS/glossary audit disposition.
8. Inspect full diff against the branch base; confirm no unrelated core changes, no secrets/private artifacts, no accidental lockfile or generated artifact drift.
9. Recheck GitHub workflow permissions, SHA pinning, required Regression Gate, and actual main branch protection state.
10. Record all test commands and outcomes in a final audit report. Failed/inaccessible tests must be listed as FAIL/HOLD or environment limitation, never silently omitted.

**Merge decision:** PASS only when all mandatory gates pass; PASS WITH LIMITATION only for explicitly non-blocking, documented environment limitations accepted by the user; otherwise FAIL/HOLD. Do not merge to `main` automatically.

## 6. Dependency graph and working order

```text
P0 Baseline/Evidence
  ├── P1 D5 Performance Gate (move ahead of P2 only if baseline/CI evidence shows material flake)
  ├── P2 Provider Truncation Guard
  └── P7A Read-only call-site/XSS/glossary audit (alongside P2; prerequisite to P4)

P2 + P7A  -> P3 Recovery Integrity Metadata -> P4 Versioned Thai-safe Chunker -> P7B optional consumer migrations
P5 Glossary Edit Safety (independent, but same branch and same review protocol)
P6 Service Worker (conditional on browser reproduction)
P8 Documentation (update as evidence/results stabilize)
All completed phases -> P9 Release Candidate / Final Audit -> explicit user authorization -> possible merge
```

## 7. Implementation tracking

- [x] Create isolated implementation branch from recorded `main` baseline.
- [x] Commit this roadmap as the branch's initial implementation baseline.
- [x] P0 — Baseline/evidence collection (local baseline captured; GitHub historical CI entries unavailable).
- [x] P1 — D5 performance gate reliability (paired-trial quantiles, injected-regression check, 50/50 local runs).
- [x] P2 — Provider truncation guard (OpenAI/Gemini metadata, bounded split, fail-closed on repeated and second-half truncation; final isolated FI-07–FI-09 and FI-13–FI-14 all passed).
- [x] P7A — Read-only audit prerequisite (call-site/XSS-context matrix published; no D-11 semantic change justified).
- [x] P3 — Recovery integrity metadata (SHA-256/length/version checks and reload-persistence coverage).
- [x] P4 — Versioned Thai-safe chunker (V1 compatibility, opt-in V2 for new Translation Jobs; Thai/Unicode contract tests).
- [x] P5 — AI glossary edit safety (magnitude confirmation, exact Undo, stale-output guard; FI-10–FI-12 passed).
- [x] P6 — Service Worker conditional investigation (mixed-cache behavior reproduced; cache-hit mutation removed; release advanced to v11; browser fixture passes).
- [x] P7B — Disposition complete; Phase 7A evidence did not warrant changing OCR/glossary/export/book consumers, so they remain on V1.
- [x] P8 — Documentation/governance evidence (README, Phase 0 baseline, D5 evidence and status matrix updated).
- [ ] P9 — Release candidate final audit and merge-gate report.

## 8. Current implementation evidence and open gates

Local final-tree gates pass after the final OpenAI malformed-response compatibility correction: Regression Gate (15.89 s), isolated FI matrix including FI-14 (30.43 s), backup/restore with metadata assertions, recovery stress, browser real-user/SW fixture, lifecycle cleanup, TQG Production Assurance, 35-assertion chunker/integrity contract and D5 50/50 repeat evidence. One FI-04 invocation failed when other browser suites overlapped; the serial rerun passed, but the cause is unproven and the test remains enabled. GitHub PR CI and actual branch-protection verification still must pass before Phase 9 can be closed or merge considered.

### Release-gate reconciliation (2026-10-09)

The first GitHub PR run found that the pre-existing WORK 4 release gate required sw.js to remain blob-identical even though D-07's conditional fix was reproduced by the new browser fixture. A narrow predicate now permits only the exact release-base v10-to-v11 change plus the approved cache-hit/miss fetch-block replacement, with fixture, release-version, same-origin, GET-only and cache-write checks. All other protected storage/TQG files remain under the original blob-identical rule. Two local PR-base WORK 4 runs: PASS WITH LIMITATION in 100.39 and 99.84 seconds. Phase 9 stays pending until the pushed follow-up's GitHub Actions checks all pass.

## 9. Completion rule

This branch is the sole integration line for the Fix-Then-Ship implementation. The roadmap file is the baseline for scope and acceptance criteria. If evidence requires changing the plan, record the finding, impact, tests, and reason in this file before widening scope. No merge to `main` occurs until the full release-candidate gate is green and the user explicitly instructs the merge.
