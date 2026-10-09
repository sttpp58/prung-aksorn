# Fix-Then-Ship — Final Audit Rerun Report

**Audit date:** 2026-10-09 (Asia/Bangkok)  
**Repository:** `sttpp58/prung-aksorn`  
**Target branch:** `fix-then-ship/roadmap-implementation`  
**Audited implementation commit:** `1f9780e501d5bc2c287eb046f6bbcf2cc824e4d9`  
**Base branch / SHA:** `main` / `2e31ee46ffb86d47a03db863afad2f1d152776ec`  
**Related PR:** [#52 — Fix-Then-Ship reliability hardening](https://github.com/sttpp58/prung-aksorn/pull/52)  
**Disposition:** **PASS WITH LIMITATION — not merge approval**

## 1. Executive result

The final audit was repeated against the exact implementation commit in an isolated, clean Git worktree. The repository Regression Gate passed, and the full WORK 4 Final Audit / Release Gate completed with exit code 0 in 94.06 seconds.

The release gate's intentionally qualified result is **`Engineering Release Gate: PASS WITH LIMITATION`**. The remaining limitations are material: actual GitHub branch-protection/required-check settings could not be independently inspected by the connected integration (HTTP 403), and real-world semantic repair accuracy remains deferred because an independently reviewed gold repaired-target dataset is not tracked.

No production code was modified as part of this audit. The report is a documentation-only addition.

## 2. Audit identity and repository state

| Check | Evidence / result |
|---|---|
| Audited commit | `1f9780e501d5bc2c287eb046f6bbcf2cc824e4d9` |
| Base commit | `2e31ee46ffb86d47a03db863afad2f1d152776ec` |
| Branch comparison | `fix-then-ship/roadmap-implementation` is 4 commits ahead and 0 commits behind `main` at audit time |
| Changed-file inventory | 25 files in the branch comparison |
| Isolated worktree | Clean at the audited SHA before test execution |
| Whitespace checks | `git diff --check` and `git diff --cached --check` passed in the full gate |
| Production scope | No IndexedDB schema bump; no Translation Job state-machine redesign; TQG detection/repair semantics retained |
| Merge / deployment | Not authorized by this audit |

The user's pre-existing local working directory was on a different branch and contained unrelated untracked files. It was not used as the audit workspace and was not modified. All local reruns below were executed from a separate clean worktree pinned to the audited commit.

## 3. Fresh local verification

### 3.1 Repository Regression Gate

Command: `node scripts/regression-gate.mjs`  
Result: **PASS**, exit code 0, 15.92 seconds.

The runner reported passing checks for the CSP contract, app-shell release-version consistency, Service Worker cache-coherence protections, IndexedDB / Translation Job revision and checkpoint contracts, context-generation guards, recovery metadata, TQG, Model Catalog, backup/restore and Fix-Then-Ship chunk/integrity contracts.

### 3.2 Full Release Gate

Command: `node scripts/work4-final-audit-release-gate.mjs`  
Result: **PASS WITH LIMITATION**, exit code 0, 94.06 seconds.

| Component invoked by WORK 4 | Result |
|---|---|
| Static release artifacts, syntax, whitespace, secret-pattern and scope guards | PASS |
| TQG Phase C final audit | Expected gated result PASS WITH LIMITATION |
| TQG Work 1 semantic-gold validation | PASS |
| TQG Work 2 effectiveness audit | PASS |
| TQG semantic gold-target validation | PASS for available fixtures and gate contract |
| Repository Regression Gate | PASS |
| TQG-09 Regression | PASS |
| Work 1 regression | PASS |
| Work 2 regression | PASS |
| TQG Production Assurance | PASS |
| Browser E2E / Real User Scenario | PASS |
| Failure Injection Matrix | PASS |
| Backup / Restore Real-world Validation | PASS |
| Translation Job Recovery Stress Test | PASS |
| Final WORK 4 release decision | **PASS WITH LIMITATION** |

The gate explicitly reports: **Semantic repair accuracy remains DEFERRED: no independent real-world gold repaired-target dataset is tracked.**

## 4. Remote GitHub Actions on the audited implementation SHA

The eight PR-triggered workflows previously verified on the exact audited commit all completed successfully:

| Workflow | Run | Result |
|---|---:|---|
| Regression Gate | #117 | PASS |
| Final Audit / Release Gate | #65 | PASS |
| Failure Injection | #73 | PASS |
| Backup Restore Real-world Validation | #71 | PASS |
| Translation Job Recovery Stress Test | #69 | PASS |
| Browser E2E | #75 | PASS |
| TQG Production Assurance | #65 | PASS |
| TQG Semantic / Gold-target Validation | #67 | PASS |

This is 8/8 successful workflows on `1f9780e501d5bc2c287eb046f6bbcf2cc824e4d9`. The final audit report itself is being added as a documentation-only commit after this audited snapshot; do not infer that CI evidence for one SHA automatically applies to a later SHA.

## 5. Scope, compatibility and protected-boundary audit

### Confirmed by the release gate and regression contracts

- **Truncated provider output:** OpenAI `finish_reason: "length"` and Gemini `MAX_TOKENS` fail closed; the split retry is bounded, and a partial result is not checkpointed as a complete source chunk.
- **Chunk compatibility:** V1 remains the compatibility default for shared/non-translation consumers; V2 is selected for newly created Translation Jobs.
- **Recovery integrity:** New jobs retain chunker version, chunk lengths and ordered SHA-256 digest; reconstructed chunks are verified before recovery/retry requests. Older jobs without a digest remain on the legacy V1 path with explicitly limited boundary verification.
- **Glossary edit safety:** Broad AI edits require confirmation and are guarded by exact Undo and stale-context/output checks.
- **Service Worker coherence:** The approved v10-to-v11 cache-coherence change pins cached hits to the active release cache and writes misses only to that versioned cache. The gate verifies the exact transformation, release-version synchronization, same-origin/GET-only bypass, and browser fixture contracts.
- **Storage/TQG boundaries:** The release gate retains protected-file checks for storage and TQG files; no IndexedDB schema migration or TQG detection/repair semantic rewrite was included.
- **Security evidence:** The bounded HTML/XSS context review did not establish an exploitable issue. This is not a claim that all possible XSS paths are absent.
- **Thai glossary matching:** Existing substring matching semantics were intentionally left unchanged because no vetted false-positive/false-negative corpus justified a behavioral change.

## 6. Known limitations and residual risks

1. **Branch protection remains unverified.** The connected GitHub integration received HTTP 403 when accessing the branch-protection/required-status-check endpoint. Green workflow runs do not prove that those checks are configured as required. Verify the rule using an account with sufficient repository administration permission.
2. **Semantic repair accuracy is deferred.** Synthetic fixtures and the existing semantic gold-target gate pass, but the repo does not contain an independently reviewed real-world gold repaired-target dataset. Do not claim production semantic repair accuracy is proven.
3. **D5 benchmark evidence is local-only.** The existing evidence records 50/50 repeated benchmark passes on Windows Node v24.20.0. This is not independent proof of benchmark parity on Linux/CI.
4. **FI-04 timing note remains open.** One earlier failure occurred when browser harnesses overlapped; the isolated serial matrix passed with the assertion retained. The exact cause of the earlier failure has not been proven.
5. **Legacy job integrity is weaker by design.** Historical jobs without a stored digest cannot receive retrospective source-boundary verification; they remain compatible on V1.
6. **XSS review was bounded.** “No exploit established” must not be generalized into an absolute security guarantee.

## 7. Release decision and required next steps

**Decision: PASS WITH LIMITATION. Keep the PR unmerged.**

Before treating this work as ready for release:

1. Verify the actual `main` branch-protection rule and required status checks through a sufficiently privileged GitHub session.
2. Keep the semantic repair accuracy claim explicitly deferred until independent real-world gold repaired targets are available and validated.
3. Review the final PR diff and obtain explicit release/merge authorization.

This report does not authorize marking the PR ready for review, merging, or deploying. No changes were merged to `main` as part of this audit.
