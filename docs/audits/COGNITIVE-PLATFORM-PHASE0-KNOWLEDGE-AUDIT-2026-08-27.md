# Cognitive Platform Phase 0 — Knowledge Audit

Status: evidence-backed Phase 0 decision baseline.

## Executive decision

Knowledge already has substantially more governed retrieval and relationship infrastructure than the initial audit assumed. The repository currently provides canonical document provenance, chunk-level lexical retrieval, a deterministic content-relationship projection, a provider-neutral relationship API, generated Obsidian wikilinks/backlinks, and an explicit lexical/graph/vector retrieval-composition contract.

Phase 0 therefore does **not** justify a new graph platform or a second Obsidian relationship index.

The smallest downstream gap proven by this audit is narrower: direct lexical retrieval has exact chunk identity and content hashes, while the current Brain-facing retrieval-composition evidence collapses lexical hits to document-level content references and does not carry the direct retrieval `chunkId` / `contentSha256`. In addition, the internal composition route has no deployed vector provider today. Human-authored Vault links/tags are also not proven as authoritative inbound relationship signals.

## Confirmed current strengths

Knowledge already owns the correct slow-path primitives:

- acquisition and conversion into canonical downstream documents;
- reviewed Obsidian/Vault staging and deterministic derivative export;
- canonical Markdown/document identity;
- provenance, version/hash and source lineage;
- ReadyPackage / Content Export downstream handoff;
- SQLite FTS5/BM25 retrieval with chunk-level identity;
- deterministic persisted content-relationship projection;
- provider-neutral relationship query API;
- explicit lexical/graph/vector retrieval-composition contract;
- generated Obsidian wikilinks/backlinks from governed relationship evidence;
- change-feed identity for created/updated/replaced canonical documents;
- explicit architecture boundary that Knowledge does not own Core semantic understanding, entity resolution, distillation, value scoring or recommendations.

These should be preserved.

## Capability matrix

| Signal / capability | Real current state | Phase 0 decision |
| --- | --- | --- |
| canonical document identity/version | IMPLEMENTED | preserve |
| exact provenance/source hash | IMPLEMENTED | preserve |
| complete canonical Markdown | IMPLEMENTED | preserve |
| direct exact section/chunk identity | IMPLEMENTED | `RetrievalChunkV1` has `chunkId`, `documentId`, ordinal, `headingPath`, text and `contentSha256` |
| lexical retrieval | IMPLEMENTED | SQLite FTS5/BM25; keep as governed baseline |
| objective relationship graph | IMPLEMENTED | persisted facets + directed edges with evidence/origin |
| relationship query API | IMPLEMENTED | use existing provider-neutral relationship API |
| generated Obsidian wikilinks | IMPLEMENTED | derivative export from governed relationship graph |
| generated backlinks | IMPLEMENTED | derivative export from incoming governed edges |
| jurisdiction/source/corpus relationships | IMPLEMENTED | facets plus `SAME_SOURCE_AS` / `SAME_CORPUS_AS` |
| topic/keyword relationships | IMPLEMENTED | objective facets plus `SHARES_TOPIC` / `SHARES_KEYWORD` |
| `SUPERSEDES` / `VERSION_OF` relation types | IMPLEMENTED AS CONTRACT/GRAPH TYPES | only claim when backed by explicit persisted evidence |
| document change feed | IMPLEMENTED | `CREATED` / `UPDATED` / `REPLACED` with canonical hash/provenance |
| lexical + graph composition | IMPLEMENTED | existing composition service preserves separate evidence channels |
| vector evidence contract | IMPLEMENTED | provider-neutral contract exists |
| deployed vector provider in current internal compose route | MISSING | do not synthesize semantic evidence; evaluate only with real provider |
| chunk identity in Brain-facing composed lexical evidence | PARTIAL / GAP | direct retrieval has it; current composition drops `chunkId` / `contentSha256` |
| human-authored Vault tags as authoritative inbound graph signals | NOT PROVEN | do not assume |
| human-authored Vault wikilinks/backlinks as authoritative inbound graph signals | NOT PROVEN | do not create a parallel graph index |
| generic source-family semantic resolution | PARTIAL | objective source/corpus facets exist; semantic family resolution belongs downstream |

## Proven retrieval and navigation surfaces

### Direct lexical retrieval

The existing retrieval contract already exposes reproducible source chunks. A lexical chunk carries:

- `chunkId`;
- `documentId`;
- `chunkOrdinal`;
- `headingPath`;
- exact chunk text;
- `contentSha256`;
- index timestamp.

The implementation uses `SQLITE_FTS5_BM25`. Search supports governed document/source/jurisdiction filtering and deterministic pagination.

This means Brain does **not** need a new Knowledge section parser merely to identify a cited section.

### Content relationship projection

The current relationship model is a real persisted projection, not a decorative UI graph. It supports objective facets for jurisdiction, source, corpus, topic and keyword, plus directed relations including:

