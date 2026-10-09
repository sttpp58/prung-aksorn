# Fix-Then-Ship Implementation — Deep Review Log and Final Audit

**Repository:** `sttpp58/prung-aksorn`
**Implementation branch:** `fix-then-ship/roadmap-implementation`
**Roadmap baseline commit:** `0e8e62a7aa4308489649c33d6d0b7ff5a857328a`
**Main baseline SHA:** `2e31ee46ffb86d47a03db863afad2f1d152776ec`
**Audit date:** 2026-10-09
**Disposition:** Local implementation gates pass. **Merge remains blocked** until checks run on the pushed implementation PR and are all green.

## 1. Scope and change inventory

The implementation remains within the Fix-Then-Ship roadmap:

- D-01/D-06: fail closed on OpenAI `finish_reason=length` and Gemini `MAX_TOKENS`; at most one source-aware split retry; never persist either half until both are complete.
- D-02: D5 statistical gate now uses interpolated quantiles and paired trial deltas; average and p50 are hard gates, p95/p99 are descriptive for the 15-trial sample; deterministic injected-regression evidence retained.
- D-03: explicit V1 compatibility splitter, opt-in V2 for newly created translation jobs; source-preserving punctuation/whitespace/Thai-word boundaries and Unicode-safe fallback.
- D-04: optional version/length/SHA-256 metadata, verification before recovery API calls, including same-session resume, reload recovery, batch recovery and retry.
- D-05: confirm broad AI glossary edits, exact Undo, and stale-output/context guard.
- D-07: controlled browser reproduction showed that mutating cache hits in the active cache can expose mixed release assets. Service Worker now pins cache hits to the active version; cache misses only update that worker's versioned cache. Release version synchronized to v11.
- D-08: context-based dynamic HTML sink review documented; no exploit was established in the bounded audit. This is not a claim of universal XSS absence.
- D-11: Thai glossary substring semantics intentionally unchanged because a vetted false-positive/false-negative corpus has not established a material defect.

No IndexedDB schema bump, job state-machine rewrite, TQG detection/repair semantic change, provider strategy redesign, or mass migration of OCR/glossary/export/book-tool splitter consumers was included. The shared splitter wrapper remains V1.

## 2. Deep Review 1 — Correctness and scope

**Disposition: PASS**

1. Provider metadata checks occur before a provider result is returned to translation callers. Truncated output carries `AI_OUTPUT_TRUNCATED` and is not treated as an ordinary retryable transport error.
2. Translation checkpoint paths in `app/12-translation-core.js`, `app/13-batch.js`, and both batch recovery/retry paths in `app/02-translation-recovery.js` use the shared guard. A checkpoint is written only after the guard returns the complete combined result.
3. The split retry is bounded. Failure in the first or second half propagates; neither half is checkpointed separately. The combination preserves source-derived separator whitespace rather than injecting a new newline.
4. New jobs choose V2 explicitly, record the actual chunker version and an ordered chunk digest. Historical jobs without metadata default to V1. Non-translation callers of the general splitter remain on V1.
5. Recovery reconstructs by the stored version, checks count/length/digest, and stops before a provider request when verification fails. The in-session re-entry path now reads the persisted job and repeats the digest check instead of trusting only its in-memory chunk array.
6. AI glossary edits use a captured output snapshot and application context. Large edits wait for user confirmation and then revalidate context/output; Undo is available only while the output remains the exact AI-applied value.
7. The Service Worker fix preserves same-origin and GET-only constraints and does not introduce caching of provider/API traffic. Release strings in `sw.js`, `index.html`, and `manifest.json` agree at v11.
8. A final compatibility pass found that the first OpenAI truncation patch could turn a malformed response without `choices/message/content` into an empty string. This was corrected to preserve the original property-access error/return contract and add only the `finish_reason === 'length'` fail-closed branch; FI and Regression Gate were rerun after this correction.

## 3. Deep Review 2 — Adversarial/regression review

**Disposition: PASS**

