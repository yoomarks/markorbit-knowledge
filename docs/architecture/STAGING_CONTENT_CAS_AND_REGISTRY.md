# Immutable Staging Content CAS and Registry

## Scope

TASK-017 adds the first durable Staging content boundary after a Conversion Worker has submitted authenticated output-ready evidence.

The repository stores Markdown bytes in an immutable local SHA-256 content-addressed store and registers a protocol-valid `StagingDocumentDescriptor` with status `GENERATED`.

It does not verify frontmatter, mark a document `READY`, complete a ConversionRun or write an Obsidian Vault. The control plane owns the registry record; the Worker supplies bytes and evidence but cannot mutate the registered descriptor.

## Migration 0012

Migration `0012_staging_content_registry` adds:

- `staging_content_objects`, one immutable row per SHA-256 Markdown object;
- `staging_documents`, Workspace-scoped descriptor metadata;
- `staging_content_ingest_idempotency`, replay/conflict evidence for controlled ingest;
- indexes for Workspace/status and Source listing.

A ConversionRun can have at most one registered Staging document. A Workspace target path cannot be rebound to different immutable content.

## Ingest authorization

`ingestGenerated` requires and cross-checks:

- Workspace, Worker, ConversionRun and ConversionAttempt identity;
- a persisted `StagingOutputUploadGrant`;
- `VERIFYING` ConversionRun status;
- `OUTPUT_REPORTED` ConversionAttempt status;
- a persisted `ConversionOutputReadyReport`;
- exact target path, media type, SHA-256 and byte size;
- the upload grant byte limit and report-time expiry boundary.

The content body is never stored in an execution event or report.

## CAS layout

Markdown is stored beneath a configured repository root:

```text
sha256/<first-two-digest-characters>/<full-sha256>.md
```

The descriptor uses:

```text
cas:sha256:<full-sha256>
```

Existing CAS bytes are re-read and checked for exact digest and size before reuse. Controlled reads also re-verify digest and size so filesystem tampering is detected.

## Atomicity and idempotency

The SQLite registry mutation runs under `BEGIN IMMEDIATE`.

Idempotency is scoped by Workspace + Worker + key:

- same key and same canonical metadata/content digest returns the original descriptor;
- same key with different metadata or bytes returns a stable conflict;
- replay does not create another CAS row or Staging descriptor.

A temporary file is atomically renamed into the CAS path. Failed database writes remove newly unreferenced content.

## Descriptor status

TASK-017 creates only `GENERATED` descriptors. `frontmatterSummary` remains empty and validation evidence remains provisional until the separate Staging Verification Pipeline inspects the persisted bytes.

The next verification task may transition the registered descriptor to:

- `READY` with PASS or PASS_WITH_WARNINGS evidence;
- `BLOCKED` with FAIL evidence.

Only a verifier-owned READY descriptor may complete a ConversionRun.

## Security boundary

The registry rejects:

- arbitrary or mutable output paths;
- content that differs from output-ready evidence;
- cross-Workspace, cross-Worker, cross-Run or cross-Attempt scope;
- oversized or empty content;
- target-path overwrite with different content;
- missing or modified CAS bytes.

No bearer tokens, credentials, commands, scripts, executables or Vault paths are persisted.

## Deferred work

Deferred: frontmatter parsing and schema validation, READY/BLOCKED transitions, verifier integration, Staging administration UI, production object storage, retention/GC, Obsidian adapter, Ready Package publishing and MarkOrbit Core semantics.
