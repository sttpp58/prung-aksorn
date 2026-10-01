# Backup / Restore Real-world Validation — Stage 4

## Scope

Stage 4 validates the existing Backup V2 / Restore path through a real Chromium
browser and the visible application UI.

The validation does not redesign backup format, IndexedDB schema, persistence
architecture, or translation/TQG logic.

## Real-world validation matrix

| ID | Scenario | Required evidence |
| --- | --- | --- |
| BR-01 | Export + full restore round-trip | Real downloaded JSON, independent checksum validation, state replacement, Book drafts, visible history/result, completed Translation Job |
| BR-02 | Corrupted backup | SHA-256 integrity rejection before restore, current state remains unchanged |
| BR-03 | Repeated restore + reload | Two restore cycles against mutation states, then browser reload with restored draft persistence |

## Artifact checks

BR-01 validates the artifact written by the actual Backup UI path:

- Backup V2 format and schema 2
- SHA-256 metadata
- checksum independently recomputed by Node.js
- Projects and both Books are present
- completed Translation Job is present
- browser-only API credential is absent
- no `apiKey` field is persisted

## Restore checks

The test supplies the downloaded JSON through the real hidden file input and
drives the existing confirmation dialog.

A valid restore must replace a deliberately mutated project state while
preserving the original project, both books, Book B draft/title, visible Book A
history/result, and the completed Translation Job.

A checksum-corrupted backup must be rejected before restore and must leave both
the original state and a deliberately added mutation project untouched.

## Browser isolation

The harness uses:

- clean temporary Chromium profile
- local HTTP origin
- real UI controls
- actual file download directory
- actual file input boundary
- no real AI provider request
- no expected cross-origin dependency

Uncaught browser exceptions and console errors fail the scenario.

## Explicitly out of scope

- Backup format redesign
- IndexedDB schema/version changes
- Translation algorithm changes
- TQG detector/Inspector/Repair semantic changes
- Translation Job state-machine redesign
- Large-scale quota exhaustion testing
- Cross-device synchronization
- Cloud backup
- Historical Git artifact remediation

## CI

`.github/workflows/backup-restore-real-world.yml` runs the dedicated Stage 4
matrix on pull requests and pushes to `main`.

The canonical command is:

`node tests/e2e/backup-restore-real-world.mjs`
