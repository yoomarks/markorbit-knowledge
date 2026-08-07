# Execution Ledger and Manual Dispatch

## Purpose

The Execution Ledger records auditable pending work after an operator chooses to dispatch an active CollectionPlan. It is the durable control-plane boundary before Worker execution.

```text
ACTIVE CollectionPlan
        ↓ manual dispatch
compatibility validation
        ↓
transaction
  ├─ PENDING CollectionRun
  └─ PENDING Job attempt 1
        ↓
Execution Ledger UI / API
        ↓ future task
Worker lease and Connector execution
```

A successful dispatch means only that work was durably recorded. It does not mean a Worker started, Crawl4AI ran, a page was collected or a RawArtifact exists.

## Migration

Migration `0004_execution_ledger` creates:

- `collection_runs`;
- `jobs`;
- indexes for Workspace, Source, CollectionPlan, Connector, trigger, status, JobType and time;
- a foreign key from Job to CollectionRun;
- a unique optional idempotency key per Workspace;
- canonical contract JSON for every record.

The JSON document is the authoritative persisted representation. Indexed columns support administration queries and uniqueness. Every write and read is validated against Execution Contract v1.

## Manual dispatch validation

Dispatch is accepted only when:

1. the CollectionPlan exists and is `ACTIVE`;
2. the SourceDefinition exists and is `ACTIVE`;
3. the exact bound ConnectorManifest version exists and is `ACTIVE`;
4. the Connector supports the Source Type;
5. the Connector declares `COLLECT`;
6. JavaScript rendering, attachment fetching and change-watch requirements are supported;
7. requested artifact kinds are supported;
8. one supported JobType can be derived deterministically.

## JobType derivation

| Source and plan                   | JobType                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `WEB` + `CHANGE_WATCH`            | `PAGE_UPDATE_CHECK`                                                 |
| `WEB` otherwise                   | `WEB_CRAWL`                                                         |
| `API`                             | `API_COLLECTION`                                                    |
| `EMAIL`                           | `EMAIL_IMPORT`                                                      |
| `LOCAL_FOLDER` or `MANUAL_UPLOAD` | `LOCAL_FILE_SCAN`                                                   |
| Other Source Types                | Exactly one compatible collection JobType declared by the Connector |

Ambiguous or unsupported derivation rejects dispatch.

## Immutable snapshots

Each CollectionRun and Job stores full snapshots of:

- CollectionPlan;
- SourceDefinition;
- exact ConnectorManifest version.

Registry edits after dispatch do not mutate historical intent. This allows later audit, replay analysis and provenance without depending on the current registry state.

## Idempotency

Manual dispatch accepts an optional `Idempotency-Key` header.

- It is normalized and limited to 128 characters.
- Uniqueness is scoped to a Workspace.
- Repeating the same key for the same plan returns the existing run.
- Reusing the key for a different plan is a conflict.
- Run and Job creation occurs in one transaction.

## Cancellation

The control plane may cancel only a `PENDING` CollectionRun whose jobs are still `PENDING`.

Cancellation:

- requires the previously read `updatedAt` value;
- atomically updates the run and all pending jobs;
- records a cancellation timestamp and optional reason;
- rejects stale writes;
- rejects Worker-owned or completed states.

There is no destructive delete.

## API surface

- `GET /api/runs`
- `POST /api/runs`
- `GET /api/runs/:id`
- `POST /api/runs/:id/cancel`
- `GET /api/plans/:id/runs`
- `GET /api/sources/:id/runs`

No public endpoint writes Worker-owned states.

## Administration UI

The real **运行记录** module provides:

- status and trigger summaries;
- search and filters;
- immutable plan, source and Connector identity display;
- JobType and attempt display;
- run detail and complete snapshot inspection;
- cancellation of pending work;
- explicit `Awaiting Worker` messaging.

The UI does not display fabricated progress, duration, collected-item counts, output files or success status.

## Deferred runtime

The following remain separate future tasks:

- Worker Registry;
- leases, heartbeats and capability matching;
- Crawl4AI invocation;
- Worker state transition evidence;
- automatic retry and dead-letter processing;
- RawArtifact registration and object storage;
- scheduler-created runs.
