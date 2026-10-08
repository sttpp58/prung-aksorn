# TQG Status and Evidence Matrix

## Purpose

This matrix reconciles the status documents with the files and commands that
were inspected on the Phase 0 baseline branch. It records only evidence that
was found in the repository or produced by an actual local run.

Baseline commit: `aca6ba15055bde887e9f254f82e7dd293d599564`
Baseline branch: `codex/docs-p0-reconcile-status`
Baseline date: 2026-10-08

## Independent release dimensions

| Dimension | Status | Evidence | Interpretation |
| --- | --- | --- | --- |
| Engineering Gate | PASS for deterministic/repository checks; browser-dependent gate is environment-limited locally | `node scripts/regression-gate.mjs` passed; `node scripts/tqg-phase-c-final-audit.mjs` passed; `node scripts/work4-final-audit-release-gate.mjs` reached the browser assurance step and failed on local CDP readiness | Engineering safety evidence exists, but a local browser timeout is not evidence of browser assurance success |
| Semantic Accuracy | DEFERRED | `node scripts/tqg-work1-semantic-gold-validation.mjs` returned `status: DEFERRED`; required human-reviewed dataset is absent | Synthetic fixtures and detector regressions do not establish real-world repair accuracy |
| Main branch protection | UNVERIFIED | `gh` CLI is not installed, so `gh api repos/sttpp58/prung-aksorn/branches/main/protection` could not run | Verify manually in GitHub Settings > Branches; do not infer enforcement from documentation |

## Stage / Work evidence

| Area | Test or runner inspected | Workflow inspected | Status document / artifact | Current evidence |
| --- | --- | --- | --- | --- |
| C1 Performance / equivalence | `tests/tqg/tqg-c1-equivalence-regression.mjs`; `scripts/tqg-c1-benchmark.mjs` | `.github/workflows/regression-gate.yml` through `scripts/regression-gate.mjs` | `TQG_PHASE_C_FINAL_AUDIT.md` | PASS in deterministic regression gate |
| C2 Real-world gold dataset | `scripts/tqg-c2-validate.mjs`; `tests/tqg/corpus-public.json` and schema/report artifacts | `.github/workflows/regression-gate.yml` | `TQG_PHASE_C_FINAL_AUDIT.md`; `TQG_WORK1_INDEPENDENT_SEMANTIC_GOLD.md` | Public/sanitized corpus checks pass; private semantic gold is not public evidence |
| C3 Detector effectiveness | `scripts/tqg-work2-effectiveness-audit.mjs`; `tests/tqg/tqg-work2-effectiveness-regression.mjs` | `.github/workflows/regression-gate.yml`; semantic-gold workflow | `TQG_PHASE_C_FINAL_AUDIT.md`; `TQG_WORK2_EFFECTIVENESS_HARDENING.md` | PASS/validated within the locked C2 evidence boundary |
| C4 Repair validation | `scripts/tqg-c4-repair-validation.mjs`; `tests/tqg/tqg-repair-production-contract-regression.mjs` | `.github/workflows/regression-gate.yml` | `TQG_PHASE_C_FINAL_AUDIT.md`; `TQG-C4-REPORT.md` | PASS WITH LIMITATION; fail-closed and bounded-repair behavior are covered |
| C5 Phase C final audit | `scripts/tqg-phase-c-final-audit.mjs` | `.github/workflows/regression-gate.yml` | `TQG_PHASE_C_FINAL_AUDIT.md` | PASS WITH LIMITATION in the actual local run |
| D1 Observability contract | `tests/tqg/tqg-d2-observability-regression.mjs` checks the locked schema contract | `.github/workflows/regression-gate.yml` | `TQG_PHASE_D_OBSERVABILITY_CONTRACT.md` | Contract is LOCKED; this document now distinguishes the contract from implementation |
| D2 Runtime instrumentation | `tests/tqg/tqg-d2-observability-regression.mjs`; `tqg-integration.js` observability implementation | `.github/workflows/regression-gate.yml` | `TQG_PHASE_D3_PRIVACY_COST_GUARD.md` baseline and D2 regression | IMPLEMENTED and regression-covered |
| D3 Privacy / cost guard | `tests/tqg/tqg-d3-privacy-cost-regression.mjs` | `.github/workflows/regression-gate.yml` | `TQG_PHASE_D3_PRIVACY_COST_GUARD.md` | PASS in deterministic regression gate |
| D4 Telemetry isolation | `tests/tqg/tqg-d4-telemetry-isolation-regression.mjs` | `.github/workflows/regression-gate.yml` | `TQG_PHASE_D4_TELEMETRY_ISOLATION.md` | PASS in deterministic regression gate |
| D5 Performance / regression | `tests/tqg/tqg-d5-performance-regression.mjs` | `.github/workflows/regression-gate.yml` | `TQG_PHASE_D5_PERFORMANCE_REGRESSION.md` | PASS; document declares locked D1-D5 scope closed |
| Work 1 semantic gold infrastructure | `tests/tqg/tqg-work1-semantic-gold-regression.mjs`; `scripts/tqg-work1-semantic-gold-validation.mjs` | `.github/workflows/tqg-semantic-gold-target-validation.yml` | `TQG_WORK1_INDEPENDENT_SEMANTIC_GOLD.md` | Infrastructure implemented; real-world accuracy DEFERRED |
| Work 2 effectiveness hardening | `tests/tqg/tqg-work2-effectiveness-regression.mjs`; `scripts/tqg-work2-effectiveness-audit.mjs` | `.github/workflows/regression-gate.yml` | `TQG_WORK2_EFFECTIVENESS_HARDENING.md` | C2-validated; private dataset remains untracked |
| Work 3 production assurance | `tests/e2e/tqg-production-assurance.mjs` | `.github/workflows/tqg-production-assurance.yml` | `TQG_WORK3_PRODUCTION_ASSURANCE.md` | CI evidence is documented; local run is blocked by Chrome/CDP timeout |

