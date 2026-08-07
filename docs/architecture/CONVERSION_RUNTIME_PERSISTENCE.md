# Conversion Runtime Persistence

## Responsibility

Migration `0010_conversion_runtime_lease_attempt` adds the first durable persistence boundary for Conversion Runtime Protocol v1. It stores validated canonical JSON for conversion worker capabilities, conversion leases, conversion attempts, input read grants, output upload grants and claim-idempotency records. Structured SQLite columns exist only for filtering, uniqueness, concurrency and lifecycle coordination.

## Worker identity reuse

The persistence layer reuses `worker_definitions`, Worker credentials, heartbeat, desired-state and health concepts. It does not create a second Worker Registry. A `ConversionWorkerCapability` is an independently versioned declaration bound to an existing `wrk_` identity.

## Claim transaction

A claim executes under `BEGIN IMMEDIATE` and validates:

- the strict `ConversionClaimRequest` contract;
- Worker existence, Workspace scope and ACTIVE desired state;
- the exact active capability revision;
- exact Converter ID/version support;
- artifact kind, MIME and output compatibility;
- the ConversionRun remains PENDING;
- no effective ACTIVE conversion lease already exists;
- the target Markdown path can be normalized.

A successful claim atomically persists one ACTIVE `ConversionLease`, one CLAIMED `ConversionAttempt`, one scoped `RawArtifactReadGrant`, one scoped `StagingOutputUploadGrant` and one claim-idempotency result. Claim does not transition the ConversionRun to RUNNING. Execution start remains reserved for the later authenticated runtime-report boundary.

If no compatible unleased PENDING run exists, the repository persists and returns a stable `NO_COMPATIBLE_WORK` result for the request idempotency key.

## Idempotency

Claim idempotency is scoped by Workspace, Worker and idempotency key. The canonical request digest is stored with the canonical result:

- same key and same request returns the original result;
- same key and different request returns `CONVERSION_CLAIM_IDEMPOTENCY_CONFLICT`;
- replay never creates another lease, attempt or grant.

## Exclusive lease

A partial unique index enforces at most one ACTIVE conversion lease per ConversionRun. Lease rows persist only `tokenReference` and SHA-256 `tokenDigest`; bearer-token plaintext is never written to canonical JSON, indexes, grants or claim results.

Renewal increments the lease generation and rotates token evidence. It cannot extend beyond `renewableUntil`.

## Attempt lifecycle

TASK-014 persists only pre-execution attempt semantics:

- claim creates `CLAIMED`;
- release before start creates `ABANDONED` with reconciliation evidence;
- expiry before start creates `LEASE_LOST` with reconciliation evidence.

A started attempt cannot be returned to PENDING by this repository. STARTED, progress, output reporting, VERIFYING and terminal runtime failure remain deferred to authenticated runtime transitions.

## Grants

Read and upload grants are metadata-only, Worker/Run/Attempt scoped and expire with the lease. They do not contain RawArtifact bytes, Markdown, credentials or bearer tokens. Workers still cannot write directly to an Obsidian Vault or create READY staging evidence.

## Restart and concurrency

Canonical lease, attempt, grant and claim records survive database restart. `BEGIN IMMEDIATE`, the partial ACTIVE-lease unique index and claim-idempotency primary key serialize competing claims and prevent duplicate active ownership.

## Deferred work

Deferred: authenticated claim HTTP API, STARTED/progress/output/failure report APIs, converter execution, fixture converter execution, content delivery, staging upload runtime, Markdown generation, Staging CAS/Registry, verification, scheduler, retry/dead-letter, Obsidian, Ready Package and MarkOrbit Core semantics.
