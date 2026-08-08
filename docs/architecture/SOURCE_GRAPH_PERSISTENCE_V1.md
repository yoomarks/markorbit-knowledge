# Source Graph Persistence v1

## Status

Implementation architecture for Source Graph Protocol v1. This document implements ADR-0012 without changing locked acquisition Schema v1.

## Durable boundary

```text
WEB SourceDefinition
        ↓ 1:1
WebsiteSourceProfile
        ↓
Website / Section / Page / Document / Sitemap
Organization / Person / Contact Point observations
        ↓
Source-local evidence edges
```

`SourceDefinition` remains the governed acquisition identity. `WebsiteSourceProfile` and its graph describe the internal structure observed under that source. Graph state never authorizes collection execution.

## SQLite reference persistence

The reference repository owns four independent tables:

- `source_graph_profiles` — one profile per workspace/source and one governed source per website origin;
- `source_graph_nodes` — source-local nodes, indexed by profile + identity strategy + identity key;
- `source_graph_edges` — source-local evidence relationships, deduplicated by profile + kind + endpoints;
- `source_graph_batches` — idempotent observation-batch ledger with payload hash and persisted result.

The tables deliberately do not introduce cross-registry SQLite foreign keys to Source, Discovery, Artifact or Execution registries. Those IDs are durable provenance links and business scope is validated in the service/repository boundary. This keeps registries independently bootstrappable and avoids persistence layout becoming the protocol authority.

## Observation ingestion invariants

1. Every batch must satisfy Source Graph Protocol v1 before persistence.
2. Batch workspace/source/profile scope must exactly match the registered WebsiteSourceProfile.
3. Canonical URI nodes converge on one persisted node identity inside a profile.
4. If a later batch supplies a different node ID for the same canonical identity, the first persisted node ID wins and edges are rewired to it.
5. `firstObservedAt` never moves forward; `lastObservedAt` never moves backward.
6. Provenance is merged and never silently discarded.
7. A later machine observation in `OBSERVED` state cannot downgrade an existing human `RETAINED` or `REJECTED` decision.
8. `REMOVED` is not automatically revived by a later observation. `STALE` may return to `ACTIVE` when observed again.
9. Edges cannot cross WebsiteSourceProfile boundaries and cannot point to missing nodes.
10. Reusing the same profile/idempotency key with different batch content is a conflict, not a replay.

`RETAINED` means the operator wants to preserve/use the observation. It does **not** mean that a legal proposition, professional identity, contact accuracy or service quality has been verified.

## Discovery promotion

New Discovery acceptance uses website-level governance:

```text
Seed website
  → Discovery candidates
  → first ACCEPT
  → one ACTIVE WEB SourceDefinition for the seed website
  → one PAUSED default CollectionPlan
  → one WebsiteSourceProfile
  → all candidates in that discovery batch become graph observations
  → accepted candidate becomes RETAINED
```

Additional accepted candidates from the same website reuse the same SourceDefinition and CollectionPlan. They do not create page-level sources.

When a governed website already exists, later Discovery runs write new candidate observations directly into its graph. This is an evidence update only; it does not dispatch a collection job.

## Legacy compatibility migration

Existing page-level WEB SourceDefinitions remain valid and are never deleted or rewritten merely to adopt Source Graph.

The admin compatibility projection follows these rules:

1. If the legacy source already owns a WebsiteSourceProfile, return it.
2. Otherwise, if another governed Source in the same workspace already owns the same canonical website origin, expose that graph as a compatibility projection.
3. Otherwise, create a WebsiteSourceProfile for the legacy WEB source and import its entrypoints as `RETAINED` PAGE observations.
4. Imported entrypoint nodes carry `x-markorbit-legacy-source-id` metadata so compatibility provenance remains inspectable.
5. The projection does not merge SourceDefinitions, change source authority, activate a CollectionPlan or execute a Worker.

This lets old page-level records coexist while new Discovery follows the website-level model. A later controlled consolidation project may explicitly archive redundant legacy SourceDefinitions after audit; that is outside this increment.

## Admin inspection

`GET /api/sources/:id/graph` returns the directly governed graph or a same-origin compatibility projection.

`POST /api/sources/:id/graph` performs the explicit non-destructive legacy projection for a WEB SourceDefinition.

The Source detail page exposes a `Source Map` panel showing node/edge counts, profile identity and observed nodes. It also repeats the truth boundary: graph evidence is not legal/professional verification.

## Deferred work

- graph extraction from acquired HTML/Markdown artifacts;
- Organization / Person / Contact Point extraction pipelines;
- source intelligence scoring and crawl-tier scheduling;
- cross-source entity resolution in MarkOrbit Core;
- graph diff/history views beyond first/last observation and batch ledger;
- explicit archival/consolidation workflow for redundant legacy SourceDefinitions.