## Baseline execution record

### Passed

- `node scripts/regression-gate.mjs` — `Regression Gate: PASS`.
- `node scripts/tqg-phase-c-final-audit.mjs` — engineering safety gate PASS and
  semantic limitation preserved.
- `node scripts/tqg-work1-semantic-gold-validation.mjs` — `DEFERRED` with exit
  code 0 because the private gold-repaired-target dataset is unavailable.

### Failed or environment-limited

The following local browser runners could not reach their Chrome DevTools JSON
endpoint and therefore did not execute their scenarios to completion:

- `tests/e2e/browser-real-user-scenario.mjs`
- `tests/e2e/failure-injection.mjs`
- `tests/e2e/backup-restore-real-world.mjs`
- `tests/e2e/translation-job-recovery-stress.mjs`
- `tests/e2e/tqg-production-assurance.mjs`

Observed error form:

```text
Timed out waiting for http://127.0.0.1:<port>/json
```

The browser-real-user runner also captured Chrome stderr showing that Chrome
advertised a DevTools WebSocket while the HTTP JSON readiness request still
failed. This is a harness/environment diagnostic target for Phase 1, not proof
that the application lifecycle assertions are wrong.

`node scripts/work4-final-audit-release-gate.mjs` therefore could not complete
its browser-dependent release gate locally; this result must not be rewritten as
an overall local PASS.

## Privacy and history checks

- `git ls-files -- tests/tqg/c2-private '*WORK1-review-packet*.xlsx'` returned no
  tracked files.
- `git log --all --full-history --name-only --format= -- tests/tqg/c2-private
  '*WORK1-review-packet*.xlsx'` returned no historical paths.
- The current private fixture directory and review spreadsheet remain
  untracked/local-only and must not be staged.

## Next authorized work

1. Verify `main` branch protection in GitHub Settings, because the local
   `gh` CLI is unavailable.
2. Keep Phase D1 contract wording aligned with the implemented D2-D5 evidence.
3. On a separate Phase 1 branch, improve browser/CDP diagnostics with bounded
   readiness retries and explicit failure categories.
4. Keep semantic accuracy `DEFERRED` until human reviewers produce and
   adjudicate the private gold repaired-target dataset.
