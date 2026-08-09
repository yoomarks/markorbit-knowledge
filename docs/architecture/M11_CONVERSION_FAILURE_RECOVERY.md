# M11 — Conversion Failure Recovery

## Purpose

M9 connected successful acquisition to automatic conversion. M10 made the pre-dispatch handoff self-healing. M11 closes the next failure window: a ConversionRun was successfully dispatched but later reached `FAILED`.

The repository remains a governed source-data pipeline. Recovery only restores data processing; it does not interpret legal meaning or create final MO knowledge objects.

## Core invariant: FAILED runs remain immutable terminal history

M11 does **not** transition a failed ConversionRun back to `PENDING` or `RUNNING`.

Instead:

1. the failed ConversionRun remains terminal evidence;
2. the control plane creates a `CONVERSION_RECOVERY_CASE`;
3. retry policy determines whether and when another run may be dispatched;
4. each retry is a new ConversionRun using the same RawArtifact, ConversionProfile and requested output;
5. the recovery case records the root run, latest run and replacement-run lineage.

This preserves the existing Conversion Execution Protocol v1 state machine and keeps every execution attempt auditable.

## Retry authority

Workers never decide whether a failure should be retried. Runtime reports continue to carry `retryable: false`.

The control plane classifies failures using a conservative policy:

- automatically retryable: `TIMEOUT`, `WORKER_ERROR`, `INPUT_UNAVAILABLE`;
- conditionally retryable `CONVERTER_ERROR` codes containing transient signals such as timeout, temporary unavailability, network/rate-limit/throttling/retry;
- not automatically retryable: deterministic converter rejection, `OUTPUT_INVALID`, `VERIFICATION_FAILED`, `POLICY_REJECTED`, and unknown failures unless explicitly handled later.

The default automatic budget is three retries.

## Backoff

Automatic retries use deterministic exponential backoff:

- retry 1: 60 seconds;
- retry 2: 120 seconds;
- retry 3: 240 seconds;
- hard cap: 15 minutes.

No random jitter is used in v1 so the schedule remains reproducible and auditable.

## Recovery states

A recovery case is one of:

- `WAITING` — failed latest run is retryable and waiting for `nextRetryAt`;
- `RUNNING` — a replacement ConversionRun exists and is non-terminal;
- `RESOLVED` — latest replacement run completed;
- `DEAD_LETTERED` — the failure is non-retryable, retry budget is exhausted, a retry run was cancelled, or retry dispatch itself is blocked.

Dead-lettering never deletes the RawArtifact or failed ConversionRun.

## Reconciliation

`reconcileConversionFailures(workspaceId)` is idempotent and bounded.

It:

1. refreshes open recovery cases against their latest ConversionRun;
2. discovers untracked failed ConversionRuns;
3. creates WAITING or DEAD_LETTERED recovery cases;
4. dispatches due WAITING retries with deterministic idempotency keys;
5. resolves cases whose latest replacement run completed.

The production Conversion Worker claim route authenticates the Worker first and then performs a bounded M11 reconciliation before claiming work. A recovery-scan failure is fail-open: it does not block already queued ConversionRuns.

## Crash safety

Retry dispatch and recovery-case update are deliberately separated by an idempotency boundary.

If the process crashes after a replacement ConversionRun is created but before the case is updated, the next reconciliation reuses the same deterministic dispatch idempotency key. The ConversionRun ledger replays the existing run instead of creating a duplicate.

## Operator recovery

Read-only recovery state:

`GET /api/conversion-recovery?workspaceId=...`

Manual reconciliation:

`POST /api/conversion-recovery/reconcile`

Explicit operator retry of a WAITING or DEAD_LETTERED case:

`POST /api/conversion-recovery/{id}/retry`

Operator retry is explicit and separately counted. It does not silently switch ConversionProfile or Converter. If the original profile is no longer active/compatible, dispatch fails and the case remains auditable as dead-lettered.

## Boundaries

M11 does not:

- schedule or authorize source collection;
- reopen or rewrite FAILED ConversionRuns;
- allow Workers to request retries;
- silently change the authorized ConversionProfile;
- silently route a failed text-PDF conversion to OCR;
- infer legal rules, deadlines, applicability or conflicts;
- build a legal ontology/knowledge graph;
- generate final MO answers.

Resulting data path:

`RawArtifact → ConversionRun FAILED → RecoveryCase → backoff → replacement ConversionRun → Staging → Verification → Retrieval`
