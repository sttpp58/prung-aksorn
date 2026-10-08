# TQG Documentation

เอกสารของ **Translation Quality Guard (TQG)** ถูกจัดเก็บรวมไว้ที่นี่เพื่อแยกเอกสารวิศวกรรมออกจาก root ของ repository

## Scope

- [TQG Scope](TQG_SCOPE.md)

## Phase C — Quality / Repair

- [Phase C Final Audit](TQG_PHASE_C_FINAL_AUDIT.md)

## WORK 1 — Independent Semantic Gold / Repair Accuracy

- [WORK 1 Contract](TQG_WORK1_INDEPENDENT_SEMANTIC_GOLD.md)

## WORK 2 — Evidence-Based Effectiveness Hardening

- [WORK 2 Hardening](TQG_WORK2_EFFECTIVENESS_HARDENING.md)

## WORK 3 — Production Assurance

- [WORK 3 Production Assurance](TQG_WORK3_PRODUCTION_ASSURANCE.md)

## Phase D — Observability / Operations

- [Observability Contract](TQG_PHASE_D_OBSERVABILITY_CONTRACT.md)
- [D3 Privacy & Cost Guard](TQG_PHASE_D3_PRIVACY_COST_GUARD.md)
- [D4 Telemetry Isolation](TQG_PHASE_D4_TELEMETRY_ISOLATION.md)
- [D5 Performance & Regression](TQG_PHASE_D5_PERFORMANCE_REGRESSION.md)

## Current release status

The repository reports two independent release dimensions and must not collapse
them into one status:

- **Engineering Gate: PASS** — the existing release-gate scripts and regression
  suite pass their engineering-safety checks. Local browser assurance may still
  be unavailable when Chrome/CDP cannot expose its DevTools endpoint.
- **Semantic Accuracy: DEFERRED** — no independently reviewed and adjudicated
  real-world gold repaired-target dataset is available to make this claim.

The complete evidence mapping, including baseline execution results and
environment limitations, is recorded in
[STATUS_EVIDENCE_MATRIX.md](STATUS_EVIDENCE_MATRIX.md).

## Repository structure

- Runtime TQG modules remain at repository root because `index.html` and `sw.js` load them as application assets.
- TQG regression tests remain under `tests/tqg/`.
- TQG engineering documentation belongs under `docs/tqg/`.

> This directory is documentation-only. No translation, storage, recovery, TQG detector, Inspector, Repair, or batch runtime logic is defined here.
