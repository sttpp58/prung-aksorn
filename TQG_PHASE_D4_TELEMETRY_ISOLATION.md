# TQG Phase D4 — Telemetry Isolation

**Phase:** D4
**Contract:** `TQG-OBS-01`
**Status:** PASS — D4 Gate
**Repository:** `sttpp58/prung-aksorn`
**Baseline:** `be92fcd` — Phase D3 Privacy / Cost Guard

## 1. Purpose

D4 hardens the isolation boundary between TQG decision execution and
observability sinks.

The telemetry path is treated as an optional passive consumer. Observer
configuration, event construction, validation, sink behavior, and telemetry
snapshot access must not become a failure source for TQG detection, Inspector,
Repair, or re-validation.

D4 does not redesign TQG quality logic or application persistence.

## 2. Locked Isolation Principles

The required boundary is:

```
TQG operation
     |
     +--> compliant metadata event
              |
              v
        isolated observer
```

The reverse dependency is forbidden:

```
observer / telemetry
        X
        |
        +--> TQG decision
        +--> translation
        +--> Inspector / Repair
        +--> storage / checkpoint / recovery
```

Observer acknowledgement is never a quality decision.
## 3. D4 Implementation

### 3.1 Observer resolution isolation

Observer lookup is guarded so malformed observer configuration, including a
throwing `observer` getter or `emit` getter, falls back safely to the
existing in-memory observer.

Observer configuration cannot abort the TQG operation before analysis starts.

### 3.2 Emission isolation

The full telemetry emission sequence is guarded:

```
build -> validate -> freeze -> emit -> async rejection guard
```

Any synchronous exception, malformed thenable, validation failure, or sink
failure returns an observer-layer failure without changing the TQG result.

### 3.3 Fail-closed malformed payload handling

Recursive telemetry inspection now treats traversal exceptions as a privacy
failure. A malformed or hostile payload is rejected rather than allowed to
reach the sink.

### 3.4 Immutable snapshot boundary

Runtime metric snapshots are copied and recursively frozen before returning
to callers. External code cannot mutate the internal telemetry counters.

### 3.5 No new transport/storage path

D4 adds no telemetry database, remote analytics service, provider call,
network API, IndexedDB access, localStorage access, checkpoint, or recovery
operation.
## 4. Files Changed

D4 implementation is intentionally limited to:

```
tqg-integration.js
scripts/tqg-regression.mjs
tests/tqg/tqg-d4-telemetry-isolation-regression.mjs
TQG_PHASE_D4_TELEMETRY_ISOLATION.md
```

The following remain protected and unchanged:

```
tqg.js
tqg-inspector.js
tqg-repair.js
tqg-ui.js
storage-v2.js
index.html
sw.js
TQG_PHASE_D_OBSERVABILITY_CONTRACT.md
TQG_PHASE_D3_PRIVACY_COST_GUARD.md
```

No TQG configuration, detector rule, Inspector prompt, Repair boundary,
translation engine, storage schema, Translation Job semantics, batch
semantics, recovery semantics, or application-shell behavior is changed.

## 5. D4 Regression Coverage

The dedicated D4 regression verifies:

- observer exceptions do not fail TQG
- observer false acknowledgement does not affect TQG
- async observer rejection is isolated
- observer/configuration getters cannot abort TQG
- malformed observer thenables are isolated
- malformed telemetry payloads fail closed
- sink events and nested finding-code arrays are immutable
- telemetry snapshots are isolated from external mutation
- content-bearing markers do not enter telemetry
- independent observer instances do not share event objects
- integration has no direct storage/network coupling
- integration has no direct AI-provider invocation
- TQG-08 contract version remains unchanged

## 6. Existing Contract Preservation

D4 preserves all D1/D2/D3 event semantics:

- `TQG-OBS-01` remains the exact schema version
- the six locked event names remain unchanged
- the ten locked finding codes remain unchanged
- AI/transport accounting meaning remains unchanged
- privacy deny-list remains enforced
- per-event size and volume guards remain enforced
- re-validation remains authoritative
- observer failure remains fail-open with respect to TQG

D4 is an isolation hardening change, not a telemetry schema revision.

## 7. Deep Review Record

### Review 1 — Correctness / Regression

Scope:
- D2 regression
- D3 regression
- D4 regression
- JavaScript syntax check
- existing TQG-09 regression preservation

Result:

```
PASS
```

### Review 2 — Adversarial Isolation / Scope

Scope:
- observer/configuration failure paths
- malformed payload traversal
- immutable snapshot boundary
- direct network/storage/provider coupling scan
- protected-file integrity
- diff scope

Result:

```
PASS
```

## 8. Deep Review 3 — Final Release Integrity

Scope:
- final working-tree diff
- whitespace/error checks
- protected-file hashes
- D1/D3 document immutability
- no application-shell change
- complete D4 regression sequence
- repository regression gate
- private C2 artifact remains untracked/ignored
- branch contains only D4-authorized changes

Result:

```
PASS
```

## 9. D4 Exit Criteria

- [x] observer resolution is isolated
- [x] telemetry emission is fail-open
- [x] malformed payload traversal fails closed
- [x] observer events are immutable
- [x] metric snapshots are isolated
- [x] no direct storage coupling exists
- [x] no direct network coupling exists
- [x] no direct AI-provider call exists
- [x] D1 contract remains unchanged
- [x] D2/D3 regressions remain passing
- [x] D4 regression passes
- [x] repository Regression Gate passes
- [x] Deep Review 1/3 passed
- [x] Deep Review 2/3 passed
- [x] Deep Review 3/3 passed
## 10. Final Decision

```
D4 Observer Resolution Isolation   PASS
D4 Emission Failure Isolation      PASS
D4 Malformed Payload Isolation     PASS
D4 Snapshot Isolation              PASS
D4 Storage/Network Isolation       PASS
D4 Contract Preservation           PASS
D4 Regression                      PASS
Core Preservation                  PASS
Scope Compliance                   PASS
```

D4 is complete at the implementation and repository-gate level.

Phase D is **not closed** by D4 alone. D5 Performance + Final Regression /
Gate remains required.

## 11. Locked Principle

> Telemetry is downstream of TQG. A broken observer, malformed sink payload,
> or telemetry configuration failure must not become a TQG quality failure.

D4 strengthens this boundary without changing core translation or TQG
decision semantics.
