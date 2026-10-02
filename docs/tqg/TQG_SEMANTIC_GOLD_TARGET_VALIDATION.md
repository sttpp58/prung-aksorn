# TQG Semantic / Gold-target Validation

## Objective

Validate whether a targeted-repair candidate matches an independently specified gold target, and distinguish that evidence from the existing TQG safety/revalidation checks.

This stage does **not** change the translation engine, TQG detector, Inspector, Repair implementation, storage, Translation Job state machine, recovery, batch, or Reader/PWA behavior.

## Current evidence boundary

The repository contains six public targeted-repair fixtures with curated `expectedTarget` values: five positive gold-target contracts and one negative safety control. These fixtures are explicitly marked synthetic/minimal.

The environment used for this audit does **not** contain the private C2 real-world source/target corpus or an adjudicated gold-repaired-target dataset. Therefore:

- Public synthetic gold-target contract: VALIDATED.
- Real-world semantic repair accuracy: NOT CLAIMED / DEFERRED.
- No synthetic fixture is promoted to a real-world accuracy claim.

## Validation contract

### Public synthetic contract

Five safe positive repair fixtures are replayed:

- TQG-REPAIR-001
- TQG-REPAIR-002
- TQG-REPAIR-004
- TQG-REPAIR-005
- TQG-REPAIR-006

For each case the validator requires:

1. deterministic TQG produces a bounded repair candidate;
2. the existing Repair boundary accepts the candidate;
3. mandatory re-validation occurs;
4. the repaired output exactly matches the fixture `expectedTarget`;
5. a fresh TQG analysis of the gold target returns no findings.

`TQG-REPAIR-003` remains covered by TQG-06 as an intentionally unsafe duplicate-output case and is not counted as a positive semantic gold target.

### Real-world private replay contract

When `TQG_SEMANTIC_GOLD_DATASET` is supplied, the validator expects:

- `dataset = TQG-semantic-gold-repaired-targets`
- `version = 1`
- `sourceDataset = TQG-C2-real-world-gold`
- at least two independent reviewers;
- `review.status = GOLD_REVIEWED`;
- explicit adjudication for anomaly confirmation, anomaly removal, meaning preservation, and absence of new meaning change;
- source, broken-target, gold-target, and candidate-target content;
- SHA-256 content hashes;
- one or more adjudicated acceptable target strings.

The candidate target is then compared against the canonical and acceptable gold targets. The semantic gate passes only when every captured candidate matches at least one adjudicated acceptable target. A canonical exact match is reported separately. This is an offline replay of captured repair output; it does not call an AI provider.

## Results

Local execution:

    PUBLIC_SYNTHETIC_CONTRACT
    cases                  = 5
    canonicalGoldMatches   = 5/5
    cleanGoldTargets       = 5/5
    revalidatedAccepted    = 5/5

    REAL_WORLD_PRIVATE
    status                 = DEFERRED
    reason                 = private gold-repaired-target dataset unavailable

Contract-path self-tests:

    temporary positive private-shaped fixture = 1/1 accepted, 100% acceptable-gold match
    temporary negative mismatch fixture       = exit 1 (gate rejected the candidate)

These temporary fixtures were derived only from public synthetic data and were removed after validation; they are not a real-world semantic-accuracy result.

Validator digest from the deferred public run:

`61a12d79241b130298262bee81bfa71116e9f9d99aa3964d6ffce36aa0863747`

## Why the real-world gate remains deferred

C4 explicitly established that its synthetic replacement outputs are not a real-world semantic accuracy benchmark. Closing that limitation requires an actual gold-repaired-target dataset derived from the locked C2 real-world cases, with independent adjudication.

The validator intentionally fails closed on malformed private gold data, but treats an absent private dataset as `DEFERRED` so the public CI path remains safe and reproducible.

## Out of scope

- semantic translation evaluation for the whole translation engine;
- LLM-as-a-judge replacement for human gold adjudication;
- embedding similarity as a substitute for gold targets;
- automatic creation of gold targets;
- changes to TQG semantics;
- changes to Repair boundaries;
- production Translation Job/storage/recovery behavior;
- committing private/copyrighted C2 text to the public repository.

## Execution

    node --check scripts/tqg-semantic-gold-target-validation.mjs
    node scripts/tqg-semantic-gold-target-validation.mjs
