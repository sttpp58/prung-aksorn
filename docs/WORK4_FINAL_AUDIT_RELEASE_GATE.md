# WORK 4 — Final Audit / Release Gate

**Status:** IMPLEMENTED — ENGINEERING GATE DEFINED
**Scope:** Final repository audit and release gate for the current Prung Aksorn
release candidate line.
**Core-logic policy:** no new runtime/translation/storage semantic change.

## 1. Purpose

WORK 4 is the final engineering gate after the completed hardening sequence.

It does not introduce a new translation feature. It verifies that the release
candidate contains the required evidence from:

- WORK 1 — independent semantic-gold infrastructure
- WORK 2 — evidence-based detector hardening
- WORK 3 — production browser assurance
- existing backup/restore validation
- failure-injection validation
- Translation Job recovery stress
- TQG-09 regression and C5 Phase C audit
- repository security and hygiene checks

The gate is intended to run on pull requests and on main.

## 2. Final gate decision model

WORK 4 distinguishes engineering readiness from semantic-evaluation evidence.

The engineering gate may pass with the following explicit limitation:

    Engineering Release Gate: PASS WITH LIMITATION

The limitation remains:

    Semantic repair accuracy remains DEFERRED.

The gate must fail closed if the limitation is removed without a genuine,
independently reviewed real-world gold repaired-target dataset.

Synthetic repair fixtures are never promoted into a real-world semantic
accuracy claim.

## 3. Deep Review governance

This WORK 4 change follows the repository governance sequence:

### Deep Review 1
Audit roadmap, current branch, prior evidence, protected boundaries,
release-gate architecture, and known limitations.

### Deep Review 2
Audit the proposed gate for coverage, fail-closed behavior, workflow security,
private-data handling, and avoidance of duplicate/conflicting gate semantics.

### Deep Review 3
Implement the smallest release-gate surface and verify every assertion against
the actual repository structure and existing test contracts.

### Deep Review 4
Re-run the gate, all required E2E/regression suites, inspect the diff, compare
protected files with the main baseline, and audit repository hygiene.

### Full Audit Round 5
Final staged-diff review, syntax review, action-pin review, secret scan,
private-artifact review, regression/E2E re-run, branch/state verification, and
remote commit verification.

Commit is blocked until Round 5 passes.

## 4. Release gate coverage

The gate verifies:

| Area | Required evidence |
| --- | --- |
| TQG runtime | TQG-09 regression |
| TQG C5 | Phase C final audit |
| WORK 1 | semantic-gold infrastructure + regression |
| WORK 2 | effectiveness audit + regression |
| WORK 3 | real Chromium production assurance |
| Browser reliability | Browser E2E |
| Fault handling | Failure Injection Matrix |
| Backup | Backup / Restore Real-world Validation |
| Recovery | Translation Job Recovery Stress |
| Public corpus | sanitized/synthetic-only constraints |
| Privacy | no tracked private C2 or user backup JSON |
| Security | secret-pattern scan |
| CI | immutable action SHA checks |
| Protected core | byte-identical protected files, except the explicitly allowlisted TQG integration bugfix |
| Syntax | Node syntax validation |
| Hygiene | diff --check |

## 5. Protected core

WORK 4 does not authorize changes to:

- translation engine or prompts;
- model/provider selection;
- IndexedDB schema;
- storage-v2.js semantics;
- Translation Job state machine;
- revision/CAS/checkpoint semantics;
- recovery semantics;
- batch semantics;
- TQG Inspector semantics;
- TQG Repair semantics.

The release gate compares protected file Git blobs to the resolved release base. For pull requests, the base is the first parent of GitHub’s synthetic merge checkout, which remains available with shallow checkout; locally it uses `main` and falls back to `origin/main` or `HEAD`. The only exception is `tqg-integration.js`, where the gate permits exactly one approved transformation: forwarding `input.exceptions` into the deterministic analyzer. Any other byte drift fails the gate.

    storage-v2.js
    sw.js
    tqg-inspector.js
    tqg-repair.js
    tqg-integration.js
    tqg-ui.js

No protected blob drift is accepted outside that exact allowlisted bugfix.

## 6. Required CI policy

Every release-bound workflow must:

- target pull requests and main;
- request read-only repository contents permission;
- pin every GitHub Action to a full 40-character commit SHA.

WORK 4 audits all existing release-bound workflows, not only the new workflow.

The final workflow is:

    .github/workflows/release-gate.yml

It installs a Chromium-family browser only when the runner lacks one and then
executes:

    node scripts/work4-final-audit-release-gate.mjs

No production API key or repository secret is required.

## 7. Runtime-data boundary

The gate fails if tracked runtime/user backups or private C2 corpus files are
present.

It also scans the tracked release surface for common API/token patterns.

Ignored private evidence may remain local, but it is not part of the public
release artifact.

## 8. Direct evidence re-run

WORK 4 directly re-runs the existing audit layers rather than relying only on
static file presence:

    TQG C5 Phase C Final Audit
    WORK 1 semantic-gold validation
    WORK 2 effectiveness audit
    TQG semantic/gold-target validation
    Repository Regression Gate
    TQG-09 Regression
    WORK 1 regression
    WORK 2 regression
    TQG Production Assurance
    Browser E2E
    Failure Injection
    Backup / Restore Real-world Validation
    Translation Job Recovery Stress

## 9. Failure conditions

The final release gate fails on:

- missing required audit/test/document artifacts;
- release-bound workflow without immutable action pins;
- write-capable CI permission where read-only is required;
- tracked backup/user JSON;
- tracked private C2 corpus;
- secret-pattern hit;
- protected-core byte drift outside the exact allowlisted TQG integration bugfix;
- syntax failure;
- whitespace error;
- regression failure;
- E2E failure;
- recovery/failure-injection failure;
- missing Work 3 browser assurance;
- unsupported semantic accuracy claim;
- missing explicit semantic limitation;
- missing WORK 4 release-gate artifacts or non-reproducible release evidence.

## 10. Explicit non-claims

WORK 4 does not claim:

- human-level translation quality;
- universal anomaly detection;
- universal false-negative elimination;
- semantic equivalence of repaired translations;
- real-world semantic repair accuracy;
- automatic reconstruction of missing output;
- whole-chapter automatic repair safety;
- correctness for every domain, novel, or writing style.

## 11. Evidence boundary

The current repository evidence supports an engineering release gate with an
explicit semantic limitation.

WORK 1 establishes the process for obtaining independent real-world repair gold.
WORK 2 improves deterministic repeat-text effectiveness without changing the
locked finding contract.
WORK 3 proves the TQG completion boundary in a real Chromium browser.

The missing real-world gold repaired-target dataset remains a stated evidence
gap, not an implied pass.

## 12. Exit criteria

    Deep Review 1                         PASS
    Deep Review 2                         PASS
    Deep Review 3                         PASS
    Deep Review 4                         PASS
    Full Audit Round 5                   PASS

    Repository Regression Gate            PASS
    TQG-09 Regression                    PASS
    Browser E2E                          PASS
    Failure Injection                    PASS
    Backup / Restore                     PASS
    Translation Job Recovery Stress      PASS
    TQG Production Assurance             PASS
    Protected-core integrity             PASS
    CI action-pin integrity              PASS
    Secret scan                          PASS
    Private artifact tracking            PASS
    Semantic limitation preserved        PASS

## 13. Release state

**Engineering Release Gate:** PASS WITH LIMITATION

**Semantic repair accuracy:** DEFERRED

The release gate is an engineering-safety/reproducibility gate. It is not a
substitute for the missing independently adjudicated semantic repair dataset.
