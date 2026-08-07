# KNOWLEDGE-TASK-022 — Conversion Pipeline Inspection Projection v1

Provide one read-only Workspace-scoped view of ConversionRun, latest Attempt, latest Lease, Staging descriptor and verification evidence.

## Acceptance

- deterministic get/list APIs;
- Workspace is mandatory;
- filtering and bounded pagination;
- authoritative JSON is validated while reading;
- no mutation, credentials, token material or content bytes;
- no new state machine or migration;
- Node.js 22 and 24 validation passes.

## Non-goals

No scheduler, polling, retry, HTTP, Admin UI, Obsidian, Ready Package, AI extraction, semantic analysis or MarkOrbit Core behavior.
