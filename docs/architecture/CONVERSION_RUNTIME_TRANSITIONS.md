# Authenticated Conversion Runtime Transitions

## Scope

TASK-015 connects persisted Conversion leases and attempts to authenticated ConversionRun lifecycle transitions. It remains a metadata-only control-plane boundary: no Converter is invoked, no RawArtifact bytes are delivered and no Markdown body is stored.

## Repository boundary

`SqliteConversionRuntimeTransitionRepository` is separate from the claim/lease repository introduced by TASK-014. The claim repository owns capability registration, claiming, renewal and pre-start release/expiry. The transition repository owns authenticated runtime reports and verifier-owned terminal decisions.

## Migration 0011

Migration `0011_conversion_runtime_transitions` adds:

- `conversion_runtime_reports`, an append-only canonical report ledger with Workspace + Worker + idempotency uniqueness;
- `conversion_verifier_transitions`, verifier/reconciler idempotency evidence;
- indexes for Run and Attempt report history.

Existing `conversion_runs`, `conversion_attempts`, `conversion_leases` and `conversion_execution_events` remain authoritative.

## Authentication and authorization

Worker reports require both:

1. a valid existing Worker credential verified through the original Worker Registry; and
2. exact binding to the persisted ACTIVE ConversionLease: Workspace, Worker, Run, Attempt, generation, token reference and token digest.

Reports for expired, released, superseded, wrong-generation, wrong-token, wrong-attempt, wrong-Workspace or stale Run status are rejected. The canonical report stores token evidence only and never stores bearer-token plaintext.

## State transitions

| Input                     | Run transition        | Attempt transition        | Lease transition  | Event                |
| ------------------------- | --------------------- | ------------------------- | ----------------- | -------------------- |
| Started report            | PENDING → RUNNING     | CLAIMED → STARTED         | ACTIVE            | STARTED              |
| Progress report           | RUNNING → RUNNING     | STARTED                   | ACTIVE            | PROGRESS_REPORTED    |
| Output-ready report       | RUNNING → VERIFYING   | STARTED → OUTPUT_REPORTED | ACTIVE → RELEASED | VERIFICATION_STARTED |
| Worker failed report      | RUNNING → FAILED      | STARTED → FAILED          | ACTIVE → RELEASED | FAILED               |
| Verifier completion       | VERIFYING → COMPLETED | OUTPUT_REPORTED           | RELEASED          | COMPLETED            |
| Verifier failure          | VERIFYING → FAILED    | OUTPUT_REPORTED           | RELEASED          | FAILED               |
| Expired lease after start | RUNNING → FAILED      | STARTED → LEASE_LOST      | ACTIVE → EXPIRED  | FAILED               |

Each transition updates Run, Attempt and Lease evidence and appends one ordered `ConversionExecutionEvent` in the same `BEGIN IMMEDIATE` transaction.

## Output evidence

An output-ready report must match its persisted `StagingOutputUploadGrant`:

- Workspace, Run, Attempt and Worker;
- normalized target path;
- media type;
- maximum size;
- grant expiry.

The report stores only digest, size, path and media type. Upload evidence does not mean verification passed.

## Verifier authority

Workers cannot mark a ConversionRun `COMPLETED`. Completion requires a control-plane verifier to provide a protocol-valid READY `StagingDocumentDescriptor` matching:

- frozen Workspace, Source, RawArtifact and ConversionRun identity;
- exact Converter ID/version;
- requested output format;
- persisted output-ready path, SHA-256 and size.

The descriptor is snapshotted into the completed ConversionRun. A later Staging CAS/Registry task may provide the authoritative content service; TASK-015 does not implement that service.

## Idempotency and concurrency

Worker report idempotency is scoped by Workspace + Worker + key. Verifier idempotency is scoped by Workspace + verifier + key.

- same key + same canonical payload returns the original transition as replay;
- same key + different payload returns a stable conflict;
- optimistic status predicates and ordered event uniqueness reject concurrent divergent transitions.

## Lease loss

A lease that expires after the Attempt has STARTED cannot return the Run to PENDING. Reconciliation records `LEASE_EXPIRED_DURING_CONVERSION`, marks the Attempt `LEASE_LOST`, expires the Lease and fails the Run. No automatic retry is created.

## Deferred work

Deferred: HTTP runtime endpoints, Converter execution, fixture Converter, RawArtifact read service, Staging upload service, Markdown/YAML generation, Staging CAS/Registry, verification implementation, scheduler, retry/dead-letter, Obsidian, Ready Package and MarkOrbit Core semantics.
