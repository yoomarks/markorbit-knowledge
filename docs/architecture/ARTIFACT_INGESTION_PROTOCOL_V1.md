# Artifact Ingestion Protocol v1

## Status

Accepted for `KNOWLEDGE-TASK-009`.

## Purpose

Artifact Ingestion Protocol v1 defines the durable evidence boundary between controlled Worker execution and MarkOrbit Knowledge staging.

```text
Worker execution
      ↓
Authenticated ingestion session
      ↓
Streamed bytes
      ↓
Size and SHA-256 verification
      ↓
Local content-addressed object store
      ↓
Immutable RawArtifact registry
```

It does not interpret content, perform semantic deduplication, convert documents, synchronize Obsidian, or create MarkOrbit Core knowledge objects.

## Canonical objects

The protocol introduces strict transport and evidence objects without changing locked Schema v1:

- `ArtifactUploadDescriptor`
- `ArtifactIngestionSession`
- `ArtifactVerificationResult`
- `ArtifactIngestionReceipt`
- `ArtifactIngestionEvent`
- `ArtifactIngestionFailure`

A finalized upload creates a canonical Schema v1 `RawArtifact`.

## State model

```text
CREATED
  ↓
UPLOADING
  ↓
VERIFIED
  ↓
FINALIZED
```

Terminal alternatives:

```text
ABORTED
QUARANTINED
```

`FINALIZED` is immutable. Reusing the same Workspace-scoped idempotency key with the same descriptor returns the original session or receipt; conflicting reuse is rejected.

## Authentication and ownership

Worker ingestion requires all of the following:

- valid Worker ID and one-time-issued Worker credential;
- active Job lease and lease token;
- matching Worker and lease ownership;
- non-terminal controlled execution attempt;
- matching Workspace, CollectionRun, Job, source and exact Connector version inherited from execution snapshots.

Plaintext Worker credentials and lease tokens are never persisted or returned by administration APIs.

## Streaming and verification

Normal JSON requests carry metadata only. File bodies are accepted through a streaming content endpoint.

The server:

1. enforces the configured byte limit while reading chunks;
2. calculates observed SHA-256 and byte size;
3. compares declared and observed identity;
4. quarantines mismatches;
5. permits finalization only after successful verification.

The default maximum is 100 MiB and can be overridden through `MARKORBIT_ARTIFACT_MAX_BYTES`.

## Local content-addressed storage

The reference adapter stores objects under a configurable root:

```text
.data/artifacts/
├── objects/sha256/ab/cd/<full-digest>
├── sessions/<session-id>/content.part
└── quarantine/
```

Rules:

- object identity is the SHA-256 digest, never a caller-selected path;
- original filenames are sanitized metadata only;
- writes use restricted temporary files;
- object directories and files must not be symlinks;
- existing objects are rehashed before reuse;
- identical bytes are physically stored once;
- distinct source and execution provenance remains represented by distinct RawArtifacts;
- storage-root escape and absolute-path input are rejected.

The local adapter is replaceable; Schema v1 RawArtifact storage references remain provider-neutral.

## Persistence

Migration `0007_raw_artifact_ingestion` adds:

- `artifact_ingestion_sessions`
- `artifact_ingestion_events`
- `content_objects`
- `raw_artifacts`

RawArtifact JSON is validated against Schema v1 before persistence and after retrieval. Protocol objects are likewise validated before write and after read.

## Provenance

Every Worker-produced RawArtifact preserves or can deterministically resolve:

- Workspace and SourceDefinition;
- CollectionRun and its immutable source/plan/Connector snapshots;
- Job ID and attempt;
- execution attempt;
- Worker and lease ownership;
- Connector ID and exact version;
- source and canonical URI;
- acquisition time;
- MIME type, original filename and byte size;
- SHA-256 content identity;
- storage object reference;
- parent artifact relationships when declared.

## Execution completion gating

Metadata-only fixture executions remain supported.

An artifact-backed execution receipt must list finalized ingestion receipt IDs. Completion is rejected unless:

- every receipt is finalized;
- every artifact belongs to the completing execution attempt;
- declared artifact kinds equal observed kinds;
- item count and total byte count equal registered evidence.

Raw bytes and local absolute paths never appear in execution receipts.

## Administration surface

The Files/Artifacts module provides:

- real RawArtifact list and filters;
- content hash, size, type, version and status;
- provenance links to source, run, Job and execution;
- physical object reference counts;
- ingestion audit timeline;
- controlled attachment download with `nosniff`, sandbox and no-store headers.

Untrusted HTML and active content are not rendered inline.

## Deferred work

The following remain outside this protocol and Task 009:

- Crawl4AI and browser execution;
- manual-upload user experience and authorization policy;
- cloud object-store adapters;
- malware scanning;
- OCR and document parsing;
- Markdown conversion;
- semantic or near-duplicate analysis;
- substantive version preference;
- automatic retry scheduling;
- Obsidian synchronization;
- MarkOrbit Core understanding and value extraction.
