# K-EXT-E Operations Readiness Runbook

## Purpose

K-EXT-E closes the gap between a technically complete Knowledge control plane and a system that an operator can safely run day to day.

The Operations Readiness projection is intentionally read-only. It summarizes durable Workspace-scoped evidence already owned by Source, Worker, CollectionRun/Job, ConversionRun, Scheduler, ReadyPackage V2, and ReadyPackage V2 delivery ledgers. It does not create a second monitoring database, retry engine, repair daemon, or delivery path.

The Admin Dashboard consumes this projection and replaces fixture metrics with live durable state.

## Readiness states

### READY

No blocking or degraded operational condition is currently detected.

`ACTION` items may still be present. An ACTION means a deliberate operator step is available, not that the system is unhealthy. Examples include preparing a verified ReadyPackage V2 for delivery, submitting an already-frozen request, or completing local finalization after a durable consumer result.

### DEGRADED

The platform can continue operating, but one or more durable signals require operator attention. Examples include recent collection/conversion failures, offline workers, scheduler errors, an overdue scheduler slot, an outcome-unknown V2 delivery, or a consumer rejection.

Do not convert DEGRADED into automatic repair. Follow the existing controlled action boundaries.

### BLOCKED

A condition exists where proceeding automatically would be unsafe or the current work cannot make forward progress. Current blocking cases include:

- inconsistent ReadyPackage V2 delivery evidence;
- jobs in DEAD_LETTER;
- pending/retry collection backlog with no ONLINE or BUSY Worker capacity.

BLOCKED requires explicit operator review.

## Observation windows

The readiness projection deliberately distinguishes current problems from historical evidence.

| Signal | Window / threshold | Reason |
| --- | --- | --- |
| Collection failures | last 24 hours | old failures remain auditable but do not permanently degrade current health |
| Conversion failures | last 24 hours | same principle as collection failures |
| Conversion stall | non-terminal and unchanged for more than 30 minutes | surfaces likely runtime/lease/verification stalls without mutating them |
| Scheduler overdue | next-due slot more than 5 minutes overdue | tolerates normal claim/tick timing while surfacing a materially late plan |
| Worker heartbeat freshness | existing Worker Protocol threshold (90 seconds by default) | readiness mirrors the Worker registry definition rather than inventing a second health rule |

These thresholds are code constants in `packages/persistence/src/operations-readiness.ts` and should be changed intentionally with tests and release notes.

## Issue handling

| Issue code | Severity | Operator path | Required behavior |
| --- | --- | --- | --- |
| `DELIVERY_EVIDENCE_INCONSISTENT` | BLOCKED | Packages | Stop. Review frozen request metadata and append-only audit evidence before any network action. |
| `DEAD_LETTER_JOBS` | BLOCKED | Execution Runs | Inspect the failed job evidence. Any retry must use the existing controlled retry boundary. |
| `COLLECTION_BACKLOG_NO_WORKER` | BLOCKED | Workers | Restore an ACTIVE Worker with a fresh healthy heartbeat or explicitly reconfigure capacity. |
| `SOURCE_ERRORS` | DEGRADED | Sources | Inspect affected SourceDefinitions before relying on new acquisition output. |
| `WORKER_ERRORS` | DEGRADED | Workers | Inspect Worker diagnostics; restore healthy runtime state before new claims. |
| `WORKERS_OFFLINE` | DEGRADED | Workers | Restart/reconnect the runtime or disable intentionally retired Workers. |
| `RECENT_COLLECTION_FAILURES` | DEGRADED | Execution Runs | Inspect run/job evidence; do not invent an out-of-band retry. |
| `RECENT_CONVERSION_FAILURES` | DEGRADED | Conversion Runs | Inspect ConversionRun failure evidence and converter/runtime diagnostics. |
| `STALLED_CONVERSIONS` | DEGRADED | Conversion Runs | Check runtime/lease/verification evidence before intervention. |
| `SCHEDULER_ERRORS` | DEGRADED | Collection Plans | Inspect durable scheduler error plus plan/connector configuration. |
| `SCHEDULER_OVERDUE` | DEGRADED | Collection Plans | Verify Worker claim activity and scheduler state before manually dispatching anything. |
| `DELIVERY_OUTCOME_UNKNOWN` | DEGRADED | Packages | Retry only the exact frozen V2 request through the existing K16 action. |
| `DELIVERY_CONSUMER_REJECTED` | DEGRADED | Packages | Review rejection evidence; never silently rewrite or downgrade the request. |
| `READY_PACKAGE_WITHOUT_SUBMISSION` | ACTION | Packages | Explicitly prepare the intended Core delivery. |
| `DELIVERY_SAFE_TO_SUBMIT` | ACTION | Packages | Explicitly submit the already-frozen request. |
| `DELIVERY_LOCAL_FINALIZATION_REQUIRED` | ACTION | Packages | Finalize locally only; no new network request. |

## Frozen ReadyPackage V2 safety rules

K-EXT-E does not alter the K14-K16 delivery contract.

1. Never automatically retry a ReadyPackage V2 delivery.
2. `OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST` permits only an exact replay of the frozen request bytes through the existing explicit retry action.
3. `LOCAL_FINALIZATION_REQUIRED` means a durable consumer result already exists. Finalize locally and perform no network call.
4. `EVIDENCE_INCONSISTENT` is fail-closed. Do not submit, retry, finalize, infer, or repair automatically.
5. Never fall back from ReadyPackage V2 to V1.
6. Never rewrite a frozen V2 request to accommodate a consumer rejection.
7. The Operations Readiness projection must never expose `requestJson`, delivery idempotency keys, credentials, secrets, or arbitrary downstream response bodies.

## Scheduler safety rules

Operations Readiness observes scheduler state but does not tick, dispatch, or repair schedules.

The K-EXT-D scheduler remains the single durable schedule materialization path. Worker claim remains the execution path for scheduled collection work. A scheduler warning on the Dashboard is therefore diagnostic only.

## Worker safety rules

The readiness projection mirrors the existing Worker Protocol semantics:

- DISABLED and DRAINING are intentional states and are not automatically treated as faults;
- ACTIVE without a fresh heartbeat is OFFLINE;
- ERROR health is degraded;
- capacity is derived from active leases versus `maxConcurrency`;
- Worker credentials and lease tokens never enter the readiness snapshot.

## Dashboard contract

The Dashboard may display:

- Workspace identifier;
- observation timestamp;
- readiness state;
- aggregate counts;
- bounded issue codes/messages;
- recommended operator actions;
- links to existing Admin control surfaces.

The Dashboard must not become an execution surface for implicit repair. Explicit submission, retry, finalization, worker configuration, plan changes, and other state-changing operations remain in their existing controlled modules.

## Verification checklist

Before releasing a change to Operations Readiness:

- verify every SQL aggregate is Workspace-scoped;
- verify historical failures outside the configured lookback do not degrade current health;
- verify ACTION-only snapshots remain READY;
- verify delivery evidence parse/diagnosis failures become BLOCKED without leaking persisted payloads;
- verify no readiness read performs delivery transport, retry, finalization, schedule dispatch, or repair;
- run format, lint, typecheck, tests, and build on the supported Node versions;
- inspect the final PR file list for temporary workflows or debugging artifacts.
