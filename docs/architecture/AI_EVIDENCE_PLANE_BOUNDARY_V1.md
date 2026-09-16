# AI Evidence Plane Boundary V1

Status: **K0-2 owner seam frozen**

Issue: `#758`

## Purpose

MarkOrbit Knowledge may acquire evidence from AI providers, but it is not a second Brain. The canonical boundary is:

```text
Brain / Method research intent
        ↓ opaque governed execution identity
Knowledge bounded provider acquisition
        ↓
Exact provider response + provenance + immutable evidence
        ↓
Brain / Method interpretation, synthesis and distillation
```

Knowledge owns the Evidence Plane. Brain/Method owns cognitive meaning.

## Knowledge-owned AI evidence

Knowledge may own and enforce:

- bounded provider transport and delivery safety;
- provider/model/request identity;
- exact raw provider-response preservation;
- hashes, timestamps, byte size and content-addressed lineage;
- acquisition authorization evidence and retry/recovery safety;
- source/citation structure checks that explicitly do not verify semantic claim coverage;

## Health / readiness boundary

K0-5 health/readiness projections remain Evidence Plane controls or objective operational diagnostics. They may report coverage, freshness, failures, backlog, delivery evidence and bounded readiness reasons, but they do not create cognitive meaning or action authority. The canonical hierarchy and cross-system owner map are frozen in `docs/architecture/K0_HEALTH_READINESS_TAXONOMY_AND_OWNER_MAP.md`.

## Post-K0 cognitive migration guard

Issue `#767` turns this frozen boundary into a migration queue. `AI_COGNITIVE_MIGRATION_LEDGER_V1` records every `DEPRECATE` and `MOVE-TO-BRAIN` module together with its current compatibility users, persisted-data dependencies, Brain/Method handoff target and bounded retirement condition.

The integration guard rejects new production call sites outside the frozen allowlist. Historical ADK data and provider evidence adapters remain readable; the guard does not authorize deletion or provider-capability removal.
