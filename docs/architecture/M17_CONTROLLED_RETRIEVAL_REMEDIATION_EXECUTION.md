# M17 Controlled Retrieval Remediation Execution

M17 turns selected M16 remediation plans into explicit, auditable operator actions without creating an autonomous repair loop.

## Scope

M17 may mutate only derived retrieval state when the repair can be reconstructed deterministically from already persisted retrieval evidence.

Supported controlled actions:

1. `RECONCILE_CURRENT_VERSION`
   - rebuilds the `is_current` projection for one logical retrieval document;
   - selects the highest persisted artifact version as current;
   - preserves every historical retrieval version.

2. `REBUILD_RETRIEVAL_INDEX`
   - executable only when the current index-quality failure is limited to `FTS_ROW_COUNT_MISMATCH`;
   - rebuilds FTS rows from persisted retrieval chunks;
   - does not regenerate or rewrite chunks.

## Explicit approval boundary

Every execution requires:

- `approved=true`;
- an operator `actorId`;
- an `idempotencyKey`;
- an action that is still required by the current M14 quality audit.

A successful execution is written to `retrieval_remediation_executions`. Replaying the same idempotency key with the same request returns the recorded execution. Reusing the key for a different action, document, or actor is rejected.

## Refused execution paths

M17 deliberately refuses:

- `RESTORE_PROVENANCE_EVIDENCE` — missing or inconsistent RawArtifact/StagingDocument/ReadyPackage evidence must be recovered through governed evidence handling or a new acquisition/conversion version;
- `REVIEW_DUPLICATE_CHUNKING` — review-only; no destructive deduplication is authorized;
- chunk structure failures such as `NO_CHUNKS`, `CHUNK_COUNT_MISMATCH`, `CHUNK_ORDINAL_GAP`, or `EMPTY_CHUNK` — these require reindexing from verified canonical Markdown through the existing indexing boundary.

M17 does not reacquire sources, reconvert documents, alter canonical Markdown, delete evidence, broaden collection scope, schedule repairs, or make legal/semantic judgments.

## API

`GET /api/retrieval/remediation/executions?workspaceId=...&limit=50`

Returns the operator execution ledger for the workspace.

`POST /api/retrieval/remediation/executions`

```json
{
  "workspaceId": "wsp_...",
  "stagingDocumentId": "std_...",
  "actionCode": "REBUILD_RETRIEVAL_INDEX",
  "actorId": "operator:example",
  "idempotencyKey": "incident-2026-08-09-001",
  "approved": true
}
```

The executor reruns the quality audit before the mutation and again inside the same transaction after the mutation. The transaction is committed only when the requested derived-state gap is cleared and the execution ledger entry is persisted.
