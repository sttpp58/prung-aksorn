# PA-HOMC-01 — Phase 0: Baseline & Impact Audit

**Project:** Prung Aksorn  
**Scope:** History Ordering & Missing Chapter Workflow  
**Scope authority:** PA-HOMC-01 Scope Lock  
**Audit date:** 2026-10-19  
**Repository:** https://github.com/sttpp58/prung-aksorn  
**Baseline branch:** main  
**Baseline commit:** f582b8e2423227ab27a9fd3cffedecb9eb606c8d  
**Phase result:** PASS WITH IMPLEMENTATION GUARDRAILS  
**Runtime code changed:** No — this Phase 0 change is audit documentation only.

## 1. Executive Summary

The existing data model can support a user-controlled reading order without adding an IndexedDB schema or changing translation logic. The logical source of order is the sequence in a book's history array. During persistence normalization, the array index is converted into a chapterNumber; hydration reconstructs the array sorted by that number. Therefore, reordering the existing history array and passing it through the existing save path is the smallest viable implementation model.

The affected surface is broader than the history list itself. Sidebar previews, history browsing, Reader Mode content and TOC, DOCX/EPUB export, consistency analysis, glossary-mining examples, backup/restore, and batch-job recovery all interact with ordered history data.

Phase 0 identifies no blocker to proceeding to Phase 1, provided its implementation respects the guardrails and the high-priority batch-recovery interaction below. No application code, translation algorithm, Translation Job State Machine, or IndexedDB schema was changed.

## 2. Baseline Snapshot and Evidence

### 2.1 Repository state

