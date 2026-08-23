# SUPERSEDED — MarkOrbit/Core ReadyPackage V2 Receiver task

> **Do not execute this file as the current task baseline.**
>
> This document was issued by Knowledge PR #396 and contains a factual drift: it can be read as requiring a new Core V2 receiver. Core PR #91 had already implemented the WP01/WP02 baseline before this task was issued.

## Correct factual state

- Core PR #91 already implemented the existing ReadyPackage V2 ingress and durable delivery ledger baseline.
- PR #91 merge SHA: `0551fc49a9adb683463162237f71de8970807020`.
- Existing migration: `0048_core_knowledge_v2_deliveries`.
- Existing endpoint: `POST /internal/knowledge/ready-packages/v2/deliveries`.
- Existing body limit: 12 MiB.
- Current normal successful durable status at the locked Core baseline is `RECEIVED`.
- `CORE-KV2-WP-01` is baseline-implemented and requires regression verification, not replacement.
- `CORE-KV2-WP-02` is baseline-implemented; any required persistence enhancement must use a new migration and must never rewrite migration 0048.
- Current implementation scope is primarily `CORE-KV2-WP-03`, `CORE-KV2-WP-04`, and `CORE-KV2-WP-05`.
- No second V2 endpoint, second delivery identity, or replacement ledger is authorized.

## Authoritative execution baseline

Use instead:

- `docs/tasks/MarkOrbit_Core_Knowledge_Formal_Integration_Task_2026-08-23.md`
- integration ID: `MO-KNOWLEDGE-CORE-KV2-COMPLETION-2026-08-23`
- machine-readable ledger: `docs/integrations/core-ready-package-v2/integration-status.yaml`
- Knowledge frozen protocol baseline: `3932b7cd5ee0235d3bb0f9e23ceab7cc71e45f7d`
- Core implementation baseline: `a8035efff46a2e71a4613abd1927b18dadff086b`

The frozen Knowledge protocol sources remain unchanged. This correction changes task/documentation governance only; it does not redefine the ReadyPackage V2 Delivery Protocol or Content Export V2 contract.

Production activation remains explicitly unauthorized.
