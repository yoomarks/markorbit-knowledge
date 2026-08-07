# Conversion Pipeline Inspection Projection v1

## Scope

TASK-022 adds a read-only control-plane projection over the durable Conversion pipeline state.

The projection joins one Workspace-scoped ConversionRun with:

- its latest ConversionAttempt by ordinal;
- its latest ConversionLease by generation and issue time;
- its StagingDocumentDescriptor, when present;
- its latest persisted Staging verification evidence, when present.

It does not create, claim, execute, verify, finalize, retry or mutate any pipeline object.

## Public views

`getByRun(workspaceId, conversionRunId)` returns one inspection or `null`.

`list(filters)` supports Workspace-scoped filtering by Source, RawArtifact, ConversionRun status and Staging document status, with deterministic pagination ordered by latest Run update.

Every persisted protocol document is validated while reading. Invalid persisted JSON fails closed rather than being silently projected.

## Observed phase

The projection exposes an operator-oriented phase:

- `PENDING` when a pending Run has no Attempt;
- `CLAIMED` when a pending Run already has an Attempt;
- `RUNNING`;
- `VERIFYING`;
- `COMPLETED`;
- `FAILED`;
- `CANCELLED`.

This phase is derived only from authoritative persisted state. It is not a new state machine.

## Consistency boundary

The projection is intentionally read-only and transaction-free. Each query is a point-in-time SQLite read and may observe a newer state on the next query. It does not cache or materialize duplicate pipeline state.

## Security and authority

The repository requires a Workspace identifier for every read. It never returns Worker credentials, lease bearer values, token material or RawArtifact/Staging content bytes.

No Worker or verifier authority is expanded.

## Deferred work

Deferred: Admin UI, HTTP API, streaming updates, scheduler, polling loop, retry policy, production artifact transport, Obsidian, Ready Package publishing, AI extraction, semantic analysis and MarkOrbit Core behavior.
