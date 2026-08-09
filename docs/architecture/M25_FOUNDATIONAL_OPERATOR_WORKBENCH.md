# M25 — Foundational Operator Workbench

## Purpose

M25 connects the M23 action-intent ledger and the M24 controlled collection-dispatch service to the existing `/foundational` Admin surface.

The goal is operational closure without weakening the explicit authorization boundary:

```text
M20 remediation queue
        ↓
M23 action intent
        ↓ explicit APPROVE
M24 controlled execution
        ↓ second explicit execute=true
Execution Contract v1 CollectionRun + Job
```

M25 does not add a new execution path. It exposes the already-governed path in the Admin UI.

## UI surfaces

`/foundational` now contains two deliberately separate surfaces:

1. **Governed mutation surface** — M25 operator controls for the small subset of M24-supported actions.
2. **Read-only readiness surface** — the existing M22 readiness and remediation inspection console.

The operator surface has its own US / WIPO jurisdiction selector so the mutation context is explicit and visually separated from the read-only snapshot below it.

## Executable action allow-list

M25 recognizes exactly one action shape as executable:

- stage: `COLLECT`
- action code: `DISPATCH_GOVERNED_COLLECTION`
- execution path: `FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH`
- `collectionAuthorizationRequired: true`
- `automaticExecution: false`

REGISTER, INGEST, CONVERT, INDEX, QUALITY, RELEVANCE and HEALTH remain non-executable in the workbench.

The allow-list is derived from the current M20 remediation snapshot, not from hard-coded target IDs.

## Three-stage operator flow

### 1. Create approval intent

The UI creates an M23 `FOUNDATIONAL_ACTION_INTENT` through:

```http
POST /api/foundational/action-intents
```

This operation records intent only. It does not create a CollectionRun and carries:

```text
executionAuthorization = NONE
automaticExecution = false
```

### 2. Approve or cancel

A pending intent can be explicitly approved or canceled through:

```http
PATCH /api/foundational/action-intents/{intentId}
```

Approval is still not execution.

### 3. Review and explicitly dispatch

An approved COLLECT intent first enters a UI review state. The operator must then:

1. open the final dispatch review;
2. acknowledge that a real single-target collection dispatch will occur;
3. press the separate final confirmation button.

Only the final action calls:

```http
POST /api/foundational/action-intents/{intentId}/execute
```

with:

```json
{
  "execute": true
}
```

The M24 server remains authoritative and revalidates the current remediation queue, source registration and prepared ACTIVE + MANUAL plan before dispatch.

## Idempotency

Intent creation receives a scoped M25 idempotency key containing jurisdiction, target, snapshot observation time and a local nonce.

Execution idempotency is stable per approved intent:

```text
m25-exec:{intentId}
```

M24 also derives the underlying CollectionRun idempotency from the intent, so UI retries cannot create a second run for the same intent.

## Execution visibility

The operator workbench lists recent M24 execution records and reads the current CollectionRun status through the existing read-only `/api/runs` endpoint.

The stored M24 `runStatusAtDispatch` remains immutable dispatch evidence. The live status displayed by M25 is a current read-model only and does not rewrite the M24 execution record.

Operators can jump directly to the existing Execution Runs page filtered by the resulting `runId`.

## Actor fields

The local Admin surface exposes explicit actor IDs for:

- request actor;
- approval actor;
- execution actor.

Defaults are local-control-plane identities, but the values remain visible and editable before each action. M25 does not introduce authentication or claim that these actor IDs are cryptographic identities.

## Safety boundary

M25 does not:

- automatically create or approve intents;
- automatically execute an approved intent;
- dispatch more than one target from a single confirmation;
- create collection plans;
- register sources;
- broaden source scope;
- retry collection automatically;
- execute conversion or retrieval remediation;
- edit relevance probes;
- mutate RawArtifact or canonical evidence directly;
- make legal or semantic judgments.

The M24 server-side checks remain the source of truth. UI state is convenience, not authorization.

## Tests

The M25 state-model tests verify that:

- only the exact governed COLLECT action is surfaced as executable;
- request, pending approval, approved-for-execution and dispatched are separate phases;
- canceled intents return to a new-request state;
- the newest matching intent is selected;
- execution idempotency is stable per intent.
