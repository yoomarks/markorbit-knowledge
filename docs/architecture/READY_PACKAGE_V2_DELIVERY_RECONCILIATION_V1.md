# ReadyPackage V2 Delivery Reconciliation V1

## Purpose

R1-K16 turns the frozen K14 delivery submission and K15 append-only audit timeline into a read-only operational diagnosis for recovery and operator decisions.

The diagnosis answers one question: given the durable evidence that exists now, what is the only safe next action?

It does not repair history, infer missing delivery success, auto-retry transport or change the ReadyPackage V2 Delivery Protocol V1.

## Evidence boundary

Reconciliation reads only:

- the durable ReadyPackage V2 delivery submission metadata;
- the frozen request SHA-256 and immutable delivery identity;
- the durable transport-attempt counter and timestamps;
- the K15 append-only audit events returned by the existing repository API;
- the durable consumer result and local final result when present.

Reconciliation never requires or exposes:

- request JSON or Content Export Markdown;
- idempotency key;
- destination URL;
- authorization secrets;
- arbitrary transport exception text;
- arbitrary consumer response bodies.

No new audit-repository convenience API is introduced. K16 consumes the existing `listAuditEvents()` boundary.

## Operational states

The diagnosis has six states.

### `SAFE_TO_SUBMIT`

Evidence contains exactly one valid `PREPARED` event and no durable transport attempt.

Recommended action: submit the already-frozen request once, only through explicitly configured V2 transport.

### `OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST`

At least one durable transport attempt exists and no durable consumer result exists. This includes both an explicit `TRANSPORT_OUTCOME_UNKNOWN` event and a crash window where the last durable evidence is `TRANSPORT_ATTEMPT_STARTED`.

Recommended action: if an operator chooses to retry, retry only the exact same frozen `requestJson` and idempotency key. No request regeneration is allowed.

### `LOCAL_FINALIZATION_REQUIRED`

A durable `TRANSPORT_RESULT_RECORDED` event and matching durable consumer result exist, but no durable `FINALIZED` event exists.

Recommended action: complete local finalization only. Network configuration is not required and no HTTP call is allowed.

### `DELIVERED`

A valid `FINALIZED` event exists and matches the durable local final result.

Recommended action: none. No outbound replay is allowed.

### `CONSUMER_REJECTED`

The durable consumer result status is `REJECTED`.

Recommended action: operator review and correction outside the transport protocol. K16 does not automatically retry a consumer rejection.

### `EVIDENCE_INCONSISTENT`

Durable submission state and append-only audit evidence violate the frozen protocol transition rules or disagree with each other.

Recommended action: block automation and perform operator evidence review. K16 never repairs or synthesizes missing history.

## Fail-closed validation

Reconciliation rejects or flags evidence when any of the following occurs:

- the timeline is empty or does not begin with exactly one `PREPARED` event;
- audit sequence is missing, duplicated or non-monotonic;
- workspace, submission or ReadyPackage identity differs from the frozen submission;
- an event references a different request SHA-256;
- event timestamps regress;
- attempt numbers do not advance exactly once;
- unknown outcome or consumer result does not reference the current attempt;
- a new attempt appears after a durable consumer result;
- multiple consumer results or finalization events exist;
- a result appears after the same attempt was already recorded as outcome-unknown;
- finalization is missing its consumer result or conflicts with result status/attempt number;
- an event appears after finalization;
- mutable submission attempt counts/timestamps disagree with append-only audit evidence;
- mutable transport/final result fields disagree with their corresponding durable audit events.

A corrupted or truncated timeline is therefore not interpreted optimistically. It becomes `EVIDENCE_INCONSISTENT` and outbound automation is blocked.

## K14/K15 compatibility

K15 migration intentionally backfilled only `PREPARED` for pre-audit K14 submissions. It did not fabricate historical attempt, consumer-result or finalization evidence.

K16 preserves that rule. If an older mutable submission claims attempts, a transport result or local final result that cannot be proven by K15 audit evidence, reconciliation returns `EVIDENCE_INCONSISTENT` with `LEGACY_AUDIT_INCOMPLETE` rather than guessing that delivery succeeded.

This is deliberately conservative because duplicate outbound delivery is more dangerous than requiring operator review of incomplete historical evidence.

## Service behavior

The Admin delivery service must diagnose before any outbound action.

- `SAFE_TO_SUBMIT` may enter the normal frozen-request transport path.
- `OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST` may enter the same transport path using the unchanged frozen request and idempotency key.
- `LOCAL_FINALIZATION_REQUIRED` calls only the local result finalization path.
- `DELIVERED` returns the durable completed submission without transport.
- `CONSUMER_REJECTED` blocks automatic retry and requires operator review.
- `EVIDENCE_INCONSISTENT` throws a conflict and performs no network I/O.

The existing V1 Core intake endpoint remains prohibited for V2 delivery.

## Admin UI behavior

The Workbench exposes:

- derived diagnosis state;
- recommended operator action;
- bounded evidence counts/statuses;
- bounded inconsistency issue codes and messages;
- the existing K15 audit timeline.

The UI may offer a submit or retry control only for states where the service permits outbound transport. Local finalization remains available without transport configuration. Rejected, delivered and inconsistent states do not expose an outbound send action.

The UI is diagnostic only. It must not automatically repair evidence, automatically retry unknown outcomes or infer success from mutable state.

## Restart safety

The diagnosis is a pure function of durable submission metadata plus durable audit events. Reopening the SQLite repository must therefore reconstruct the same operational state and recommended action without relying on process memory.

K16 tests prove this explicitly for the outcome-unknown recovery path and separately cover all six operational states, request-SHA mismatch, bad audit sequence, duplicate/conflicting final evidence, fail-closed legacy evidence and API serialization safety.
