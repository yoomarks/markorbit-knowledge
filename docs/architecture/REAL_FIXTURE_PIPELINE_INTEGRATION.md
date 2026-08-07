# Real Fixture Pipeline Integration

TASK-024 uses the disposable TASK-023 harness to execute the controlled text-to-Markdown pipeline through real local persistence and content boundaries. Each scenario uses an isolated database and CAS root.

## Success scenario

The integration fixture creates a real Source, CollectionPlan, Worker, RawArtifact, ConversionProfile, ConversionRun and Conversion Worker capability. `ControlledFixturePipeline` then performs claim, authenticated STARTED/progress/output-ready reports, immutable Staging CAS ingest, built-in verification and verifier-owned finalization.

Acceptance requires the persisted projection to show:

- ConversionRun `COMPLETED`;
- Attempt `OUTPUT_REPORTED`;
- Lease `RELEASED`;
- Staging document `READY`;
- verification `PASS`;
- CAS bytes matching the descriptor SHA-256.

## Blocked scenario

The failure scenario uses the same real pipeline. Immediately before verification, the test injects a controlled persisted input-hash mismatch. The real verifier must detect the binding failure and persist `BLOCKED/FAIL`; the real finalizer must then transition the ConversionRun to `FAILED`.

The test does not supply a fabricated verification outcome, READY/BLOCKED descriptor or terminal decision.

## Authority boundaries

Worker authority remains limited to STARTED, progress, output-ready and structured Worker failure. Verification and finalization remain control-plane-owned. The integration package contains no production runtime API.

## Non-goals

No scheduler, polling, retry loop, HTTP API, production object store, Obsidian adapter, Ready Package, AI extraction, semantic analysis or MarkOrbit Core behavior is added.
