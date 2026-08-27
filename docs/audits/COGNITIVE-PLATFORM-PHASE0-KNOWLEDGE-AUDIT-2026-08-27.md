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

The current Core `ReadyPackageContentExportV1/V1.1` contract receives a `stagingDocument` with:

- `documentId`;
- `sha256`;
- `sizeBytes`;
- `mediaType = text/markdown`;
- `encoding = utf-8`;
- the complete Markdown `content` string;

plus package/source provenance and optional source-governance metadata.

It does **not** carry first-class downstream fields for:

- heading/section identity;
- tags/topics;
- wikilinks;
- backlinks;
- related-document edges;
- supersedes/superseded-by edges;
- section fingerprints/ranges;
- lexical/semantic retrieval indexes.

Therefore even if some of these signals exist internally in Vault/review tooling, they are not currently available through the frozen downstream content-export contract as structured Brain Research inputs.

This is the first concrete Phase 0 gap: Brain Research can receive the whole Markdown document with provenance, but cannot yet consume an explicit Obsidian-style navigation graph or exact source-section reference without parsing/deriving it itself.

## Obsidian/Vault finding

Repository documentation proves durable Vault binding/export/inspection/import/verification and review workflow. It does **not yet prove** a downstream semantic relationship graph with queryable wikilinks/backlinks/tags/supersession edges.

Phase 0 rule:

- do not assume graph semantics merely because Vault/Obsidian exists;
- inventory concrete Markdown/Vault signals actually persisted internally;
- if useful internal signals exist, expose only the minimal governed subset required by Brain Research;
- if they do not exist, measure whether deriving a lightweight relationship index materially improves retrieval before building one.

## Capability matrix

| Signal | Status now | Phase 0 decision |
| --- | --- | --- |
| canonical document identity/version | implemented | preserve |
| exact provenance/source hash | implemented | preserve |
| complete Markdown content | implemented | preserve |
| source governance/authority hints | partial/implemented for governed source families | preserve and normalize for Brain Research |
| heading/section structure as explicit downstream contract | missing | derive or expose minimal section index |
| exact section/range citation identity | missing | required for `KnowledgeResearchSourceRefV1` |
| tags/topics as downstream fields | not proven / absent from current export | audit internal Vault representation before adding |
| explicit wikilinks | not proven / absent from current export | audit internal Vault representation |
| backlinks | not proven / absent from current export | audit internal relationship model |
| related-document links | not proven / absent from current export | audit internal model |
| supersedes/superseded-by generic document edges | not proven / absent from current export | audit version/change model |
| lexical retrieval API for Brain Research | not proven | gap candidate |
| semantic/vector retrieval API for Brain Research | not proven | gap candidate |
| relationship-assisted expansion | not available as downstream contract | evaluate after internal signal inventory |

## Minimum Knowledge research contract now justified

The cognitive platform does not need Knowledge to interpret documents for Brain. It needs a read/navigation contract that can produce a reproducible source reference.

Proposed `KnowledgeResearchSourceRefV1` minimum fields:

- canonical document / staging document identity;
- content version / SHA-256;
- source identity;
- source governance / authority metadata when available;
- captured/publication/effective metadata when available;
- exact heading path or byte/character/line range for the cited source section;
- section fingerprint where practical;
- retrieval rationale/signals used;
- optional explicit relationship edges only when the underlying Vault signal is real and versioned.

The whole Markdown remains in Knowledge. Brain Research stores references/lineage, not a copy of the document population.

## Runtime consequence

Knowledge remains primarily a Brain Research source, not a high-frequency production dependency.

Normal flow:

`Knowledge -> Brain Research -> Method Evaluation -> Executable Method Package`

For stable references only:

`Knowledge -> ACTIVE resolution method -> Reference Materializer -> Capability Reference Store`.

High-volume Capability calls should normally read the materialized reference, not re-read Markdown.

## Next exact tasks for #542

1. Inspect the internal Vault import/export/parser structures and mark each of `tags`, `wikilinks`, `backlinks`, `related`, `supersession`, `heading index` as IMPLEMENTED/PARTIAL/MISSING.
2. Identify the smallest existing API/storage object from which an exact document section can be reproduced; if none exists, define a section-index projection without changing Knowledge semantic ownership.
3. Inventory any existing lexical/semantic search implementation and determine whether it is production/governed or admin-only.
4. Produce a retrieval evaluation fixture using real canonical Markdown and compare metadata/lexical/semantic/relationship-assisted recall and cost.
5. Freeze `KnowledgeResearchSourceRefV1` only after the internal signal inventory; do not start a general graph platform.
