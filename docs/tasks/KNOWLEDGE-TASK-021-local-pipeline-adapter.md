# KNOWLEDGE-TASK-021 — Local Pipeline Adapter

Bind TASK-020's controlled fixture pipeline to the existing persistence repositories through a structural control-plane adapter.

## Scope

- Delegate claim to the Conversion Runtime persistence repository.
- Resolve Source identity from the persisted ConversionRun.
- Delegate generated Markdown ingest to the immutable Staging registry.
- Delegate Staging verification and verified finalization to their existing control-plane repositories.
- Provide bounded local memory input and single-use local output adapters for deterministic integration use.
- Preserve Worker and verifier authority boundaries.

## Non-goals

No new state machine, migration, scheduler, polling loop, automatic retry, HTTP endpoint, production artifact transport, Obsidian adapter, Ready Package, AI extraction, semantic analysis or MarkOrbit Core behavior.
