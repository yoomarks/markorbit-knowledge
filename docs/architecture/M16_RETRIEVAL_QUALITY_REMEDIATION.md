# M16 — Retrieval Quality Remediation Planner

## Purpose

M14 made retrieval corruption and provenance drift observable. M15 made that quality evidence part of FOUNDATIONAL readiness. M16 turns those audit gaps into a deterministic operator remediation plan without mutating evidence or executing repairs.

The planner answers a narrow operational question: **given a retrieval-quality audit result, what class of controlled operator action should happen next?**

It does not decide legal correctness, source authority, substantive trademark rules, deadlines, or the meaning of the underlying document.

## Flow

```text
Retrieval Quality Audit (M14)
        ↓
Retrieval Quality Remediation Planner (M16)
        ↓
Manual operator review / governed existing pipeline
        ↓
Fresh Retrieval Quality Audit
```

The M16 output is derived state. It is not a work queue, scheduler, authorization token, or repair executor.

## Protocol

`RETRIEVAL_QUALITY_REMEDIATION_PROTOCOL_VERSION = 1.0`

Per-document states:

- `NO_ACTION` — audit is `READY`;
- `REVIEW_REQUIRED` — audit is `DEGRADED` and requires human review;
- `REMEDIATION_REQUIRED` — audit is `BLOCKED`.

Every returned action has `automaticExecution: false`. List responses also carry `executionPolicy: MANUAL_ONLY`.

## Deterministic action classes

### `RESTORE_PROVENANCE_EVIDENCE`

Triggered by one or more of:

- `STAGING_DOCUMENT_MISSING`
- `READY_PACKAGE_MISSING`
- `RAW_ARTIFACT_MISSING`
- `PROVENANCE_LINK_MISMATCH`

Multiple provenance gaps collapse into one action. Operators may restore only from verifiable persisted evidence. If evidence cannot be restored, the governed acquisition/conversion path must create a new version; history must not be silently backfilled.

### `RECONCILE_CURRENT_VERSION`

Triggered by:

- `MULTIPLE_CURRENT_VERSIONS`
- `CURRENT_VERSION_NOT_LATEST`

The current-version projection is derived state. Historical retrieval versions remain preserved.

### `REBUILD_RETRIEVAL_INDEX`

Triggered by one or more of:

- `NO_CHUNKS`
- `CHUNK_COUNT_MISMATCH`
- `CHUNK_ORDINAL_GAP`
- `EMPTY_CHUNK`
- `FTS_ROW_COUNT_MISMATCH`

The intended source is verified ReadyPackage/canonical Markdown evidence. The planner itself does not invoke indexing.

### `REVIEW_DUPLICATE_CHUNKING`

Triggered by `DUPLICATE_CHUNK_CONTENT`.

This is review-only when it is the sole gap. M16 does not authorize destructive deduplication because repeated text may legitimately occur in source material.

## API

```http
GET /api/retrieval/remediation?workspaceId=<workspace>
```

Optional filters mirror M14:

- `sourceId`
- `jurisdiction`
- `includeHistorical=true|false`

Current retrieval documents remain the default. Historical versions are included only by explicit request.

## Safety and authority boundary

M16 intentionally does **not**:

- execute acquisition, conversion, indexing, deletion, or repair;
- rewrite RawArtifact, StagingDocument, ReadyPackage, or canonical content;
- delete historical retrieval versions;
- infer that missing evidence may be fabricated or reconstructed without verification;
- broaden collection scope;
- create automatic retries or schedules;
- assess legal or semantic correctness.

The operator must use the existing governed acquisition, conversion, finalization, and indexing boundaries as appropriate. After any remediation, M14 must be rerun to establish the new quality state.
