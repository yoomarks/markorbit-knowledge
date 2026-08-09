# M26 — Foundational Collection Outcome Feedback

## Purpose

M25 made the governed foundational COLLECT path usable from `/foundational`, but the UI only knew that a dispatch had happened. It did not have a canonical projection of the exact `CollectionRun` outcome, and a second approved intent could still reach the M24 execution service while an earlier run for the same foundational target was active.

M26 closes that operational gap without introducing automatic retry.

## New outcome protocol

`@markorbit/worker-runtime/foundational-collection-outcome`

Protocol version: `1.0`

Each `FOUNDATIONAL_COLLECTION_OUTCOME` joins one M24 foundational action execution to its exact Execution Contract v1 `CollectionRun` and the current foundational remediation queue.

Outcome states:

- `ACTIVE` — run is `PENDING` or `RUNNING`
- `COMPLETED` — run reached `COMPLETED`
- `FAILED` — run reached `FAILED`
- `CANCELLED` — run reached `CANCELLED`
- `MISSING_RUN` — execution references a run that cannot be loaded

Retry dispositions:

- `BLOCKED_ACTIVE_RUN`
- `NO_ACTION_REQUIRED`
- `REQUIRES_NEW_APPROVAL`
- `REVIEW_COMPLETED_COLLECTION`
- `BLOCKED_MISSING_RUN`

Every outcome carries `automaticRetry: false`.

## Read-only outcome API

```http
GET /api/foundational/collection-outcomes?workspaceId=<id>&jurisdiction=<US|WO>
```

Optional filters:

- `targetId`
- `limit` (1–100)

The server loads M24 execution records, resolves each exact `runId` through the Execution Contract v1 ledger, then evaluates whether `DISPATCH_GOVERNED_COLLECTION` is still a current COLLECT remediation action for the target.

This endpoint does not mutate runs, evidence, plans, intents, readiness, or retrieval state.

## Concurrent-dispatch guard

M24 remains the only server-side foundational collection execution path. M26 adds one additional pre-dispatch guard to that service:

- list prior foundational executions for the same workspace / jurisdiction / target;
- resolve each exact CollectionRun;
- if any prior run is `PENDING` or `RUNNING`, reject the new dispatch with `FOUNDATIONAL_COLLECTION_ALREADY_ACTIVE`;
- if a prior execution references a missing run, reject with `FOUNDATIONAL_COLLECTION_EXECUTION_RUN_MISSING`.

This is authoritative server-side protection. The UI is not relied on as the safety boundary.

## Operator workbench behavior

`/foundational` now consumes `/api/foundational/collection-outcomes` rather than issuing fuzzy `/api/runs?q=<runId>` lookups for every execution.

The visible operator phases now distinguish:

- approval not yet requested;
- pending approval;
- approved and ready for explicit execute;
- active CollectionRun;
- failed/cancelled CollectionRun requiring a brand-new approval intent;
- completed CollectionRun where COLLECT is still required and must be reviewed before another approval request;
- integrity failure when the exact run is missing.

A failed or cancelled run never retries automatically. A new attempt must repeat the governed chain:

1. create a new action intent;
2. approve that new intent;
3. review dispatch;
4. explicitly acknowledge the real mutation;
5. execute the single-target dispatch.

## Boundary

M26 does not:

- automatically retry collection;
- automatically create or approve intents;
- broaden source scope;
- create or modify collection plans;
- mutate RawArtifact or canonical evidence;
- execute conversion or retrieval remediation;
- change readiness stage precedence;
- add semantic or legal judgment;
- make REGISTER, INGEST, CONVERT, INDEX, QUALITY, RELEVANCE, or HEALTH executable.

The outcome projection is operational feedback only. Foundational readiness continues to be derived from the existing evidence, normalization, retrieval quality, relevance, and supply-health gates.