- FI-07: OpenAI truncation followed by a two-part retry; only the complete chunk is checkpointed.
- FI-08: repeat truncation in the first half fails closed without an unbounded retry.
- FI-09: Gemini `MAX_TOKENS` uses the same bounded contract.
- FI-13: second-half truncation fails the original chunk even when the first half already returned complete text.
- FI-14: deliberately corrupting a stored digest while leaving counts unchanged causes same-session resume to fail before any additional provider attempt; checkpoint count and partial results remain unchanged.
- FI-10–FI-12: small correction, large edit confirmation/Undo, and stale user output protection.
- Chunk/integrity contract tests cover V1 wrapper compatibility, Thai without spaces, sentence/whitespace boundaries, paragraph separators, emoji/surrogate pairs, configured size limits, deterministic SHA-256, reordered/modified same-count chunks, corrupt lengths, legacy absence of digest, partial metadata and unsupported versions.
- Synthetic benchmark injects an above-threshold regression into the D5 gate and rejects 10/10 attempts (acceptance criterion: at least 9/10).
- Browser Service Worker fixture reproduced the mixed-cache mechanism before the fix; the fixed no-bump case remains consistently A/A, a versioned update serves B/B, and both sets remain internally consistent in offline cached-load checks.

### FI-04 test stability note

One FI matrix invocation performed while other browser E2E processes were running failed the autosave/reload assertion. The full FI matrix then passed in a serial run, including FI-14. Earlier serial and concurrent runs show this harness can be timing-sensitive under overlapping browser load. The failure was not discarded or removed from the suite; the final merge check must still run CI on the PR. Root cause of the isolated concurrent-run failure has not been independently proven, so this log does not claim it was definitively environmental.

## 4. Deep Review 3 — Compatibility, persistence and rollback

**Disposition: PASS WITH EXPLICIT LEGACY LIMITATION**

1. The old splitter algorithm remains the V1 implementation and the default wrapper. Versioned V2 is only used for new translation jobs and matching translation-preview counts.
2. No IndexedDB schema migration was introduced; database version remains unchanged. Optional fields are added through existing job objects and checkpoint updates preserve fields carried on the current job.
3. New jobs persist `chunkerVersion`, `chunkLengths` and SHA-256 over `JSON.stringify(orderedChunks)`. Digest is the integrity check; lengths are diagnostic only.
4. Jobs predating these fields remain V1 and are identified as having limited original-boundary verification. They are not given a fictitious retrospective digest. Incomplete new metadata fails closed.
5. Backup V2 exports the fields with the Translation Job object. The real browser backup/restore round-trip verifies the metadata in both the downloaded JSON and the restored IndexedDB job; restore checksum and repeated-restore/reload checks pass.
6. The call-site impact matrix classifies OCR repair, glossary extraction, export, and whole-book tools as V1; no bulk consumer migration was justified.
7. D-11 matching behavior remains unchanged. No guessed Unicode normalization or Thai word-boundary semantics have been introduced.

**Rollback:** for future rollout, stop assigning V2 to newly created jobs if needed, but retain V1 and V2 reconstruction readers while any V2 job may be recoverable. Roll back the Service Worker only together with a correctly synchronized cache/release version; do not republish mixed version strings.

## 5. Full Audit 4 — Release-style review

**Disposition: Local gates PASS; remote merge gate still OPEN**

The final local runs after the same-session digest check and FI-14 change were:

| Gate | Result | Notes |
|---|---|---|
| `node scripts/regression-gate.mjs` | PASS | Final run 15.89 s after the OpenAI response-contract correction; includes static contracts, TQG, model catalog and Fix-Then-Ship integrity contract |
| `node tests/e2e/failure-injection.mjs` | PASS | Final serial run 30.43 s after the OpenAI response-contract correction; full matrix includes FI-07–FI-14 and existing failure/cancellation/autosave cases |
| `node tests/e2e/translation-job-recovery-stress.mjs` | PASS | ~15.47 s; multi-checkpoint repeated browser restarts and persisted metadata |
| `node tests/e2e/browser-real-user-scenario.mjs` | PASS | ~12.60 s; real Chromium, mocked provider, SW A/B and offline cache consistency, no unexpected external calls |
| `node tests/e2e/browser-e2e-lifecycle.mjs` | PASS | ~16.39 s; setup failure, global timeout, SIGINT and SIGTERM cleanup |
| `node tests/e2e/backup-restore-real-world.mjs` | PASS | ~14.18 s; Backup V2 checksum, chunk metadata export/restore and repeated restore/reload |
| `node tests/e2e/tqg-production-assurance.mjs` | PASS | Real browser with mock provider; TQG clean/suspicious/failure-isolation paths |
| `node tests/fix-then-ship-contract.mjs` | PASS | 35 assertions, rerun after the final provider change |
| `node tests/tqg/tqg-d5-performance-regression.mjs` | PASS | Latest standalone run ~3.67 s |
| D5 repeated standalone benchmark | PASS 50/50 | Windows Node v24.20.0; 132.5 s total. This is local evidence only, not Linux/CI proof. |
| `node --check` on changed application JS, SW, gate and E2E scripts | PASS | No syntax errors |
| `git diff --check` | PASS | No whitespace errors after line-ending cleanup |

