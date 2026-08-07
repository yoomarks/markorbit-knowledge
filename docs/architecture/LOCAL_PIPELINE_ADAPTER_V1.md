# Local Pipeline Adapter v1

TASK-021 binds the controlled fixture pipeline to the existing persistence repositories without creating a second state machine.

## Components

- `PersistenceControlledFixtureControlPlane` adapts claim, ConversionRun lookup, Staging ingest, Staging verification and verified finalization repositories.
- `LocalRawArtifactMemoryReader` provides deterministic grant-bound local input bytes.
- `LocalSingleOutputUploader` accepts one bounded Markdown output per upload grant and returns digest evidence.

## Authority

The adapter delegates all state changes to the existing TASK-014 through TASK-019 repositories. It does not let a Worker mark a Staging document READY/BLOCKED or complete a ConversionRun.

## Local boundary

The memory reader and uploader are an integration harness, not production storage. Input bytes must match the read grant size and SHA-256. Output is immutable per upload grant and bounded by the upload grant maximum.

## Deferred work

Deferred: production RawArtifact transport, durable upload sessions, scheduler, polling, retry, HTTP API, Obsidian, Ready Package, AI extraction, semantic analysis and MarkOrbit Core behavior.
