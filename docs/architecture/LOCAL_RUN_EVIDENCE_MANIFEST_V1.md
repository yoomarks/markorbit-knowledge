# Local Run Evidence Manifest v1

## Purpose

Each explicitly invoked local fixture pipeline run writes `run-manifest.json` beside `knowledge.sqlite` and the Staging CAS. The manifest is a redacted handoff and audit record for one terminal run.

## Envelope

The document has a fixed `schemaVersion`, `objectType`, SHA-256 digest, and `evidence` payload. Keys are serialized in canonical lexical order. The digest covers the canonical evidence payload, so readers can detect modification independently.

## Evidence

The payload records identifiers and statuses for the Workspace, Source, RawArtifact, ConversionRun, latest Attempt and Lease, Staging document, verifier result, terminal phase, database path, CAS directory, and manifest path. It records content sizes and SHA-256 values, not content bytes.

## Security boundary

The manifest must never contain Worker credentials, lease token references, token digests, RawArtifact bytes, Markdown bytes, or unrestricted runtime reports. The reader fails closed on an invalid envelope, malformed JSON, or digest mismatch.

## Write behavior

The writer creates `run-manifest.json.tmp` with exclusive-create semantics and atomically renames it to `run-manifest.json`. Existing manifests are not overwritten.

## Non-goals

This is not an Obsidian writer, Ready Package, scheduler, retry mechanism, HTTP API, semantic layer, AI extraction step, or MarkOrbit Core interface.
