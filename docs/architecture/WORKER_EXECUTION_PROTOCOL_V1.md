# Worker Execution Protocol v1

## Purpose

Worker Execution Protocol v1 governs the authenticated transition from a reserved Job to terminal execution evidence.

It is separate from:

- Schema v1 acquisition and staging objects;
- Execution Contract v1 dispatch records;
- Worker Protocol v1 registration, heartbeat and lease ownership;
- Connector implementation details;
- RawArtifact storage.

The protocol locks this distinction:

```text
LEASED = work reserved
RUNNING = execution explicitly started
COMPLETED = terminal evidence accepted
```

## State machine

```text
Job
LEASED → RUNNING → UPLOADING → VERIFYING → COMPLETED
               └───────────────┴──────────→ FAILED

CollectionRun
PENDING → RUNNING → COMPLETED | FAILED
```

Transitions cannot be skipped, reversed or rewritten after a terminal state.

A successful completion requires a metadata-only `ExecutionReceipt`. A failure requires a structured `ExecutionFailure`.

## Protocol objects

### ExecutionAttempt

Links one immutable Job attempt to:

- Workspace;
- CollectionRun;
- Job and Job attempt number;
- active lease;
- authenticated Worker;
- exact Connector version;
- exact executor identity and mode;
- current execution status;
- optional terminal receipt or failure.

There is at most one execution attempt for a given Job attempt.

### ExecutionEvent

Each accepted transition appends one event with:

- monotonic sequence number;
- previous and next status;
- event type;
- idempotency key;
- payload hash;
- control-plane receipt time.

Events are evidence and are not updated in place.

### ExecutionReceipt

A receipt records metadata only:

- executor identity;
- output kinds prepared;
- observed item count;
- prepared byte count;
- optional summary.

It does not store files and does not create RawArtifact records.

### ExecutionFailure

A failure records:

- stable code;
- bounded message;
- whether the Worker considered it retryable;
- server-recorded occurrence time.

Task 008 does not create a new retry attempt even when `retryable` is true.

## Authentication

Every Worker transition requires:

1. Worker bearer credential;
2. Worker ID;
3. lease ID;
4. one-time lease token originally returned by claim.

The database stores only Worker credential and lease-token digests. Idempotent replays remain authenticated, including replays after a terminal transition has closed the lease.

## Idempotency

The key space is scoped by Worker and lease.

```text
same key + same operation + same payload
→ return original accepted result

same key + different operation or payload
→ conflict
```

For failure requests, the payload hash excludes the server-generated `occurredAt` timestamp so a valid replay remains stable.

## Completion validation

Completion is accepted only when:

- Attempt and Job are both `VERIFYING`;
- lease is active and unexpired;
- receipt executor matches the executor captured at start;
- receipt output kinds are included in both the immutable Plan output and Connector output snapshots.

## Lease expiry and unknown outcome

Reservation-only expiry remains a Worker Protocol concern:

```text
LEASED Job + expired lease → PENDING Job
```

Once execution has started, the external outcome may be unknown. It must never be treated as a safe automatic retry:

```text
RUNNING | UPLOADING | VERIFYING
+ expired, released or revoked lease
→ FAILED
→ LEASE_EXPIRED_DURING_EXECUTION
→ retryable = false
```

The reconciliation operation is explicit and idempotent. No scheduler or retry attempt is introduced in this phase.

## Fixture Connector runtime

The fixture runtime validates the protocol before a real Connector is allowed to execute.

It:

- consumes immutable Job and lease context;
- emits deterministic stage requests;
- produces deterministic metadata-only receipts;
- supports deterministic failure injection;
- performs no network request;
- starts no browser;
- reads or writes no customer file;
- executes no shell, Python or PowerShell command;
- creates no RawArtifact.

The fixture executor is replaceable through a small `ConnectorExecutor` interface.

## API boundary

Worker-authenticated operations:

```text
POST /api/worker/v1/leases/:id/start
POST /api/worker/v1/leases/:id/uploading
POST /api/worker/v1/leases/:id/verifying
POST /api/worker/v1/leases/:id/complete
POST /api/worker/v1/leases/:id/fail
```

Administration evidence operations:

```text
GET  /api/runs/:id/executions
GET  /api/executions/:id
POST /api/executions/reconcile
```

The administration UI does not impersonate a Worker and does not retain one-time credentials or lease tokens.

## Deferred work

- Crawl4AI and Playwright execution;
- production Connector loading;
- RawArtifact and object storage;
- upload verification against actual stored bytes;
- retry attempts and dead-letter handling;
- scheduled reconciliation;
- Obsidian synchronization;
- MarkOrbit Core semantic processing.
