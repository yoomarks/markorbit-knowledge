# KNOWLEDGE-TASK-020 — Controlled End-to-End Fixture Pipeline

Compose claim, controlled fixture execution, Staging ingest, verification and finalization into one explicitly invoked pipeline.

The pipeline preserves existing Worker and verifier authority, derives deterministic phase idempotency keys, stops after one Worker failure and does not retry automatically.

Post-output processing remains owned by the control plane.

Deferred: scheduler, polling, retry, Obsidian, Ready Package, AI extraction, semantic analysis, production object storage and MarkOrbit Core behavior.
