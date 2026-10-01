# Failure Injection — Stage 3

## Scope

Stage 3 validates failure handling through real browser execution while keeping
the translation/TQG architecture and IndexedDB schema unchanged.

The matrix deliberately injects faults at controlled boundaries instead of
changing production provider or storage implementations.

## Failure Matrix

| ID | Injected fault | Expected behavior |
| --- | --- | --- |
| FI-01 | OpenAI returns HTTP 500 twice, then 200 | Retry twice, recover, checkpoint and complete |
| FI-02 | OpenAI request rejects permanently | Exhaust retry budget, persist failed Job, expose resume |
| FI-03 | Provider request is in flight, user cancels | Abort cleanly, persist cancelled Job, no false failure |
| FI-04 | First two autosaves reject, then succeed | Retry, preserve newer draft, persist through reload |

## Test Architecture

The file tests/e2e/failure-injection.mjs is dependency-free and uses Node.js plus the
Chrome DevTools Protocol, matching the existing browser E2E boundary.

Each scenario uses a clean temporary browser profile, a local HTTP origin,
and the real application UI. AI calls are mocked in page context, so no real
provider credential or API request is used.

The harness records uncaught Runtime.exceptionThrown events and unexpected
browser console errors. Deliberately handled autosave diagnostics are allowed
only by an exact log-prefix exception. Unexpected cross-origin fetches are blocked
and recorded as a test failure.

## Production Fix Found by Failure Injection

FI-03 exposed a real cancellation race: the cancel button directly attempted a
Translation Job CAS update while runTranslation() also persisted cancellation
from its AbortError path. Both used the same revision, creating a revision
conflict that could become an uncaught browser runtime exception.

The minimal fix is for the cancel button to signal cancellation by aborting the
active controller and letting the operation owner persist the terminal Job
state. No translation, TQG, schema, or provider semantics were changed.

## CI

.github/workflows/failure-injection.yml runs the full matrix on pull requests
and pushes to main. Action references are pinned by commit SHA.

## Explicitly Out of Scope

- Translation algorithm changes
- TQG detector/inspector/repair semantic changes
- IndexedDB schema/version changes
- Backup/restore stress and rollback campaigns
- Translation Job recovery after browser restart/reload
- Large-chapter performance testing
- Architecture refactor
