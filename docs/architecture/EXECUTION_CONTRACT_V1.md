# Execution Contract v1

## Purpose

Execution Contract v1 defines the runtime-ledger objects that sit between a durable `CollectionPlan` and future Worker execution.

Schema v1 remains locked for acquisition and staging objects. Execution objects use a separate contract namespace and version so runtime lifecycle changes do not silently alter SourceDefinition, ConnectorManifest, CollectionPlan or RawArtifact semantics.

```text
Schema v1 CollectionPlan
        ↓ manual dispatch
Execution Contract v1
  ├─ CollectionRun
  └─ Job
        ↓ future Worker protocol
Connector execution
```

## Version

```text
contractVersion: "1.0"
```

TypeScript contracts and runtime guards are exported from `@markorbit/contracts`.

## CollectionRun

A `CollectionRun` is the aggregate record for one dispatch request. It contains:

- typed `run_` identifier;
- Workspace, Source and CollectionPlan identifiers;
- lifecycle status;
- trigger and requesting actor;
- optional idempotency key;
- immutable CollectionPlan snapshot;
- immutable SourceDefinition snapshot;
- immutable exact ConnectorManifest snapshot;
- request, creation and update timestamps;
- optional cancellation metadata.

The snapshots capture the exact intent used at dispatch time. Later edits to the plan, source or Connector Registry do not rewrite historical runs.

## Job

A `Job` is one executable attempt belonging to a CollectionRun. It contains:

- typed `job_` identifier;
- parent CollectionRun ID;
- Workspace, Source and CollectionPlan identifiers;
- deterministic JobType;
- Job lifecycle status;
- exact Connector ID and version;
- priority and attempt limits;
- availability timestamp;
- the same immutable dispatch snapshots;
- timestamps and optional cancellation metadata.

KNOWLEDGE-TASK-006 creates exactly one initial Job with:

```text
attempt = 1
status = PENDING
```

Automatic retries and later attempts are deferred.

## Run statuses

| Status      | Meaning in this task                                           | Writer                 |
| ----------- | -------------------------------------------------------------- | ---------------------- |
| `PENDING`   | Durable work has been recorded and is awaiting a future Worker | Control plane          |
| `RUNNING`   | Reserved for future Worker-owned execution evidence            | Future Worker protocol |
| `COMPLETED` | Reserved for verified future completion evidence               | Future Worker protocol |
| `FAILED`    | Reserved for future failure evidence                           | Future Worker protocol |
| `CANCELLED` | Pending work was cancelled before Worker execution             | Control plane          |

The administration API exposes only creation of `PENDING` records and the transition `PENDING → CANCELLED`.

## Job statuses

The shared Job vocabulary already includes Worker-owned states such as `LEASED`, `RUNNING`, `UPLOADING`, `VERIFYING`, `COMPLETED`, `RETRY`, `FAILED` and `DEAD_LETTER`. Their presence is a compatibility vocabulary, not permission for the administration API to write them.

## Trigger types

- `MANUAL` — explicit operator dispatch;
- `SCHEDULED` — reserved for a future scheduler;
- `RETRY` — reserved for future retry orchestration and requires `parentRunId`;
- `API` — reserved for authenticated API clients.

This task creates only `MANUAL` triggers.

## Strict validation

Execution guards enforce:

- strict unknown-field rejection;
- typed IDs;
- RFC3339 timestamps;
- aligned Workspace, Source, Plan and Connector snapshots;
- exact Connector version alignment;
- positive attempt counters;
- cancellation fields only on cancelled records;
- retry-parent requirements;
- JSON-safe extensions;
- rejection of credential-like extension values.

## Security boundary

Execution snapshots may contain public connector configuration already present in SourceDefinition, but they must never contain passwords, API keys, tokens, private keys or other credential values. Secrets remain referenced indirectly through the platform secret boundary and are resolved only by a future authorized Worker runtime.

## Non-goals

Execution Contract v1 does not define:

- Worker leases or heartbeats;
- Connector invocation payload transport;
- RawArtifact upload completion;
- progress percentages;
- scheduler calculations;
- retry processors;
- MarkOrbit Core semantic objects.
