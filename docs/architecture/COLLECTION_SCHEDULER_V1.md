# Collection Scheduler V1

## Purpose

Collection Scheduler V1 turns an ACTIVE CollectionPlan's declarative schedule into governed `CollectionRun` + `Job` records. It does not execute acquisition itself and it does not create a second execution system.

The runtime reuses the existing execution ledger, Worker claim protocol, immutable plan/source/connector snapshots and normal RawArtifact ingestion path.

## Supported schedule modes

The scheduler understands the existing CollectionPlan schedule contract:

- `MANUAL` — not scheduled;
- `INTERVAL` — recurring interval in seconds;
- `CRON` — standard five-field cron expression evaluated in the plan's declared IANA timezone;
- `CHANGE_WATCH` — recurring polling interval that materializes the existing `PAGE_UPDATE_CHECK` job type.

Change Watch deliberately reuses the existing update-check execution path. It is not a separate diff engine.

## Durable state

Migration `0018_collection_scheduler_runtime` stores per-plan scheduler state including:

- Workspace and plan identity;
- schedule mode and schedule fingerprint;
- runtime state: `NOT_SCHEDULED`, `PAUSED`, `SCHEDULED`, or `ERROR`;
- next due time;
- last materialized slot;
- last trigger time and Run identity;
- bounded scheduler error evidence;
- update time.

The schedule fingerprint lets runtime state be reconciled when the declarative CollectionPlan schedule changes.

## Materialization rules

A scheduler tick examines eligible ACTIVE non-manual plans and materializes due work through the normal execution ledger.

Key rules:

1. A newly observed recurring schedule is initialized in the future; creation of a plan does not imply an immediate catch-up Run.
2. A due schedule creates a governed `SCHEDULED` CollectionRun and its normal job type.
3. Scheduled Runs identify the system actor as `collection-scheduler`.
4. Missed recurring intervals produce at most one catch-up Run per tick/reconciliation boundary; the scheduler does not create an unbounded storm of historical runs.
5. Paused plans do not materialize work.
6. Resume performs bounded reconciliation and can create only the due catch-up allowed by the same slot rules.
7. A restart or state-write lag replays the exact schedule slot idempotently rather than duplicating a Run.
8. Invalid cron/timezone/schedule configuration fails closed into scheduler `ERROR` state and creates no Run.
9. Scheduler errors do not authorize mutation of already-existing execution evidence.

## Runtime trigger

The production control plane materializes due schedules immediately before an authenticated Worker claim.

`POST /api/worker/v1/claim` performs these steps:

1. authenticate the Worker credential;
2. invoke one scheduler tick;
3. isolate/log scheduler failure so already-PENDING work remains claimable;
4. run the normal compatible Worker claim.

This means recurring work is driven by active Worker polling without introducing a separate background scheduler daemon in v0.1.

The authentication order is intentional: an unauthenticated caller cannot trigger scheduler side effects through the Worker claim endpoint.

## Inspection API

`GET /api/scheduler` is read-only.

- `?planId=<id>` returns one scheduler state;
- optional `workspaceId` and `limit` list scheduler states.

Operations Readiness also summarizes active automatic plans, initialization gaps, scheduler errors and overdue schedules.

## Failure and retry boundary

Scheduler materialization is not automatic execution retry.

A recurring schedule may create a future independent Run for a future schedule slot, but a terminally failed Run is not silently retried by the scheduler. Existing execution retry/recovery rules remain authoritative.

Likewise, Change Watch schedules future `PAGE_UPDATE_CHECK` work; they do not overwrite prior RawArtifact or change evidence.

## Non-goals

V1 does not provide:

- a separate always-on scheduler service;
- unbounded replay of every missed historical interval;
- arbitrary remote Worker code execution;
- automatic retry of terminal CollectionRuns;
- automatic ReadyPackage delivery retry;
- automatic Vault synchronization;
- a second change/diff engine.

A future dedicated scheduler daemon may call the same durable scheduler repository if deployment topology requires it, but it must preserve the same slot idempotency and execution-ledger boundaries.
