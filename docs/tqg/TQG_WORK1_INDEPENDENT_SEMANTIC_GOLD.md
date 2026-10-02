# TQG WORK 1 — Independent Semantic Gold / Repair Accuracy

**Status:** IMPLEMENTED — REVIEW INFRASTRUCTURE READY
**Scope:** Independent gold-target preparation and semantic repair measurement
**Core logic:** PROTECTED

## 1. Objective

WORK 1 closes the measurement gap left by C4: repair safety is already
validated, but semantic repair correctness has not been established against
independently adjudicated real-world targets.

This work therefore adds only the dataset preparation, review contract,
validator, and regression infrastructure required to measure semantic repair
accuracy once human adjudication exists.

It does not change the detector, Inspector, Repair algorithm, translation
engine, storage, Translation Job, recovery, batch, or Reader/PWA behavior.

## 2. Evidence rule

A target is not "gold" because TQG produced it.

The required evidence chain is:

    C2 production-derived case
        -> captured repair candidate
        -> independent human review
        -> adjudication
        -> canonical gold target
        -> acceptable equivalent targets
        -> offline semantic validation

The validator never calls an AI provider and never creates a gold target.

## 3. Locked dataset contract

Final private dataset:

    tests/tqg/c2-private/gold-repaired-targets.json

Required metadata:

    dataset = TQG-semantic-repair-gold
    schemaVersion = 1.0
    sourceDataset = TQG-C2-real-world-gold
    reviewPolicy.requiredStatus = GOLD_REVIEWED
    reviewPolicy.minimumIndependentReviewers >= 2
    reviewPolicy.independenceConfirmedRequired = true

Every case must retain:

    caseId
    sourceCaseId
    samplingBucket
    goldLabel
    expectedAction
    sourceText
    brokenTargetText
    glossaryText
    tqgSnapshot
    repairSpan
    candidateTargetText
    goldTargetText
    acceptableTargetTexts
    review
    adjudication
    contentHashes
    provenance

## 4. Expected actions

"REPAIR" is used only for bounded anomalies that the existing TQG-06 contract
can target.

"NO_REPAIR" is used for safety controls such as false positives, legitimate
foreign/technical content, and structural cases that are outside V1 repair
scope.

The "NO_REPAIR" controls are not counted as semantic repair matches. They
exist to prevent the review dataset from containing only successful repairs.

## 5. Review requirements

Each "REPAIR" case must be adjudicated by at least two independent reviewers.

The reviewers must explicitly confirm:

    anomalyConfirmed
    repairApproved
    anomalyRemoved
    meaningPreserved
    noNewMeaningChange

The canonical gold target must be included in acceptableTargetTexts.

Additional acceptable target strings are allowed only when independently
adjudicated as semantically equivalent.

No reviewer identity, chapter title, or other unnecessary personal identifier
is required by the dataset contract.

## 6. Preparation runner

scripts/tqg-work1-semantic-gold-prepare.mjs

The runner reads the private C2 dataset and creates:

    gold-repaired-targets.review-template.json

The default deterministic review set is:

    32 repair candidates
    16 safety controls
    48 cases total

Selection is deterministic and round-robin by the existing C2 sampling
buckets and case ID.

The runner replays the current deterministic TQG analyzer and requires the
current status and finding-code set to match the locked C2 snapshot.

The runner does not produce:

    candidateTargetText
    goldTargetText
    acceptableTargetTexts
    semantic review decisions

Those fields remain null/empty until actual review work is completed.

## 7. Semantic validator

scripts/tqg-work1-semantic-gold-validation.mjs

When the final private dataset is absent, the default result is:

    DEFERRED

Required mode is enabled with:

    TQG_REQUIRE_WORK1_GOLD=1

and then the missing dataset fails the gate.

For completed "REPAIR" cases, the validator checks:

    >= 2 independent reviewers
    explicit reviewer-independence confirmation
    explicit adjudication
    source/broken/candidate/gold content hashes
    bounded prefix/suffix preservation
    candidate vs canonical gold
    candidate vs acceptable gold set

It also reruns deterministic TQG on the candidate and gold target for
diagnostic evidence only.

## 8. Primary metric

Semantic repair accuracy is:

    acceptable gold matches / adjudicated REPAIR cases

Canonical exact-match rate is reported separately:

    canonical exact matches / adjudicated REPAIR cases

An acceptable semantic match is the primary metric because more than one
Thai rendering can preserve the same source meaning.

No quality threshold is invented by WORK 1. The work measures the observed
accuracy first; an acceptance threshold requires a later explicit gate.

## 9. Privacy boundary

The C2-derived review template and final gold dataset contain private /
production-derived text and remain under:

    /tests/tqg/c2-private/*.json
    /tests/tqg/c2-private/**/*.json

No production-derived text is committed by this work.

The public repository contains only the preparation/validation logic and
documentation.

## 10. Regression

tests/tqg/tqg-work1-semantic-gold-regression.mjs verifies:

    missing private C2 -> preparation fails closed
    missing final gold -> validator DEFERRED
    required missing final gold -> validator fails
    validator self-test -> PASS
    local C2 preparation -> deterministic 32/16 review template
    prepared cases cannot self-identify as GOLD_REVIEWED
    semantic target hashes are not fabricated

The regression is intended to run without private data in public CI.

## 11. Explicit non-goals

WORK 1 does not:

- tune detector thresholds
- alter TQG finding semantics
- alter Inspector prompts or verdict rules
- alter Repair prompts or boundaries
- add automatic whole-chapter repair
- reconstruct missing translation output
- change translation provider/model
- change translation prompts
- change IndexedDB
- change Translation Job or CAS/checkpoint logic
- change batch or recovery semantics
- add telemetry storage
- add a remote analytics service

## 12. Current status

Public code can now enforce the evidence contract, prepare a deterministic
private review set, and measure semantic repair accuracy without fabricating
gold evidence.

The actual real-world semantic repair accuracy remains:

    NOT ESTABLISHED / DEFERRED

until a gold-repaired-targets.json dataset has been independently reviewed
and adjudicated according to this contract.

## 13. Deep Review governance

WORK 1 follows the project-wide governance:

    Deep Review 1/3
        -> Deep Review 2/3
        -> Deep Review 3/3
        -> implementation validation
        -> Full Audit Round 4
        -> protected-core diff check
        -> commit

A gold dataset is never generated automatically and silently promoted to
production evidence.

## 14. Final WORK 1 boundary

Allowed files:

    scripts/tqg-work1-semantic-gold-prepare.mjs
    scripts/tqg-work1-semantic-gold-validation.mjs
    tests/tqg/tqg-work1-semantic-gold-regression.mjs
    docs/tqg/TQG_WORK1_INDEPENDENT_SEMANTIC_GOLD.md
    scripts/tqg-regression.mjs

Protected files include:

    tqg.js
    tqg-inspector.js
    tqg-repair.js
    tqg-integration.js
    tqg-ui.js
    storage-v2.js
    index.html
    sw.js

gold-repaired-targets.json itself is private runtime data and is never a
tracked public artifact.
