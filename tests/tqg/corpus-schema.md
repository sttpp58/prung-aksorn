# TQG-01 — Public Test Corpus Schema

## Purpose

This directory contains the public, sanitized regression corpus for TQG V1.

The corpus is intentionally created **before** the production detector. It defines expected behavior without implementing the detector.

## Files

- `corpus-public.json` — labeled public regression cases.
- `corpus-schema.md` — schema and validation contract.

No private novel text, full copyrighted chapter, user backup, API key, or runtime history belongs in this directory.

## Corpus Object

Top-level fields:

| Field | Type | Requirement |
|---|---|---|
| `schemaVersion` | string | Required |
| `corpusVersion` | string | Required |
| `project` | string | Required |
| `phase` | string | Must be `TQG-01` |
| `corpusType` | string | Must be `public-sanitized` |
| `languageTarget` | string | V1 target is `th-TH` |
| `caseCount` | integer | Must equal `cases.length` |
| `categoryCounts` | object | Must equal computed category counts |
| `expectedStatusCounts` | object | Must equal computed status counts |
| `policy` | object | Required |
| `cases` | array | Required, currently 120 cases |

## Case Object

Each case contains:

| Field | Type | Requirement |
|---|---|---|
| `id` | string | Unique, stable |
| `category` | string | Controlled test category |
| `sourceText` | string | Minimal synthetic source fixture |
| `targetText` | string | Candidate Thai translation/output |
| `glossaryText` | string | Empty when not applicable |
| `expected` | object | Required expected behavior |
| `evidence` | string[] | Why the expected label is defensible |
| `repair` | object/null | Repair fixture when applicable |
| `safety` | object | Public-corpus safety flags |

## Expected Status

Allowed TQG statuses:

- `PASS`
- `REVIEW`
- `HIGH_SUSPICION`

The corpus intentionally does **not** use a numeric quality score.

## Finding Codes

TQG-01 defines the expected finding vocabulary for TQG-02:

- `FOREIGN_SCRIPT_SPAN`
- `SOURCE_LANGUAGE_RESIDUE`
- `SOURCE_TEXT_OVERLAP`
- `MIXED_LANGUAGE_SPAN`
- `PROMPT_LEAKAGE`
- `REPEATED_TEXT`
- `STRUCTURAL_TRUNCATION`
- `PARAGRAPH_LOSS`
- `QUOTE_ANOMALY`
- `PUA_OR_REPLACEMENT_CHAR`

TQG-01 does not require every finding to have exact character offsets yet. TQG-02 may add computed offsets while preserving the stable case IDs and semantic labels.

## Inspector Expectation

Allowed values:

- `NOT_REQUIRED`
- `TRUE_ANOMALY`
- `FALSE_POSITIVE`
- `UNCERTAIN`

These values are test expectations for later phases; no AI calls are made in TQG-01.

## Repair Expectation

For repair cases:

- `repair.targetText` is the pre-repair target.
- `repair.replacementText` is the bounded replacement expected for the flagged span.
- `repair.expectedTarget` is the intended post-repair target.

TQG-02/05/06 may evolve the exact repair mechanism, but the principle is fixed: repair must be localized.

## Required Coverage

The current corpus contains 120 cases across these categories:

- clean
- legitimate foreign name
- legitimate foreign term
- glossary exception
- source-language residue
- mixed-language contamination
- full source copy
- structural truncation
- paragraph loss
- repeated text
- prompt/meta leakage
- PUA anomaly
- quote anomaly
- targeted repair

Coverage is intentionally biased toward negative controls for foreign text, because false positives on names/terms are a primary TQG risk.

## Public Safety Rules

A public corpus case must satisfy:

- `publicSafe === true`
- `syntheticOrMinimal === true`
- `copyrightedFullText === false`

No corpus case may contain:

- user backup data
- private translation history
- API credentials
- full copyrighted chapters
- identifying user data

## Phase 1 Boundary

TQG-01 MUST NOT:

- add production detector code
- add AI inspection code
- add repair code
- change translation prompts
- change AI providers/models
- modify `storage-v2.js`
- modify Translation Job checkpoint/recovery logic
- modify batch architecture
- modify Reader/PWA behavior

The next phase is TQG-02 — Deterministic Detector.
