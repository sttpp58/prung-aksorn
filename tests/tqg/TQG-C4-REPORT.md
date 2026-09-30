# TQG C4 — Real-World Repair Validation

## Objective

C4 validates the existing TQG-06 targeted-repair path against real-world
production-derived source/target cases from the locked C2 gold dataset.

The validation target is repair safety and boundary behavior:
localized span handling, mandatory revalidation, fail-closed behavior,
original-output preservation on rejection, and protection against
whole-chapter repair scope.

C4 does not measure semantic translation quality because the dataset does
not contain independently adjudicated repaired targets.

## Locked scope

C4 changes only the TQG repair boundary and its validation coverage:

- `tqg-repair.js`
- `tests/tqg/tqg06-targeted-repair-regression.mjs`
- `scripts/tqg-c4-repair-validation.mjs`
- this report

Translation providers, prompts, translation jobs, storage/recovery,
Reader/PWA behavior, and completion-boundary semantics are unchanged.

## C4 finding before remediation

The repair module bounded replacement output to 1,000 characters and required
deterministic revalidation, but it did not impose an explicit maximum on the
suspicious span itself.

A large structural or quote finding could therefore reach repair transport
before revalidation. That is inconsistent with a strictly localized repair
contract.

## Remediation

Added `maxRepairSpanChars = 2000`.

`resolveRepairSpan()` now rejects spans larger than this bound before
building the repair request or invoking the injected AI transport.

The existing stale-span, bounded-replacement, revalidation, and original
output preservation rules remain unchanged.

## Real-world validation method

Dataset: locked C2 real-world gold set, 175 cases.

Positive repair candidates:
TRUE_ANOMALY + STRUCTURAL_ERROR + META/PROMPT_LEAK.

The validator located a gold-evidenced finding whose span matched the actual
deterministic analyzer output, then injected a deterministic placeholder
replacement through the existing transport interface.

The placeholder is synthetic. Therefore ACCEPTED means the repair pipeline
safely accepted the bounded candidate after revalidation; it does not mean
the replacement is semantically optimal.

Negative controls:
FALSE_POSITIVE + LEGITIMATE_FOREIGN + LEGITIMATE_TECHNICAL + OTHER.

Invalid-response mutation tests cover same-span, malformed JSON, and
oversized replacement behavior.## Execution result

| Check | Result |
|---|---:|
| Locked C2 cases | 175 |
| Real-world positive candidates matched | 97 |
| Bounded repair sample | 48 |
| ACCEPTED | 43 |
| REJECTED | 5 |
| Acceptance rate | 89.58% |
| Accepted repairs revalidated | 43/43 |
| Accepted repairs changed only bounded span | 43/43 |
| Rejected repairs preserved original output | 5/5 |
| Negative controls | 24 |
| Negative controls rejected before transport | 24/24 |
| Mutation tests | 18 |
| Mutation tests fail-closed | 18/18 |

The 5 bounded-sample rejections were caused by revalidation detecting
remaining findings or changed findings outside the repaired region.
This is an intentional safety outcome, not an automatic repair failure.

## Oversized-span safety gate

The real-world corpus exercised the new guard with:

- Case: C2-055
- Finding: QUOTE_ANOMALY
- Finding span: 9,565 characters
- Maximum allowed repair span: 2,000 characters
- Result: ERROR
- Accepted: false
- AI transport calls: 0
- Original output preserved: true## Regression gates

Passed in the isolated verification worktree:

- JavaScript syntax check
- TQG-06 Targeted Repair regression
- C4 Real-World Repair Validation
- C2 Real-World Gold Dataset validation
- full TQG regression suite

C4 result digest:
`7ef94a77dbf9043303c25d76f96a03807f100b97de25b5bf1042a64dcab14dcb`

## Deep Review 1 — Correctness

PASS.

Verified that the remediation is limited to suspicious-span validation,
does not modify analyzer semantics, and does not alter translation/storage
or job lifecycle code.

TQG-06 regression passed after adding an explicit oversized-span assertion.## Deep Review 2 — Real-world behavior

PASS.

Replayed all 175 C2 cases through the current analyzer, matched 97 positive
real-world findings, and exercised 48 bounded repairs.

All accepted cases were revalidated. All rejected cases preserved the
original output. Negative controls did not reach transport, and malformed
or oversized replacement responses failed closed.

## Deep Review 3 — Release and scope

PASS.

The intended release change set is restricted to the four C4 files listed
in the locked scope.

The private C2 source/target corpus remains gitignored and untracked.
The C4 script and report contain no production-derived chapter text.

Protected translation, provider, storage, job-recovery, Reader/PWA, and
pre-completion integration code are not part of C4.## Limitations

C4 is a repair-boundary validation, not a semantic repair-quality benchmark.
No independently produced gold repaired target exists in C2, so this report
does not claim correction accuracy or human approval of the synthetic
replacements.

The C4 run used no separate production glossary file. This does not invalidate
repair safety checks, but exact detector parity with the C2 snapshot may differ
where glossary exceptions matter.

## C4 status

**PASS WITH LIMITATION**

No P0/P1 safety blocker was found in the targeted-repair path. The remaining
limitation is measurement of semantic repair quality, which is deferred to a
future gold-repaired dataset rather than changing repair/core logic here.
