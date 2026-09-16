# AI Cognitive Migration Ledger V1

Status: **Post-K0 hardening / compatibility freeze**

Issue: `#767`

## Purpose

K0-2 (`#758`) established that Knowledge owns AI evidence acquisition and provenance, while Brain/Method owns prompt meaning, research strategy, synthesis, recommendation and semantic conclusions. Some historical AI/ADK modules remain physically present in this repository so existing rows, lineage and bounded adapters remain readable.

The machine-readable migration queue is `AI_COGNITIVE_MIGRATION_LEDGER_V1` in `packages/contracts/src/ai-cognitive-migration-ledger-v1.ts`. Every owner-map item classified `DEPRECATE` or `MOVE-TO-BRAIN` must appear exactly once.

## Migration rule

Each ledger entry freezes its target owner, current producers and consumers, persisted-data dependencies, cross-repository handoff target, compatibility rule, retirement condition and approved production call sites.

The target for cognitive ownership is `yoomarks/markorbit :: Brain/Method`. The deprecated distilled-ingestion path is the exception: raw provider evidence remains a Knowledge Evidence Plane responsibility while semantic artifacts move to Brain/Method.

## Compatibility guard

`packages/integration-tests/src/ai-cognitive-migration-guard.test.ts` parses production TypeScript imports. It resolves direct package/relative imports and named imports from the `@markorbit/contracts` barrel back to their migration-owned source module.

A new production call site to a `DEPRECATE` or `MOVE-TO-BRAIN` module fails unless that exact file is added to the ledger's `approvedCompatibilityCallSites`. Adding such an exception therefore requires an explicit architecture review instead of silently regrowing cognitive ownership.

The two legacy cognitive CLIs are also frozen to their existing package scripts only. New CLI exposure is rejected by the guard.

## Historical data rule

No table, RawArtifact, assignment, graph, library, candidate or promotion receipt is deleted by this hardening step. Existing registries remain readable and immutable according to their current contracts while migration proceeds.

Provider acquisition, authorization, retry/recovery, raw-response preservation and structural evidence validation remain in Knowledge where the Evidence Plane owner map classifies them as `KEEP-IN-KNOWLEDGE` or bounded `ADAPTER` responsibilities.

## Retirement

A migration entry can be removed only after its ledger `retirementCondition` is demonstrably true, Brain/Method owns the corresponding cognitive behavior, and historical Knowledge records remain readable through a bounded compatibility path or completed export. Retirement must shrink Knowledge cognitive surface; it must never replace it with a second local cognitive runtime.
