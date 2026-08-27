# Cognitive Platform Phase 0 — Knowledge Audit

Status: first evidence-backed baseline.

## Confirmed current strengths

Knowledge already owns the correct slow-path primitives:

- acquisition and conversion into canonical downstream documents;
- reviewed Obsidian/Vault staging boundary;
- canonical Markdown/document identity;
- provenance, version/hash and source lineage;
- ReadyPackage V2 / Content Export V2 downstream handoff;
- explicit architecture boundary that Knowledge does not own Core semantic understanding, entity resolution, distillation, value scoring or recommendations.

These should be preserved.

## Obsidian/Vault finding

Current repository documentation proves durable Vault binding/export/inspection/import/verification and review workflow. It does **not yet prove** a downstream semantic relationship graph with queryable wikilinks/backlinks/tags/supersession edges.

Therefore the Phase 0 rule is:

- do not assume graph semantics merely because Vault/Obsidian exists;
- inventory concrete Markdown/Vault signals actually persisted and exportable;
- use them as Brain Research navigation signals only when they are explicit, versioned and reproducible.

## Required capability matrix to finish #542

| Signal | Status now | Required evidence |
| --- | --- | --- |
| canonical document identity/version | confirmed | existing Canonical Downstream Document / ReadyPackage contracts |
| exact provenance/source hash | confirmed | existing immutable evidence chain |
| heading/section structure | expected from Markdown, not yet contract-proven | inspect Content Export/Canonical Document schema |
| tags/topics | not proven | inspect staging/export metadata |
| explicit wikilinks | not proven | inspect Vault import/export/parser behavior |
| backlinks | not proven | inspect persisted relationship/index model |
| related-document links | not proven | inspect schema/contracts |
| supersedes/superseded-by | not proven as generic document graph | inspect change-evidence/version contracts |
| lexical retrieval API | not yet proven as Brain-facing contract | inventory current read/search endpoints |
| semantic/vector retrieval API | not yet proven | inventory current implementation |
| relationship-assisted expansion | not proven | evaluate only after relationship inventory |

## Architecture consequence

Knowledge remains a Brain Research source, not a high-frequency production dependency.

Normal flow:

`Knowledge -> Brain Research -> Method Evaluation -> Executable Method Package`

For stable references only, a refresh/materialization path may read Knowledge after publication:

`Knowledge -> ACTIVE resolution method -> Reference Materializer -> Capability Reference Store`.

High-volume Capability calls should normally read the materialized reference, not re-read Markdown.

## Next exact tasks

1. Inspect Canonical Downstream Document and Content Export V2 schemas for section-level identity and metadata.
2. Inspect Vault parser/import/export code for tags, links and backlinks.
3. Inventory any existing search/retrieval endpoints and indexes.
4. Build a small real corpus evaluation matrix: metadata/lexical vs semantic vs relationship-assisted retrieval.
5. Decide whether a lightweight relationship index is justified; do not start a new graph platform without measured benefit.
