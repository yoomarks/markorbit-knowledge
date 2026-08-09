# M24 — Controlled Foundational Collection Dispatch

## Purpose

M24 closes the first execution loop from the FOUNDATIONAL remediation queue into the existing collection execution ledger.

M20 identifies `DISPATCH_GOVERNED_COLLECTION` as the COLLECT-stage operator action. M21 exposes the queue through a read-only API. M23 records a separately approved action intent but deliberately gives that intent no execution authorization. M24 adds a second, explicit execution boundary for **COLLECT only**.

```text
M20 remediation queue
        ↓
M23 PENDING_APPROVAL intent
        ↓ explicit APPROVE
M23 APPROVED intent (executionAuthorization = NONE)
        ↓ separate POST with execute=true
M24 revalidation + prepared-plan binding
        ↓
Execution Contract v1 CollectionRun + Job
        ↓
M24 append-only execution link
```

Approval still does not dispatch collection. The M24 execution request is a distinct operator act.

## Supported action

M24 intentionally supports exactly one action:

```text
readinessStage: COLLECT
actionCode: DISPATCH_GOVERNED_COLLECTION
executionPath: FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH
```

REGISTER, INGEST, CONVERT, INDEX, QUALITY, RELEVANCE and HEALTH actions remain non-executable through this endpoint.

## Required gates

A new dispatch succeeds only when all of the following are true:

1. the M23 intent exists;
2. the intent is `APPROVED`;
3. the intent is still a COLLECT / `DISPATCH_GOVERNED_COLLECTION` intent;
4. the caller supplies `execute: true`;
5. a valid execution actor and idempotency key are supplied;
6. M21 is rebuilt for the exact target at execution time;
7. the exact M20 collection action still exists and still requires explicit collection authorization;
8. the coverage target resolves to exactly one registered source;
9. exactly one ACTIVE + MANUAL foundational supply plan is prepared for that source and target;
10. the prepared plan retains `x-markorbit-collection-authorization: false` before dispatch;
11. the existing Execution Contract v1 dispatch validation accepts the source, plan and connector.

If any gate fails, no new CollectionRun is created.

## Explicit dispatch API

```http
POST /api/foundational/action-intents/{intentId}/execute
Content-Type: application/json

{
  "executedByActorId": "operator:mile",
  "idempotencyKey": "m24-us-tmep-dispatch-001",
  "execute": true
}
```

The POST creates the existing durable execution objects:

- one `CollectionRun`;
- one initial `Job`;
- one append-only `FOUNDATIONAL_ACTION_EXECUTION` record linking the approved intent to that run.

The CollectionRun uses trigger type `MANUAL`. The execution actor is preserved in the run trigger and in the M24 ledger.

## Execution record

Protocol version:

```text
1.0
```

Important fields include:

- `executionId`;
- `intentId`;
- Workspace / jurisdiction / target;
- requester, approver and executor identities;
- source, plan, CollectionRun and Job identifiers;
- M23 intent update timestamp;
- M21 revalidation timestamp;
- explicit collection-authorization marker;
- caller idempotency key;
- dispatch timestamp.

Policy markers are fixed:

```text
approvalMode = APPROVED_INTENT_PLUS_EXPLICIT_EXECUTE
explicitExecute = true
automaticExecution = false
collectionAuthorization = EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH
executionAuthorization = CONSUMED_BY_DISPATCH
```

## Idempotency and crash recovery

M24 uses two layers of idempotency:

1. the M24 execution ledger binds the caller idempotency key to an execution record;
2. collection dispatch uses a deterministic run idempotency key derived from the M23 intent ID.

Therefore one approved intent cannot create multiple CollectionRuns even if the API call is retried after the CollectionRun was committed but before the M24 link record was written.

A repeated request with the same intent, actor and M24 idempotency key returns the original execution with `replayed: true`.

## Read APIs

Fetch the execution associated with one intent:

```http
GET /api/foundational/action-intents/{intentId}/execute
```

List execution history:

```http
GET /api/foundational/action-executions?workspaceId=<id>&jurisdiction=US
```

Optional list filters:

- `targetId`;
- `executedByActorId`;
- `limit` (1–100).

## Persistence

Migration:

```text
0018_foundational_action_executions
```

The ledger is append-only. Each intent and each CollectionRun may appear at most once. Historical intent/run snapshots are not rewritten by later source, plan or queue changes.

## Safety boundary

M24 does not:

- dispatch anything when an intent is merely approved;
- execute non-COLLECT remediation actions;
- create or broaden source coverage;
- create a collection plan automatically;
- choose between multiple registered sources or multiple plans;
- bypass Execution Contract v1 connector/source/plan validation;
- auto-retry failed collection;
- mutate RawArtifact evidence;
- execute conversion or retrieval remediation;
- edit relevance probes or ranking;
- make semantic or legal judgments;
- introduce a scheduler or background authorization loop.

M24 is the first explicitly authorized bridge from the foundational control plane to durable collection work, not a general autonomous remediation engine.
