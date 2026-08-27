# Cognitive Platform Phase 0 — Knowledge Audit

Status: evidence-backed baseline; downstream contract gap now proven.

## Confirmed current strengths

Knowledge already owns the correct slow-path primitives:

- acquisition and conversion into canonical downstream documents;
- reviewed Obsidian/Vault staging boundary;
- canonical Markdown/document identity;
- provenance, version/hash and source lineage;
- ReadyPackage / Content Export downstream handoff;
- explicit architecture boundary that Knowledge does not own Core semantic understanding, entity resolution, distillation, value scoring or recommendations.

These should be preserved.

## Proven downstream contract finding

The current Core `ReadyPackageContentExportV1/V1.1` contract receives a `stagingDocument` with `documentId`, `sha256`, `sizeBytes`, `mediaType = text/markdown`, `encoding = utf-8` and the complete Markdown `content` string, plus package/source provenance and optional source-governance metadata.

It does **not** carry first-class downstream fields for heading/section identity, tags/topics, wikilinks, backlinks, related-document edges, supersedes/superseded-by edges, section fingerprints/ranges or lexical/semantic retrieval indexes.

Therefore, even if some of these signals exist internally in Vault/review tooling, they are not currently available through the frozen downstream content-export contract as structured Brain Research inputs.

This is the first concrete Phase 0 gap: Brain Research can receive the whole Markdown document with provenance, but cannot yet consume an explicit Obsidian-style navigation graph or exact source-section reference without parsing or deriving it itself.

## Obsidian/Vault finding

Repository documentation proves durable Vault binding/export/inspection/import/verification and review workflow. It does **not yet prove** a downstream semantic relationship graph with queryable wikilinks/backlinks/tags/supersession edges.

Phase 0 rules:

- do not assume graph semantics merely because Vault/Obsidian exists;
- inventory concrete Markdown/Vault signals actually persisted internally;
- if useful internal signals exist, expose only the minimal governed subset required by Brain Research;
- if they do not exist, measure whether deriving a lightweight relationship index materially improves retrieval before building one.

## Capability matrix

- Canonical document identity/version: **IMPLEMENTED**. Preserve.
- Exact provenance/source hash: **IMPLEMENTED**. Preserve.
- Complete Markdown content: **IMPLEMENTED**. Preserve.
- Source governance/authority hints: **PARTIAL/IMPLEMENTED** for governed source families. Preserve and normalize for Brain Research.
- Heading/section structure as an explicit downstream contract: **MISSING**. Derive or expose a minimal section index.
- Exact section/range citation identity: **MISSING**. Required for `KnowledgeResearchSourceRefV1`.
- Tags/topics as downstream fields: **NOT PROVEN / absent from current export**. Audit internal Vault representation before adding.
- Explicit wikilinks: **NOT PROVEN / absent from current export**. Audit internal Vault representation.
- Backlinks: **NOT PROVEN / absent from current export**. Audit internal relationship model.
- Related-document links: **NOT PROVEN / absent from current export**. Audit internal model.
- Generic supersedes/superseded-by document edges: **NOT PROVEN / absent from current export**. Audit version/change model.
- Lexical retrieval API for Brain Research: **NOT PROVEN**. Gap candidate.
- Semantic/vector retrieval API for Brain Research: **NOT PROVEN**. Gap candidate.
- Relationship-assisted expansion: **NOT AVAILABLE as downstream contract**. Evaluate after the internal signal inventory.

## Minimum Knowledge research contract now justified

The cognitive platform does not need Knowledge to interpret documents for Brain. It needs a read/navigation contract that can produce a reproducible source reference.

Proposed `KnowledgeResearchSourceRefV1` minimum fields:

- canonical document or staging-document identity;
- content version / SHA-256;
- source identity;
- source governance / authority metadata when available;
- captured/publication/effective metadata when available;
- exact heading path or byte/character/line range for the cited source section;
- section fingerprint where practical;
- retrieval rationale/signals used;
- optional explicit relationship edges only when the underlying Vault signal is real and versioned.

The whole Markdown remains in Knowledge. Brain Research stores references and lineage, not a copy of the document population.

## Runtime consequence

Knowledge remains primarily a Brain Research source, not a high-frequency production dependency.

Normal flow:

`Knowledge -> Brain Research -> Method Evaluation -> Executable Method Package`

For stable references only:

`Knowledge -> ACTIVE resolution method -> Reference Materializer -> Capability Reference Store`

High-volume Capability calls should normally read the materialized reference, not re-read Markdown.

## Next exact tasks for #542

1. Inspect the internal Vault import/export/parser structures and mark each of `tags`, `wikilinks`, `backlinks`, `related`, `supersession` and `heading index` as IMPLEMENTED/PARTIAL/MISSING.
2. Identify the smallest existing API/storage object from which an exact document section can be reproduced. If none exists, define a section-index projection without changing Knowledge semantic ownership.
3. Inventory any existing lexical/semantic search implementation and determine whether it is production/governed or admin-only.
4. Produce a retrieval evaluation fixture using real canonical Markdown and compare metadata/lexical/semantic/relationship-assisted recall and cost.
5. Freeze `KnowledgeResearchSourceRefV1` only after the internal signal inventory. Do not start a general graph platform.