The default branch was main at commit f582b8e2423227ab27a9fd3cffedecb9eb606c8d (merge of PR #52, dated 2026-10-09). The baseline CI workflows associated with this commit reported success; see Section 8. Those statuses describe the existing baseline only, not the new feature.

### 2.2 Logical history data model

- The active-book history accessor returns book.history when a book is active, with the legacy proj.history fallback: [app/01-shell-context-history.js, lines 252–255](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/01-shell-context-history.js#L252-L255).
- A history entry contains a stable ID and fields such as timestamp, label, input and output. The single-translation completion path appends a new entry to the active book: [app/12-translation-core.js, lines 238–242](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/12-translation-core.js#L238-L242).
- Batch translation also appends entries: [app/13-batch.js, lines 75–78](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/13-batch.js#L75-L78).
- Saving a revised output creates a separate history entry with its own ID and a parentId reference where applicable: [app/10-ocr-chunking.js, lines 150–164](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/10-ocr-chunking.js#L150-L164).
- The current model is append-oriented. No explicit user-controlled reading-order field is required for the proposed initial implementation.

### 2.3 Persistence and migration

In storage-v2.js, the existing normalize function iterates books and each book's history in array order, converts each entry to a stored chapter record, and assigns chapterNumber = ci + 1. The hydrate function sorts chapter records by bookId and then chapterNumber, then rebuilds each book's history array. The save function diffs normalized chapter records by ID and content.

This means the existing storage representation already persists array order through chapterNumber. A reorder will change the positional chapterNumber values for affected entries on the normal save path while retaining chapter IDs and content. This is a code-path finding, not a runtime test of a newly implemented reorder.

Legacy initialization also preserves history arrays or transfers legacy project-level history into the initial book where books are missing: [app/03-storage-settings.js, lines 18–35](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/03-storage-settings.js#L18-L35). Phase 1 must not introduce a migration or schema-version change.

### 2.4 Persistent saves are asynchronous

The existing persistence UI schedules writes, flushes them after a delay and retries failed writes. commitChange() calls saveData() and then re-renders; it does not itself await durable completion: [app/03-storage-settings.js, lines 150–239 and 255–259](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/03-storage-settings.js#L150-L259).

A reorder action must not report “saved” based solely on an in-memory array mutation. It must use the existing persistence path and expose the actual save status. Do not replace the IndexedDB engine as part of this feature.

## 3. History Producers and Recovery Interactions

| Producer / path | Current behavior | Phase 1 constraint |
|---|---|---|
| Single translation | Appends a completed history entry | Keep translation and checkpoint logic unchanged; the new entry may initially append and then be moved manually |
| Batch translation | Appends a completed entry | Do not change batch execution or job state transitions |
| Save revised output | Creates a separate entry and may link to its parent through parentId | Reordering must preserve entry IDs and parent references |
| Translation Job recovery / retry | Recreates a missing history entry only when needed, then commits the change | Keep the existing recovery behavior intact |
| Batch history restoration | restoreBatchHistoryOrder uses Batch Job batchIndex to reorder Batch entries within history slots after recovery/retry | **High-priority conflict to guard against; see Finding H-01** |

Relevant source:
- [app/05-dialog-ai-core.js, lines 108–144](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/05-dialog-ai-core.js#L108-L144)
- [app/02-translation-recovery.js, lines 319–332 and 465–478](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/02-translation-recovery.js#L319-L332)
- [app/11-ai-providers-recovery-state.js, lines 165–168](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/11-ai-providers-recovery-state.js#L165-L168)

Do not modify Translation Job State Machine semantics or batch recovery ordering as an incidental part of History Ordering.

## 4. Reading-Order Consumers

The following consumers currently use the underlying array order rather than sorting by timestamp or parsed chapter number:

| Consumer | Current source behavior | Impact |
|---|---|---|
| Bottom history panel | Iterates getActiveHistoryList(proj) | Direct display should follow the reordered array |
| Project sidebar history preview | Takes the last eight array entries | After manual ordering, this means the final eight entries in reading order, not necessarily the eight most recently translated |
| Reader Mode and TOC | Iterates book.history and generates TOC positions from array index | Content and TOC should naturally follow the reordered array; persisted scroll position needs an explicit policy |
| DOCX export | Iterates the active history list | Exported chapter sequence follows array order |
| EPUB export and spine / TOC | Iterates the active history list to create chapter files and navigation | EPUB sequence follows array order |
| Cross-chapter consistency analysis | Builds tagged input by iterating the active history list | Input order changes with reading order; confirm this is intended, but do not rewrite analysis semantics |
| Whole-book glossary mining | Maps the active history list; reference-book sampling uses the first ten entries | Samples will be drawn in reading order after reordering; do not change prompts or glossary logic |

Evidence:
- Bottom panel: [app/01-shell-context-history.js, lines 257–295](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/01-shell-context-history.js#L257-L295)
- Sidebar preview: [app/06-projects.js, lines 193–214 and 253–260](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/06-projects.js#L193-L214)
- Reader and TOC: [app/17-reader-mode.js, lines 1–27](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/17-reader-mode.js#L1-L27)
- DOCX, EPUB and consistency analysis: [app/14-export.js, lines 74–120, 156–214 and 232–254](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/14-export.js)
- Glossary mining: [app/16-book-tools.js, lines 35–50 and 160–176](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/16-book-tools.js#L35-L50)

## 5. Findings and Required Guardrails

### H-01 — Batch recovery can overwrite manual order within a Batch group

**Severity:** High  
**Evidence:** restoreBatchHistoryOrder looks up Batch Job metadata and sorts matching history entries by batchIndex, then writes the reordered array back. It is called by Batch recovery/retry completion paths.

**Risk:** A user-controlled order applied to entries belonging to a Batch may be changed when an unfinished or failed Batch item is later recovered or retried. This would violate the user's explicit order without an intentional reorder action.

**Required mitigation within the locked Scope:**
- Do not change the State Machine or delete the restoration mechanism as a shortcut.
- In Phase 1, identify which history entries belong to Batch Jobs that can still be recovered/retried.
- Prevent conflicting manual reordering while the applicable Batch recovery path can still rewrite those entries, or establish an equally safe, tested guard that does not modify recovery semantics.
- Add a regression test proving that completing/retrying a Batch cannot silently overwrite a previously accepted user order.

### M-02 — Search-filtered history is a partial view of the underlying array

**Severity:** Medium  
**Evidence:** applyBottomHistorySearchFilter() hides DOM items based on the query; the backing history array remains complete.

**Risk:** A drag or up/down operation applied only to visible filtered items can place an entry at the wrong position relative to hidden entries if the visible index is treated as the array index.

**Required mitigation:** The safest initial UI behavior is to disable reorder controls while a search query is non-empty and explain why. An implementation may instead map by stable entry ID to the complete backing array, but it must have explicit tests. Never derive persisted positions from filtered DOM indexes alone.

### M-03 — Save scheduling is not the same as durable save completion

**Severity:** Medium  
**Evidence:** The existing save path is debounced and retries failures asynchronously.

**Risk:** The UI could reflect a reordered list even though the new order has not yet been written successfully.

**Required mitigation:** Use the existing storage path, await a flush or provide an awaitable result using existing save functions, and present accurate saved/failed state. Do not add a schema field or replace IndexedDB.

### M-04 — Reader scroll position is stored as a pixel offset

**Severity:** Medium  
**Evidence:** Reader Mode persists book.readerScrollPos and restores that offset when reopening: [app/17-reader-mode.js, lines 77–82](https://github.com/sttpp58/prung-aksorn/blob/f582b8e2423227ab27a9fd3cffedecb9eb606c8d/app/17-reader-mode.js#L77-L82).

**Risk:** Reordering chapters changes content heights and offsets. Reopening at the same pixel offset may land in a different chapter than before.

**Required mitigation:** Define and test the behavior when order changes. Do not silently claim that the old pixel position still identifies the same passage. Prefer preserving a chapter anchor if that can be done within the current data contract; otherwise deliberately reset to a known safe position after reorder. Do not introduce a schema change without approval.

### M-05 — Sidebar preview semantics change after manual ordering

**Severity:** Medium  
**Evidence:** The sidebar renders book.history.slice(startIdx) for the last eight array entries.

**Risk:** Once array order is Reading Order, the sidebar preview represents the final eight entries in the reading sequence, not the eight most recently translated chapters.

**Required mitigation:** Keep the displayed order consistent with Reading Order and clarify the preview label or helper text. Do not secretly re-sort the sidebar by timestamp, because that would make the same history list display different sequences in different areas.

### M-06 — Regression coverage does not yet prove custom order persistence

**Severity:** Medium  
**Evidence:** Existing browser and backup/restore scenarios check history availability after reload and restore, but no dedicated user-controlled history-order regression test was found in the inspected tests.

**Required mitigation:** Add ordering-specific assertions during implementation: order after save/reload, order after backup/restore, reader/TOC order, DOCX/EPUB order, filtered-search behavior, multi-book isolation, and interaction with Batch recovery.

### M-07 — Implicit display labels may depend on array position

**Severity:** Low  
**Evidence:** Some history views use positional fallback labels like “แปล 1” when an entry has no label.

**Risk:** A fallback display string may change after reorder even though the entry's stored ID, timestamp and content are unchanged.

**Required mitigation:** Never rewrite the stored label merely as a consequence of moving an entry. The existing fallback presentation can remain positional unless implementation tests expose a user-facing inconsistency.

## 6. Backup / Restore and Data Integrity

The storage backup path includes normalized chapter records, including their chapterNumber position. Restore writes normalized chapter records back to storage and verifies the restored content. This supports using the existing persistence representation for Reading Order without adding a separate order store.

However, existing backup/restore success does not, by itself, prove that a user-defined custom order round-trips correctly. The implementation must add a targeted test:

1. Create multiple history entries with known IDs.
2. Arrange them into a non-timestamp order.
3. Await durable save and reload.
4. Export a backup, restore it into the test app state, and verify the ordered sequence of IDs and chapter content.
5. Verify there are no missing/duplicate entries and every entry retains its ID and parent reference.

No production backup or restore is performed in Phase 0.

## 7. Locked Scope Compliance

### Allowed in Phase 1–3
- Add reorder UI to the existing history list.
- Move existing entry objects without reconstructing them.
- Persist array order through the existing storage normalization path.
- Ensure Reader Mode, TOC and exports consume the same order.
- Add relevant regression tests and documentation.
- Add advisory-only detection of possible numbering gaps, without automatic renaming or sorting.

### Explicitly out of scope
- Translation algorithm, prompts or model selection changes.
- Chunking, retry, resume, checkpoints or Translation Job State Machine changes.
- IndexedDB schema/version changes unless a separately approved Scope Change demonstrates necessity.
- Automatic sorting by parsed chapter number.
- Replacing, deleting or translating existing history entries as a side effect of reordering.
- Automatic downloading of source chapters from third-party novel sites.
- Unrelated TQG, OCR, glossary or UI enhancements.

### Data invariants
- Preserve entry IDs, timestamps, input/output content, labels and parent references during reorder.
- Do not use timestamps as the reading order after the user customizes the array.
- Keep order isolated to the selected book.
- Treat Translation Job identity as ID-based, not position-based.
- If an implementation must violate any invariant above, stop and request an explicit Scope Change.

## 8. Baseline CI Evidence

The following GitHub Actions runs on baseline commit f582b8e2423227ab27a9fd3cffedecb9eb606c8d completed successfully on 2026-10-09:

- [Regression Gate](https://github.com/sttpp58/prung-aksorn/actions/runs/37903092899)
- [Browser E2E](https://github.com/sttpp58/prung-aksorn/actions/runs/37903092901)
- [Backup Restore Real-world Validation](https://github.com/sttpp58/prung-aksorn/actions/runs/37903092884)
- [Translation Job Recovery Stress Test](https://github.com/sttpp58/prung-aksorn/actions/runs/37903092915)
- [Failure Injection](https://github.com/sttpp58/prung-aksorn/actions/runs/37903092858)
- [Final Audit / Release Gate](https://github.com/sttpp58/prung-aksorn/actions/runs/37903092900)
- [Pages build and deployment](https://github.com/sttpp58/prung-aksorn/actions/runs/37903091975)

These results establish that the existing baseline checks passed at that commit. They do not test the feature proposed in PA-HOMC-01.

## 9. Deep Review Record

### Round 1 — Data model and write-path review: PASS
- Confirmed the current history source is the active book's array with a legacy project-level fallback.
- Identified normal translation, Batch translation, revision saves and recovery/retry as history-writing paths.
- Confirmed normalization maps array position to chapterNumber and hydration rebuilds order from chapterNumber.
- Scope remains compatible with the existing schema and translation core.

### Round 2 — Read-path and UI impact review: PASS WITH FINDINGS
- Identified history display, sidebar preview, Reader Mode/TOC, DOCX/EPUB, consistency checks and glossary sampling as order consumers.
- Found sidebar last-eight semantics and pixel-based reader scroll behavior that need explicit handling.
- Confirmed search filtering creates a partial DOM view; filtered positions must not be persisted as full-array indexes.

### Round 3 — Recovery, persistence and test review: PASS WITH GUARDRAILS
- Found Batch recovery calls a helper that can reorder Batch entries by batchIndex.
- Confirmed save operations are asynchronous and can be retried after failure.
- Confirmed existing tests cover history persistence/access and backup/restore generally, but no dedicated custom-order regression was found.
- Recorded mitigation and regression requirements without changing runtime behavior.

### Round 4 — Full Audit: PASS WITH IMPLEMENTATION GUARDRAILS
- Cross-checked findings against the locked PA-HOMC-01 Scope Specification.
- Confirmed this Phase 0 deliverable changes documentation only.
- Confirmed no translation algorithm, prompt, model selection, Chunking logic, Translation Job State Machine or IndexedDB schema changes are part of the recommendation.
- Confirmed stable IDs and parent references are required invariants.
- All identified risks have an explicit mitigation or test requirement.
- Phase 1 may proceed after using this report as the baseline and carrying its guardrails forward.

## 10. Phase 0 Exit Criteria

| Criterion | Result |
|---|---|
| Baseline commit recorded | PASS |
| History data model traced through persistence | PASS |
| History producers and recovery interactions identified | PASS |
| Reader / TOC / DOCX / EPUB consumer impact mapped | PASS |
| Backup/restore ordering impact documented | PASS |
| Regression gap identified | PASS |
| Three Deep Review rounds documented | PASS |
| Fourth Full Audit documented | PASS |
| Runtime code and core logic unchanged | PASS |
| Open risks have implementation guardrails | PASS |

**Conclusion:** Phase 0 is complete as a baseline and impact audit. The next authorized work package is Phase 1 — History Ordering. This report does not authorize changes outside the locked Scope and does not itself implement or ship the feature.