A final source inventory confirmed translation checkpoints are behind the shared truncation guard, while direct AI calls in glossary extraction, OCR repair, export, book tools, TQG inspection/repair and title ingestion remain outside the Translation Job checkpoint contract. This is intentional scope separation, not an omission of a Translation Job checkpoint path.

### Required before any merge

1. Push the implementation commit and open a PR targeting `main` to run GitHub Actions. The current workflows are configured for `pull_request` to `main` and `push` to `main`; local tests do not substitute for the Ubuntu runner.
2. Verify the actual required checks and branch protection against the PR. GitHub status/workflow queries for the baseline SHA returned no entries, which means historical signal was unavailable from those queries, not that CI has never failed.
3. Require all PR checks to pass, resolve any failures with targeted regression tests, and repeat the relevant review rounds after fixes.
4. Keep the PR unmerged until the user explicitly authorizes merge.

## 6. Final review decision

**PASS WITH LIMITATION — local implementation gates pass; merge is not authorized.**

The implementation can be committed and pushed on `fix-then-ship/roadmap-implementation` after recording the 3 Deep Reviews and this Full Audit. The merge gate remains blocked until the PR's required GitHub checks and actual branch-protection requirements are confirmed green. No change to `main` has been made by this work.


## 7. Follow-up audit — reconcile the existing release gate with evidence-backed D-07

Trigger: GitHub PR #52 run “Final Audit / Release Gate” (run 63) failed at the protected-file assertion “sw.js remains blob-identical to release base”. All preceding artifact, permissions, pinned-action, no-secret and storage-v2.js checks passed. The failure was caused by a blanket legacy rule that did not allow the roadmap's conditional D-07 change even after a browser fixture reproduced mixed-version cache behavior.

Narrow correction: scripts/work4-final-audit-release-gate.mjs now retains blob-identical enforcement for every protected file except two explicit, separately reviewed exceptions (the prior tqg-integration.js contract and this D-07 Service Worker fix). The D-07 predicate does not merely whitelist sw.js: it constructs the only accepted file by applying exactly two transformations to release-base sw.js—v10 to v11 and replacement of the previously background-refreshing fetch block with the version-pinned cache-hit/miss behavior. It then requires:
- the candidate sw.js worktree blob matches committed HEAD;
- exact transformed source matches with no additional changed line;
- manifest.json, index.html, and sw.js agree on v11;
- cross-origin and non-GET bypasses remain present;
- cached hits return the active cache entry and background refresh is absent;
- cache misses are written only to that active cache; and
- the real-browser A/A no-bump, B/B versioned release, and offline cached-release fixtures remain present.

storage-v2.js, tqg-inspector.js, tqg-repair.js, tqg-integration.js, and tqg-ui.js continue to have their strict original protected-file rules; the SW condition cannot approve changes to those files.

### Four-round follow-up review

- Deep Review 1 — scope/correctness: PASS. The only modified gate is scripts/work4-final-audit-release-gate.mjs. The SW exception is exact-diff bound to the reproduced cache-coherence change; no storage or TQG semantics were relaxed.
- Deep Review 2 — adversarial gate behavior: PASS by construction and current execution. The predicate checks the full baseline-to-HEAD SW transformation plus independent release, fixture and bypass contracts. A change to any other SW line causes expected-source comparison to fail.
- Deep Review 3 — compatibility/release boundary: PASS locally. The gate continues all artifact checks, secret scan, protected storage/TQG checks, syntax checks, TQG sub-gates, Regression Gate, TQG Production Assurance, Browser E2E, Failure Injection, Backup/Restore and Recovery Stress.
- Full Audit 4 — local PR-base release gate: PASS WITH LIMITATION. Run with a pull-request event payload bound to base SHA 2e31ee46ffb86d47a03db863afad2f1d152776ec: node scripts/work4-final-audit-release-gate.mjs completed first in 100.39 seconds and then reran after line-ending cleanup in 99.84 seconds; both ended Engineering Release Gate: PASS WITH LIMITATION. Semantic repair accuracy remains deferred; no private gold data was added.

The original failed run belongs to commit d20deb6. The narrow gate correction in the follow-up commit resolves that mismatched condition and has passed the local PR-base gate twice. PR #52 remains draft and unmerged until GitHub Actions reruns against the follow-up commit and all required checks complete successfully. Do not treat the local pass as a substitute for that remote rerun.