- `REFERENCES`;
- `CITES`;
- `RELATED_TO`;
- `SUPERSEDES`;
- `VERSION_OF`;
- `DERIVED_FROM`;
- `SAME_SOURCE_AS`;
- `SAME_CORPUS_AS`;
- `SHARES_TOPIC`;
- `SHARES_KEYWORD`.

Edges retain origin/evidence. Machine-derived edges retain algorithm identity/version. The model explicitly does not introduce truth, authority, legal or business scoring.

### Obsidian/Vault relationship signals

The existing Obsidian exporter is downstream of the governed relationship projection. It writes graph-derived frontmatter and produces wikilinks and generated backlinks from persisted relationship evidence.

Therefore generated Obsidian links/backlinks are real and reproducible.

What is **not** proven is the inverse proposition: arbitrary human-authored Vault wikilinks, backlinks or tags are not currently established by this audit as authoritative inputs that should automatically mutate the governed relationship graph.

Phase 0 must keep that boundary.

### Brain-facing retrieval composition

The current retrieval-composition contract already separates evidence into explicit `LEXICAL`, `GRAPH` and `VECTOR` channels. It deliberately avoids a hidden blended score.

The current internal composition route wires:

- lexical evidence to the real SQLite retrieval index;
- graph evidence to the real persisted relationship registry;
- no vector provider.

Therefore the deployed internal composition path is currently lexical + graph. Vector is contract-ready but not operationally present there and must remain absent/fail-closed rather than being simulated.

## Concrete downstream gap

The direct lexical retrieval result is more precise than the composed lexical evidence currently exposed downstream.

Direct retrieval can identify the exact `chunkId`, heading path and `contentSha256`. The current composition layer maps lexical evidence to a document-level canonical `ContentObjectRefV1` plus rank/score/snippet/heading context, but does not preserve the exact chunk identity/hash in the composed evidence item.

For an auditable Brain Research pilot, this creates an avoidable provenance loss: Brain can know which document and approximate heading/snippet matched, but the composition response does not itself freeze the exact retrieval chunk identity that produced the hit.

This is the smallest justified contract follow-up. It does **not** justify a new graph runtime.

## Smallest downstream contract recommendation

Use the existing `KnowledgeRetrievalCompositionV1` and `KnowledgeRelationshipQueryV1` boundaries rather than inventing `KnowledgeResearchSourceRefV1` as a parallel retrieval stack.

Before a production Brain Research pilot, extend or dereference the lexical evidence path so a selected lexical source can retain at least:

- canonical document/content reference;
- `chunkId`;
- `contentSha256`;
- `headingPath`;
- source rank and native lexical score;
- retrieval/index identity required to reproduce the hit.

Graph evidence should continue to preserve relation type, origin, evidence refs and algorithm identity/version without becoming a relevance/truth score.

If Brain needs the complete source text, it should dereference the governed Knowledge source; it should not copy the entire Knowledge corpus into Brain.

## Evaluation plan

Use a fixed, versioned real-corpus fixture and a frozen set of representative research questions. Compare the same query/corpus snapshot under these channels:

1. metadata/filter baseline;
2. lexical-only FTS5/BM25;
3. lexical + relationship expansion;
4. lexical + real vector provider, only when one is deliberately configured;
5. lexical + relationship + real vector provider.

Record at minimum:

- recall@k against manually frozen expected source documents;
- exact-section/chunk hit rate;
- provenance completeness rate;
- deterministic replay for non-vector channels;
- relationship expansion noise / irrelevant-edge rate;
- latency;
- vector/provider cost where applicable;
- cases where relationship expansion finds a needed source that lexical-only misses.

Do not compare methods on different corpus versions or allow inferred truth/authority ranking into the evaluation.

## Obsidian relationship-index decision

**Recommendation: do not build an additional Obsidian relationship index now.**

The repository already has a governed content-relationship registry, relationship query API and deterministic Obsidian derivative export. A second graph/index would create duplicate authority and reconciliation burden without a proven retrieval benefit.

If a later experiment shows that human-authored Vault links/tags add measurable recall, ingest only those explicit, versioned signals into the existing relationship projection with provenance. Do not create a separate graph platform merely because Obsidian supports links.

## Architecture consequence

Knowledge remains primarily a Brain Research/evidence source, not a high-frequency production reasoning dependency.

Normal flow:

`Knowledge -> Brain Research -> Method Evaluation -> Executable Method Package`

For stable references only:

`Knowledge -> ACTIVE resolution method -> Reference Materializer -> Capability Reference Store`

High-volume Capability calls should normally read materialized references rather than re-read Markdown on every invocation.

## Phase 0 exit assessment

The audit questions in #542 are now answerable without additional runtime expansion:

- implemented/not-implemented matrix: complete above;
- Brain pilot gaps: exact chunk identity is lost in composed lexical evidence; real vector provider absent; human-authored Vault graph ingestion not proven;
- smallest downstream contract: preserve/dereference exact lexical chunk identity through the existing composition boundary;
- evaluation plan: frozen corpus/query comparison defined above;
- additional Obsidian relationship index: **not justified at this time**.

Any implementation of the narrow chunk-lineage follow-up should be separately scoped after Phase 0; it is not required to call this audit complete.
