# MarkOrbit Knowledge — Content Relationship Graph Execution Plan

Date: 2026-08-26
Status: canonical execution addendum

## Product decision

MarkOrbit Knowledge remains a four-source information system: Web / AI / Expert / Case. The new graph layer is not a fifth source and is not a business-entity knowledge graph.

The graph owns objective relationships between Knowledge content objects and their metadata/provenance. Brain owns entity resolution, real-world/business association, relevance reasoning, ranking, interpretation, and recommendations.

Obsidian is an optional administrator client/prototype surface, not an authoritative store and not part of the Brain data path.

## Platform dependency — global Admin Identity

Administrator login/session/workspace governance is a MarkOrbit Platform capability, not Knowledge-local identity. Knowledge consumes a governed Workspace Principal derived server-side from the platform session. Browser clients must never receive `MO_INTERNAL_SERVICE_SECRET` or be allowed to forge Workspace Principal headers.

Knowledge issue #502 tracks the first browser-session consumer requirement. The platform implementation should be owned in `yoomarks/markorbit` and reused by Knowledge, Brain, MarkReg, Data Engine, and other operator surfaces.

## K-GRAPH boundaries

### Knowledge may project

- same keyword / keyword membership;
- same topic / topic membership;
- same author;
- same source;
- same jurisdiction;
- same content type;
- citation/backlink;
- version/supersession;
- provenance / derived-from lineage;
- deterministic near-duplicate and machine-derived content similarity, when origin and algorithm version are explicit.

### Knowledge must not infer

- customer, trademark, applicant, company, person or other real-world entity identity;
- whether a news item relates to a real customer/matter;
- business relevance to a specific user or case;
- authority/trustworthiness/truth ranking;
- legal conclusions, strategy or recommendations.

Those belong to Brain or explicit upstream source metadata.

## Architecture decision

The authoritative facts remain the existing Knowledge objects and source/provenance metadata. The graph is a rebuildable projection/index.

V1 storage remains in the existing relational persistence stack. Do not add Neo4j or another graph database before measured traversal/scale requirements justify it.

Obsidian integration is export/API based:

Knowledge authoritative store -> Content Relationship Projection -> Admin/Brain APIs -> optional Obsidian Vault export/plugin.

Obsidian must never become the source of truth.

## Phase 1 — Graph Foundation

### KG-001 Content Relationship Contract

Create versioned contracts for:
- ContentObjectRef;
- ContentFacet;
- ContentEdge;
- RelationOrigin;
- relation types proven by current source objects.

Acceptance:
- no business-entity inference fields;
- relation origin is explicit (`EXPLICIT_SOURCE`, `SYSTEM_DERIVED`, `MACHINE_DERIVED`, `HUMAN_CONFIRMED`);
- machine-derived edges can carry algorithm identity/version but no truth score.

### KG-002 Durable Relationship Projection

Add idempotent relational persistence for content facets and edges.

Acceptance:
- deterministic upsert/rebuild;
- duplicate projection does not duplicate edges/facets;
- source object identity remains authoritative;
- projection can be deleted/rebuilt without altering source records.

### KG-003 Relationship Retrieval

Expose repository/service retrieval for:
- backlinks;
- 1-hop neighbors;
- same source/author/keyword/topic/jurisdiction filters;
- deterministic pagination.

Acceptance:
- provenance/relation origin returned with edges;
- no Brain-style relevance ranking.

### KG-004 Obsidian Vault Export Prototype

Export a selected topic/filter result into Markdown notes with stable `knowledge_id`, source metadata, tags/facets, explicit related links, backlinks-compatible wikilinks, and original-source refs.

Acceptance:
- export is read-only/derivative;
- re-export is deterministic;
- private/access-controlled content is not exported without authorized server-side context.

## Phase 2 — Native Knowledge Workspace

After administrators have used the Obsidian export with real Knowledge data:
- KG-005 Content Reader;
- KG-006 Related/Backlinks panel;
- KG-007 local 1-hop/2-hop graph view;
- KG-008 hybrid search + graph navigation.

Graph is navigation/context, not a decorative global-node cloud.

## Phase 3 — Brain Consumption

- KG-009 provider-neutral Knowledge Relationship API;
- KG-010 graph + lexical + vector retrieval composition.

Brain consumes content neighborhoods and evidence packs, then performs entity resolution/relevance/reasoning itself.

## Execution order

1. finish current shared Workspace Principal contract alignment;
2. implement KG-001/002/003 as one Phase-1 engineering PR;
3. add KG-004 Obsidian export only after the graph projection is stable on real data;
4. use the export internally before building native graph UI;
5. keep #467 Case and #468 Communication/Expert as P0 production-source closures in parallel;
6. build the native workspace only from observed administrator usage;
7. expose Brain graph retrieval after the relation model has real production data.

## Stop rules

Do not:
- add a business entity ontology to Knowledge;
- auto-link brands/applicants/customers/matters based on content mentions;
- add graph truth/relevance scoring;
- make Obsidian required for Knowledge operation;
- introduce a graph database for architectural symmetry;
- build a giant global graph visualization before local-neighborhood usage is proven.
