# Conversion Execution & Staging Output Protocol v1

## Status

**Locked contract baseline. Runtime and persistence are not authorized by this document.**

## Purpose

Conversion Control Protocol v1 records which converter version may process a RawArtifact and how a Conversion Profile intends to produce Markdown. Conversion Execution Protocol v1 defines the evidence required for a future controlled runtime to perform that intent without confusing intent, execution, verification and persisted staging output.

```text
RawArtifact
  + exact ConversionProfile snapshot
  + exact ConverterManifest snapshot
  ↓
ConversionRun
  ↓ append-only ConversionExecutionEvent
PENDING → RUNNING → VERIFYING → COMPLETED
             ↘ FAILED
PENDING → CANCELLED
  ↓
StagingDocumentDescriptor
```

This protocol does not execute a converter and does not write a Markdown file.

## Contract objects

### ConversionRun

A `ConversionRun` is durable conversion intent plus immutable execution evidence. It carries:

- typed `cvr_` identity;
- Workspace, Source and RawArtifact references;
- exact active Conversion Profile and Converter Manifest snapshots;
- immutable input kind, MIME type, SHA-256 and byte size;
- trigger, actor and idempotency key;
- requested output format and target path template;
- lifecycle timestamps;
- structured failure evidence or verified Staging output evidence at a terminal state.

The snapshots are validated as a coherent set. Profile identity, Workspace scope, optional Source scope, exact Converter version, input compatibility and output request must all agree.

### ConversionExecutionEvent

A `ConversionExecutionEvent` is an append-only event with:

- typed `cve_` identity;
- run identity and positive sequence;
- previous and resulting status;
- event type, timestamp and actor;
- exactly one event-specific progress, verification, completion or failure payload when required.

An event is evidence, not a command. It cannot embed Markdown, YAML, binary bytes, credentials or executable instructions.

### StagingDocumentDescriptor

A `StagingDocumentDescriptor` describes future immutable Markdown output without embedding or writing the document body. It carries:

- typed `std_` identity;
- complete Workspace, Source, RawArtifact and ConversionRun provenance;
- normalized relative `.md` target path;
- SHA-256, byte size and `cas:sha256:<digest>` reference;
- frontmatter field names and value types, never unrestricted values;
- exact Converter identity and version;
- generated timestamp;
- structured validation checks and warnings;
- `GENERATED | READY | BLOCKED | ARCHIVED` status.

`READY` requires `PASS` or `PASS_WITH_WARNINGS`. `BLOCKED` requires `FAIL`. A completed ConversionRun requires a `READY` descriptor whose provenance, Converter and run identity match the ConversionRun.

## Lifecycle rules

| From        | To          | Meaning                               |
| ----------- | ----------- | ------------------------------------- |
| none        | `PENDING`   | Durable intent was created            |
| `PENDING`   | `RUNNING`   | Exact Converter execution started     |
| `PENDING`   | `CANCELLED` | Intent was cancelled before execution |
| `RUNNING`   | `RUNNING`   | Append-only progress evidence         |
| `RUNNING`   | `VERIFYING` | Output metadata entered verification  |
| `RUNNING`   | `FAILED`    | Execution failed terminally           |
| `VERIFYING` | `COMPLETED` | Verified Staging evidence is ready    |
| `VERIFYING` | `FAILED`    | Verification failed terminally        |

`COMPLETED`, `FAILED` and `CANCELLED` are terminal. No transition creates a retry object.

## Terminal evidence

- `COMPLETED` requires start, verification and completion timestamps plus a valid `READY` StagingDocumentDescriptor.
- `FAILED` requires execution start, failure timestamp and structured failure evidence.
- `CANCELLED` requires a cancellation timestamp and is valid only before execution starts.

A content hash or filename alone is not completion evidence.

## Security boundary

All contract roots and structured nested objects reject unknown fields. Recursive validation rejects credential-bearing and executable field families, including passwords, tokens, API keys, secrets, commands, shells, scripts, executables and argument vectors.

The protocol also rejects embedded Markdown, YAML, body content or binary payload fields. Content is represented only by bounded metadata and content-addressed identity.

## Ownership boundary

MarkOrbit Knowledge owns acquisition, immutable RawArtifact evidence, controlled conversion and Staging output evidence. It does not infer legal meaning, classify knowledge, build Capabilities, score value or recommend actions. Those functions remain in MarkOrbit Core after a governed Ready Package handoff.

## Deferred implementation

A later task may add:

- `conversion_runs` and append-only event persistence;
- authenticated runtime transitions;
- controlled built-in fixture conversion;
- immutable Markdown/YAML storage;
- Staging Document Registry and administration UI.

That later work must consume this protocol unchanged or introduce a separately reviewed protocol version. It must not silently add OCR, PDF/DOCX execution, automatic scheduling, retries, Obsidian writes or Core semantics.
