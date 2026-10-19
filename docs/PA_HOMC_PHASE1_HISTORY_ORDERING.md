# PA-HOMC-01 — Phase 1 History Ordering Implementation Notes

- **Baseline:** `f582b8e2423227ab27a9fd3cffedecb9eb606c8d`
- **Work branch:** `feature/pa-homc-phase1-history-ordering`
- **Scope:** PA-HOMC-01, Work Package A — History Ordering
- **Status:** Implementation candidate; review and browser-level acceptance still required.

## Implemented in this work branch

- Added explicit position indicators and move-up / move-down controls to the active book history list.
- Added HTML drag-and-drop reordering for pointer-capable browsers. The buttons remain the keyboard/mobile fallback.
- Reordering moves existing entry objects in the active book array. It does not recreate entries or rewrite their IDs, timestamps, labels, input/output, or parent references.
- The reorder action calls the existing save scheduler and awaits its existing flush function. A failed flush restores the previous in-memory order and reports the failure.
- Reordering is disabled while the history search is non-empty, because the filtered DOM is not the complete backing array.
- Reordering is blocked when the active book has a Batch job in pending, running, paused, or failed state, and fails closed if Batch job state cannot be checked.
- The action rechecks the selected project/book after the asynchronous job-state read to avoid applying the move to a different active book.
- A save-in-flight guard prevents concurrent reorder requests from racing one another.
- If the book already has `readerScrollPos`, a successful reorder resets that pixel offset to zero; a failed save restores the prior value. Reader content/TOC synchronization remains in Phase 2.

## Data and scope invariants

- `book.history` remains the source of Reading Order.
- Existing storage normalization maps array positions to `chapterNumber`; no IndexedDB schema/version changes are introduced.
- No translation algorithm, prompt, model selection, chunking, retry/resume logic, Translation Job State Machine, Batch recovery algorithm, or export algorithm was changed.
- This phase does not implement Missing Chapter gap detection or alter Reader Mode / DOCX / EPUB behavior; those are separate work packages.

## Regression coverage added

`tests/pa-homc-phase1-history-ordering.mjs` checks:
- Arbitrary array movement and rejection of invalid/no-op moves.
- Preservation of entry object identity and key history fields.
- Existing storage normalization mapping custom array order to chapter numbers.
- Presence of search, Batch recovery, persistence-failure and explicit-position guards.

The test is called by `scripts/regression-gate.mjs`.

## Evidence boundary / remaining acceptance work

The focused regression covers the reorder helper and storage normalization; the real-browser E2E runner exercises move-up/down, drag-and-drop, filtered-search blocking, multi-book isolation, failed-Batch blocking, completed-Batch compatibility, injected persistence failure/rollback, metadata preservation, and order persistence after reload. Before merging this work package, still verify:
1. Test keyboard-only operation and verify the reader scroll reset behavior in a visible Reader Mode session.
2. Confirm backup/restore round-trip order as part of the Phase 2/overall acceptance gates.

Reader Mode content/TOC, sidebar preview semantics, DOCX/EPUB order, and Backup/Restore custom-order round-trip are acceptance gates for Phase 2 and the overall PA-HOMC-01 scope; passing this Phase 1 regression alone does not close them.

## Deep Review Record

### Round 1 — Data model and write-path review: PASS
- The reorder helper moves existing object references in `book.history`; it does not recreate history entries.
- Stable IDs, timestamps, labels, source/output content, and parent references are covered by focused and browser regression assertions.
- Existing normalization/hydration order mapping was verified from `chapterNumber`; no schema or storage-adapter code was changed.

### Round 2 — UI, search and selected-book review: PASS
- Up/down buttons provide the non-drag interaction path and expose an explicit position indicator.
- Drag-and-drop is supported where available; reorder controls and dragging are disabled while search filters the list.
- Browser E2E verifies Book B history remains unchanged while Book A is reordered, and verifies the order survives reload.

### Round 3 — Persistence and Batch-recovery review: PASS WITH GUARDRAILS
- The move waits for the existing save flush and restores the previous order when persistence fails; browser E2E injects a save failure and verifies rollback.
- Reordering fails closed while a Batch job is pending/running/paused/failed, and the browser E2E verifies failed-job blocking and completed-job compatibility.
- Concurrent reorder attempts are guarded. Existing Batch recovery and Translation Job State Machine code remain unchanged.
- The stored reader pixel offset is reset on successful reorder and restored on save failure; a dedicated visible Reader Mode scroll test remains outstanding.

### Round 4 — Full Audit: PASS WITH PHASE 2 ACCEPTANCE GATES
- `node tests/pa-homc-phase1-history-ordering.mjs`: PASS.
- `node tests/e2e/browser-real-user-scenario.mjs`: PASS in real Chromium, including button reorder, drag-and-drop, filtered-search blocking, Batch guard, save-failure rollback, selected-book isolation, and reload persistence.
- `node tests/e2e/browser-e2e-lifecycle.mjs`: PASS.
- `node scripts/regression-gate.mjs`: PASS.
- `git diff --check` with CRLF-aware whitespace validation: PASS.
- Scope review found no changes to translation core, job state machine, IndexedDB schema, TQG, OCR, or export algorithms.
- Remaining overall-scope gates are intentionally deferred to Phase 2: Reader Mode/TOC, sidebar preview semantics, DOCX/EPUB ordering and backup/restore order round-trip. Phase 1 is not a claim that PA-HOMC-01 as a whole is complete.
