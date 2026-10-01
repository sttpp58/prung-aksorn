# TQG Phase D3 — Privacy / Cost Guard

**Phase:** D3
**Contract:** `TQG-OBS-01`
**Status:** PASS — D3 Gate
**Repository:** `sttpp58/prung-aksorn`
**Baseline:** `ca25a59` — Phase D2 runtime instrumentation

## 1. Purpose

D3 hardens the D2 observation boundary against accidental content/secret
telemetry and malformed or excessive telemetry accounting.

The implementation is limited to the observability layer.

It does not redesign TQG detection, classification, Inspector, Repair,
re-validation, translation, storage, Translation Job, batch, or recovery
semantics.

## 2. Locked D3 Controls

D3 implements four controls:

1. Explicit rejection of forbidden telemetry keys.
2. Recursive detection of forbidden keys in nested payloads.
3. Bounds on AI/transport call counts and finding volume per event.
4. A maximum serialized telemetry-event size.

The controls operate before an event reaches a sink.

## 3. Privacy Deny-List

The normalized deny-list rejects content/secret-bearing keys including:

```
sourceText
targetText
translationText
translation
suspiciousText
fullFindingText
fullPrompt
systemPrompt
userPrompt
rawAIResponse
replacementText
glossaryText
glossaryContents
bookTitle
chapterTitle
chapterText
sourceChapter
userId
email
credentials
apiKey / API keys
authorization headers
cookies
session tokens
backup payloads
recovery payloads
```

Normalization is case-insensitive and removes whitespace, underscores, and
hyphens for comparison.

Nested objects are also scanned so a forbidden key cannot be hidden under a
generic metadata object.

## 4. Allow-List and Validation

D2 already defines an event allow-list.

D3 retains that model and additionally validates:

- event name
- schema version
- phase
- status
- context
- verdict
- finding codes
- finding count
- duration
- AI calls
- transport calls
- boolean result fields
- error class
- serialized event size

Any field outside the event contract is rejected.

Any forbidden field is rejected even if it is added after event construction.

## 5. Cost / Volume Guard

D3 applies these hard per-event limits:

```
MAX_OBSERVATION_EVENT_CHARS = 4096
MAX_AI_CALLS_PER_EVENT = 1
MAX_TRANSPORT_CALLS_PER_EVENT = 1
MAX_FINDINGS_PER_EVENT = 64
```

These limits prevent malformed telemetry from creating unbounded payload
volume or overstating per-operation AI/transport usage.

The guard does not create or trigger any AI operation.

## 6. AI / Transport Semantics

D3 preserves the D1 interpretation that counters report observed operation
counts rather than estimated token cost.

Current TQG Inspector and Repair integration paths expose one logical AI
invocation per operation.

D3 therefore rejects a per-event count greater than one rather than silently
clamping it to zero.

This is intentional: silent coercion would hide an accounting anomaly.

No prompt, response, provider key, authorization header, or token payload is
used for telemetry.

## 7. Event Size Guard

Before a compliant event is emitted, the observer validates its serialized
size.

```
JSON.stringify(event).length <= 4096
```

Serialization errors or an oversized event are treated as observer-layer
validation failures.

They must not alter the TQG decision.

## 8. Observer Isolation

The observer remains passive.

D3 requires:

```
observer failure
    |
    v
TQG result preserved
```

This applies to:

- synchronous observer exceptions
- asynchronous observer rejection
- malformed observer events
- telemetry validation failure

The observer must not initiate:

- translation
- Inspector
- Repair
- storage writes
- checkpoints
- recovery
- network work

## 9. Protected Boundaries

D3 does not modify:

```
tqg.js
tqg-inspector.js
tqg-repair.js
storage-v2.js
index.html
sw.js
```

The existing TQG integration module remains state-free and decoupled from
application persistence.

## 10. Required D3 Tests

The dedicated D3 regression verifies:

- every D1 forbidden key is rejected
- key normalization variants are rejected
- nested forbidden keys are rejected
- unknown event fields are rejected
- mismatched finding counts are rejected
- excessive AI calls are rejected
- excessive transport calls are rejected
- excessive finding count is rejected
- malformed timestamps are rejected
- event-size ceiling is enforced
- safe metadata-only events remain accepted
- private content markers never enter emitted telemetry
- asynchronous observer failure is isolated
- protected storage/network coupling remains absent

## 11. Regression Integration

D3 is registered in:

```
scripts/tqg-regression.mjs
```

The full regression sequence therefore includes:

```
TQG-03
TQG-04
TQG-05
TQG-06
TQG-07
TQG-08
D2 Observability
D3 Privacy / Cost Guard
C1 equivalence
```

The repository-level Regression Gate remains the final cross-system test.

## 12. Scope Decision

D3 does not authorize:

- telemetry database
- remote analytics backend
- persistent TQG event storage
- user tracking identifiers
- raw translation logging
- prompt/response logging
- AI model/provider changes
- detector tuning
- Repair changes
- storage redesign
- Translation Job changes

Those remain explicit scope-change candidates.

## 13. D3 Exit Criteria

D3 may be marked PASS when:

- [x] forbidden telemetry keys are actively rejected
- [x] nested forbidden keys are rejected
- [x] event allow-list remains enforced
- [x] AI call counts are bounded
- [x] transport call counts are bounded
- [x] finding volume is bounded
- [x] event size is bounded
- [x] no raw telemetry dump is introduced
- [x] async observer failure is isolated
- [x] D2 regression remains passing
- [x] protected core files remain unchanged
- [x] full regression gate remains passing
- [x] Deep Review 1/3 complete
- [x] Deep Review 2/3 complete
- [x] Deep Review 3/3 complete

## 14. Current Engineering Status

D3 implementation is complete at the code level.

The mandatory three-round deep review passed. The D3 commit gate is
authorized. Phase D itself remains open until D4 and D5 are completed.

## 15. Deep Review Record

### Review 1 — Correctness / Regression

Required checks:

- D1 field semantics preserved
- D2 event semantics preserved
- TQG result unchanged
- no duplicate lifecycle event introduced
- AI/transport counts are observed rather than silently fabricated
- re-validation remains authoritative

### Review 2 — Adversarial Privacy / Cost

Required checks:

- source/target content cannot enter event payload
- prompt/response cannot enter event payload
- secrets cannot enter event payload
- nested content keys are rejected
- oversized volume is rejected
- malformed counts are rejected
- observer exceptions/rejections cannot break TQG

### Review 3 — Scope / Release Integrity

Required checks:

- only D3-authorized files changed
- D1 contract is unchanged
- protected core hashes remain unchanged
- no storage or application-shell change
- no private C2 artifacts become tracked
- full regression gate passes
- branch/main topology remains safe

## 16. Final Decision Template

```
D3 Privacy Guard        PASS / FAIL
D3 Cost Guard           PASS / FAIL
D3 Observer Isolation   PASS / FAIL
D3 Regression           PASS / FAIL
Core Preservation       PASS / FAIL
Scope Compliance        PASS / FAIL
```

D3 must not be treated as the final Phase D gate.

D4 Telemetry Isolation and D5 Performance/Regression remain required before
Phase D can close.

## 17. Locked Principle

> Telemetry must be less trustworthy than the system it observes: if the
> telemetry path fails, the TQG decision path must continue unchanged.

D3 strengthens the observer boundary without changing the protected quality
decision logic.