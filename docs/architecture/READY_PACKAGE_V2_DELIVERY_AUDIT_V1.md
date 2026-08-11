# ReadyPackage V2 Delivery Audit Timeline V1

## Purpose

R1-K15 adds a Knowledge-owned, append-only audit timeline around the frozen ReadyPackage V2 Delivery Protocol V1 introduced in K14.

The timeline exists to answer operational recovery questions without inspecting or reconstructing the frozen delivery payload:

- when was the V2 request frozen;
- which exact request SHA-256 was attempted;
- how many explicit transport attempts were started;
- whether an attempt ended with a structured unknown outcome;
- when the exact consumer result became durable locally;
- when local finalization completed;
- whether recovery after a crash reused the already-durable result instead of sending HTTP again.

## Boundary

K15 does not change:

- ReadyPackage V1 or Content Export V1;
- ReadyPackage V2 or Content Export V2 bytes;
- ReadyPackage V2 Delivery Protocol V1 request/result envelopes;
- the frozen request JSON, request SHA-256 or idempotency key;
- Core Workspace binding semantics after preparation;
- the prohibition on sending V2 to the frozen Core V1 endpoint;
- Core implementation or semantic/AI behavior.

The audit timeline is Knowledge control-plane evidence only.

## Event model

Each delivery owns a strictly increasing sequence of immutable events. Event rows contain only bounded operational metadata.

Event types:

1. `PREPARED`
   - emitted in the same transaction as the first frozen submission row;
   - records the request SHA-256 and frozen target identity through the parent submission, not the payload.

2. `TRANSPORT_ATTEMPT_STARTED`
   - emitted in the same transaction that increments the durable transport-attempt counter;
   - carries the exact attempt number.

3. `TRANSPORT_OUTCOME_UNKNOWN`
   - appended when a transport call throws after an attempt was durably started;
   - stores only a bounded issue code and HTTP-style status classification;
   - never stores destination URL, secret, response body, exception message or request body.
   - if the process crashes before this event can be written, the preceding `TRANSPORT_ATTEMPT_STARTED` event still proves that the attempt entered the unknown recovery window.

4. `TRANSPORT_RESULT_RECORDED`
   - emitted in the same transaction that persists the validated consumer result as `transportResult`;
   - records only the protocol result status and exact request SHA-256.

5. `FINALIZED`
   - emitted in the same transaction that transitions the local submission to `RESULT_RECORDED`;
   - records the same validated protocol result status.

Replaying a completed operation does not append duplicate evidence. The timeline describes durable state transitions, not read-only replays.

## Ordering and append-only rule

The primary audit identity is `(workspace_id, submission_id, sequence)`.

For one submission:

- sequence starts at `1`;
- each new durable event uses `MAX(sequence) + 1` inside the same SQLite write transaction;
- existing rows are never updated or deleted by the repository;
- readers validate event type, sequence, timestamps, request SHA-256 and type-specific optional fields.

## Transactional reliability

State mutation and its corresponding event must commit atomically for:

- initial prepare + `PREPARED`;
- attempt counter + `TRANSPORT_ATTEMPT_STARTED`;
- `transportResult` + `TRANSPORT_RESULT_RECORDED`;
- final result + `FINALIZED`.

`TRANSPORT_OUTCOME_UNKNOWN` is a separate append after a thrown transport call because there is no successful transport state mutation to pair with it.

The existing K14 ordering remains authoritative:

```text
freeze exact request
  -> persist attempt start
  -> network I/O
  -> persist exact transport result
  -> local finalization
```

K15 adds evidence around that order; it does not reorder it.

## Browser/API safety

The Admin API may expose audit events because their schema cannot contain:

- `requestJson`;
- Content Export Markdown;
- idempotency key;
- internal authorization secret;
- configured destination URL;
- arbitrary exception text;
- arbitrary consumer response bodies.

The Workbench timeline should show timestamp, event label, attempt number/result status and bounded issue code only.

## Recovery semantics

- `PREPARED` with no attempt event: safe frozen request, never durably entered transport.
- latest event `TRANSPORT_ATTEMPT_STARTED` with no later result: outcome is unknown; retry must use the same frozen bytes/key.
- `TRANSPORT_OUTCOME_UNKNOWN`: explicit transport failure was observed; retry must still use the same frozen bytes/key.
- `TRANSPORT_RESULT_RECORDED` without `FINALIZED`: only local finalization is allowed; no outbound configuration is required.
- `FINALIZED`: delivery is locally complete; no HTTP replay is allowed from the Workbench.

A downstream status of `RECEIVED`, `ACCEPTED` or `REJECTED` remains the consumer's protocol result. K15 does not reinterpret any of those statuses as Knowledge semantic truth.
