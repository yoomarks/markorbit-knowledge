# Execution Lifecycle Protocol v1

## Purpose

Execution Lifecycle Protocol v1 defines how an authenticated Worker reports progress for a Job that it already owns through an active lease.

It is deliberately separate from:

- Schema v1;
- Execution Contract v1;
- Worker Protocol v1;
- Connector implementation details;
- RawArtifact and object-storage contracts.

The protocol records control-plane state only. It does not carry page bodies, files, binary content, credentials or executable instructions.

## Preconditions

Every accepted lifecycle report must be associated with:

- an authenticated Worker;
- the exact Job claimed by that Worker;
- an active lease for the Job;
- the correct lease token;
- the matching CollectionRun;
- a sequence greater than the last accepted sequence.

Worker credentials and lease tokens belong to HTTP authorization and are never fields in the persisted event contract.

## Legal Job transitions

```text
LEASED
  ↓ STARTED
RUNNING
  ├─ PROGRESS_REPORTED → RUNNING
  ├─ UPLOAD_READY → UPLOADING
  └─ FAILED → FAILED

UPLOADING
  ├─ VERIFICATION_READY → VERIFYING
  └─ FAILED → FAILED

VERIFYING
  ├─ COMPLETED → COMPLETED
  └─ FAILED → FAILED
```

No lifecycle event may move a `PENDING`, `COMPLETED`, `FAILED`, `DEAD_LETTER` or `CANCELLED` Job.

This protocol does not create `RETRY` attempts. Retry policy remains deferred.

## CollectionRun derivation

The current execution model creates one Job per CollectionRun. CollectionRun status is derived transactionally from Job status:

| Job status                    | CollectionRun status |
| ----------------------------- | -------------------- |
| PENDING, LEASED               | PENDING              |
| RUNNING, UPLOADING, VERIFYING | RUNNING              |
| COMPLETED                     | COMPLETED            |
| FAILED, DEAD_LETTER           | FAILED               |
| CANCELLED                     | CANCELLED            |

A future multi-Job run model must introduce a new derivation policy rather than silently changing this rule.

## Event sequence

Each Job begins with no execution sequence. The first event uses sequence `1`; every subsequent event increments by exactly one.

The persistence layer must enforce uniqueness for `(jobId, sequence)` and `(jobId, eventType)` where the event is terminal. Repeating an identical terminal request may return the existing event. A different payload for an already accepted sequence or terminal state is a conflict.

## Event payloads

### STARTED

Confirms that the Worker has begun the reserved work.

Target Job status: `RUNNING`.

### PROGRESS_REPORTED

Updates structured progress metadata while the Job remains `RUNNING`.

Requires `progressPercent` from 0 through 100.

### UPLOAD_READY

Confirms that the Worker has finished local processing and has an output summary ready for the future artifact-ingestion boundary.

Target Job status: `UPLOADING`.

No upload session or storage reference is created by this protocol.

### VERIFICATION_READY

Confirms that output metadata is ready for control-plane verification.

Target Job status: `VERIFYING`.

### COMPLETED

Records a terminal successful result with an output summary.

Target Job status: `COMPLETED`.

### FAILED

Records a terminal structured failure from `RUNNING`, `UPLOADING` or `VERIFYING`.

Target Job status: `FAILED`.

The `retryable` flag is descriptive only. It does not create another attempt.

## Output summary

`ExecutionOutputSummary` contains only:

- output count;
- MIME-style output type labels;
- optional SHA-256 content hashes.

It does not create or imply a RawArtifact. RawArtifact registration is a later task with its own immutable evidence boundary.

## Security rules

- Unknown top-level fields are rejected.
- Secret-bearing metadata is rejected recursively.
- Credentials and lease tokens are never persisted in event JSON.
- Free-form messages are length bounded.
- Metadata must use the `x-` extension namespace.
- Lifecycle payloads are declarative status reports, not remote execution requests.

## Deferred implementation

This contract lock does not yet add:

- lifecycle API routes;
- execution-event database tables;
- Job state mutation methods;
- Worker runtime adapters;
- fixture Connector execution;
- Crawl4AI;
- RawArtifact creation;
- retry scheduling.

Those capabilities must consume this protocol without weakening its transition or security rules.
