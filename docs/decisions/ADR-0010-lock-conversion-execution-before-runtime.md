# ADR-0010: Lock conversion execution before runtime

- Status: Accepted
- Date: 2026-07-17
- Decision owners: MarkOrbit Knowledge

## Context

The repository now persists immutable RawArtifacts, Converter Manifests and Conversion Profiles. Implementing converter execution before defining execution identity, lifecycle, terminal evidence and Staging output provenance would allow runtime code to invent incompatible state transitions and ambiguous success claims.

Conversion intent, converter execution, output verification, Staging persistence, Obsidian synchronization and MarkOrbit Core semantic processing are separate responsibilities.

## Decision

Adopt Conversion Execution Protocol v1 before adding conversion persistence or runtime behavior.

The protocol defines three strict objects:

1. `ConversionRun` for durable conversion intent and immutable snapshots;
2. append-only `ConversionExecutionEvent` for ordered lifecycle evidence;
3. `StagingDocumentDescriptor` for verified content-addressed Markdown metadata without the document body.

The only lifecycle is:

```text
PENDING → RUNNING → VERIFYING → COMPLETED
             ↘ FAILED
PENDING → CANCELLED
```

Terminal states cannot transition. No transition automatically creates a retry.

`COMPLETED` requires valid, provenance-matched, `READY` StagingDocumentDescriptor evidence. A future runtime may not claim completion using only a filename, count or unverified hash.

## Security decision

Contract roots and structured nested records reject unknown fields. Recursive guards reject secret-bearing, credential-bearing and executable instruction fields. Events and descriptors may not embed Markdown, YAML, body content, arbitrary binary bytes or resolved secrets.

Content evidence uses SHA-256, byte size and a content-addressed reference.

## Consequences

Positive consequences:

- persistence and runtime implementations receive a stable state machine;
- exact Profile and Converter snapshots preserve reproducibility;
- Staging output cannot be confused with RawArtifact or Core knowledge;
- terminal success requires auditable output evidence;
- retries, scheduling and Obsidian writes remain explicit later decisions.

Costs:

- runtime delivery is delayed until the contract is reviewed;
- future protocol changes require versioning and compatibility review;
- the initial contract supports Markdown output only.

## Rejected alternatives

### Execute built-in converters immediately

Rejected because runtime behavior would establish de facto contracts before lifecycle and evidence rules were locked.

### Reuse Job execution lifecycle objects

Rejected because collection Jobs and ConversionRuns have different inputs, snapshots, output evidence and ownership boundaries.

### Store Markdown bodies in events

Rejected because events are audit evidence, not document storage, and body embedding creates duplication, size and security problems.

### Mark conversion complete before verification

Rejected because generated output is not necessarily valid Staging evidence.

## Follow-up authorization

This ADR authorizes contract implementation and tests only. It does not authorize:

- converter execution;
- conversion-run persistence;
- Markdown or YAML file creation;
- OCR, PDF, DOCX or browser dependencies;
- automatic conversion scheduling or retries;
- Obsidian Vault writes;
- MarkOrbit Core semantic processing.
