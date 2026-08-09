# M23 — Controlled FOUNDATIONAL Action Intents

## Purpose

M23 adds a persistent operator-intent layer between the M20 remediation queue and any future execution adapter.

M20 says **what should be reviewed or done next**. M21 exposes that queue through a read-only control-plane API. M22 makes it visible in Admin. M23 lets an operator explicitly record and approve a selected current queue action without turning that approval into execution authorization.

An action intent is therefore an auditable control object, not a job, command, collection authorization, or remediation execution.

## Protocol

`FOUNDATIONAL_ACTION_INTENT_PROTOCOL_VERSION = 1.0`

Lifecycle:

`PENDING_APPROVAL → APPROVED → CANCELED`

Cancellation is also allowed directly from `PENDING_APPROVAL`.

Every intent permanently carries:

- `automaticExecution: false`
- `executionAuthorization: NONE`
- `approvalRequired: true`

An `APPROVED` intent still cannot execute anything by itself.

## Creation

`POST /api/foundational/action-intents`

Required body fields:

- `workspaceId`
- `jurisdiction`
- `targetId`
- `actionCode`
- `requestedByActorId`
- `idempotencyKey`

Optional `topK` is limited to the same deterministic M18 relevance-audit range used by M21.

Before an intent is persisted, the server rebuilds the M21 snapshot for the exact target and requires the requested `actionCode` to exist in the **current** M20 remediation queue. READY targets or stale/non-current actions are rejected.

The persisted intent snapshots:

- readiness stage;
- M20 action code;
- operator instruction;
- execution path;
- whether collection authorization would be required by a future executor;
- M19 readiness protocol version;
- M20 queue protocol version;
- source snapshot observation time.

## Idempotency

Intent identity is deterministic from `workspaceId + idempotencyKey`.

Reusing the same key with the same semantic request returns the existing intent with `replayed: true`. Reusing it for a different target, stage, action, or requester fails with `FOUNDATIONAL_ACTION_INTENT_IDEMPOTENCY_CONFLICT`.

This prevents double intent creation without treating a retry as new authorization.

## Approval and cancellation

`PATCH /api/foundational/action-intents/{intentId}`

Approval body:

```json
{ "operation": "APPROVE", "actorId": "reviewer:alice" }
```

Cancellation body:

```json
{ "operation": "CANCEL", "actorId": "reviewer:alice" }
```

Approval performs a second current-state check. The server rebuilds the exact target's remediation queue and verifies that the stored stage, action, execution path, and collection-authorization requirement still match current policy. If they changed, approval is rejected as `FOUNDATIONAL_ACTION_INTENT_STALE`; the operator must create a new intent from the current queue.

Cancellation does not execute or reverse any external work because M23 never executes external work in the first place.

## Query

`GET /api/foundational/action-intents`

Required query parameter:

- `workspaceId`

Optional filters:

- `jurisdiction`
- `targetId`
- `status`
- `limit` (1–100)

The list response declares:

- `executionPolicy: INTENT_ONLY_NO_EXECUTION`
- `collectionAuthorization: NONE`

## Persistence

M23 adds the SQLite migration `0017_foundational_action_intents` with:

- deterministic intent ID;
- workspace/jurisdiction/target scope;
- readiness stage and action code;
- lifecycle status;
- requester and idempotency key;
- semantic fingerprint for conflict-safe replay;
- full versioned intent JSON;
- created/updated timestamps.

The ledger is append-oriented at creation and only permits explicit lifecycle transitions. It does not store an executable payload or an execution token.

## Safety boundary

M23 does **not**:

- register sources;
- authorize or dispatch collection;
- ingest or rewrite RawArtifact evidence;
- retry conversion;
- rebuild canonical documents, chunks, or FTS indexes;
- execute M16/M17 remediation;
- edit M18 probes or tune BM25;
- broaden source coverage;
- schedule background execution;
- convert approval into collection authorization;
- use an LLM to choose actions or judge relevance;
- make legal correctness, deadline, applicability, or recommendation judgments.

A future execution milestone must consume an approved intent only after revalidation and must still enforce the existing action-specific authorization boundaries. In particular, an approved `DISPATCH_GOVERNED_COLLECTION` intent is **not** itself the explicit collection dispatch authorization.
