# Repository Governance — Prung Aksorn

This document defines the repository-level governance baseline for the `main` branch.

## 1. Protected branch policy

`main` is the production/deployment branch and should be protected with these GitHub settings:

- Require pull requests before merging.
- Do not allow direct pushes to `main`.
- Require the `regression-gate` status check before merge.
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Do not allow force pushes.
- Do not allow branch deletion.
- Enforce the rules for repository administrators; there should be no administrator bypass for normal changes.
- Do not allow actors to bypass the required pull request.
- Do not require signed commits or linear history at this stage; enabling either would change the current contribution/merge model and is outside the locked STEP 9.4 scope.
- Pull-request approval is intentionally not mandatory while this repository has a single maintainer. Once a second maintainer/reviewer exists, require at least one approving review.

## 2. Merge policy

Normal flow:

`feature branch → pull request → Regression Gate → review (when applicable) → merge → delete feature branch`

A change should not be treated as release-ready merely because a post-merge check on `main` succeeds. The required check must protect the pull request before the merge.

## 3. CI governance

The Regression Gate workflow is the mandatory repository validation layer for application changes.

Workflow requirements:

- Least-privilege workflow permissions.
- Actions referenced by immutable commit SHA.
- No secrets are required by the regression gate.
- Changes to workflow policy itself must go through the same pull-request path as application changes.

## 4. Scope control

Changes must remain within the explicitly approved roadmap step.

For maintenance work:

- Do not modify application/core logic merely to satisfy repository governance.
- Record unrelated findings separately rather than expanding the current change.
- Preserve the existing backup/restore and translation-job architecture unless a later roadmap step explicitly unlocks a change.

## 5. Repository hygiene

- User/runtime backup JSON must not be committed.
- Merged feature branches should be deleted.
- Historical executable artifacts must not be restored into the public repository unless explicitly required by the current release.
- Repository documentation must not make absolute security/privacy claims that the implementation cannot substantiate.

## 6. STEP 9.4 verification requirement

STEP 9.4 is considered complete only when the GitHub repository settings confirm the protection policy above is actually enforced on `main`.

A documentation file alone is not enforcement.
