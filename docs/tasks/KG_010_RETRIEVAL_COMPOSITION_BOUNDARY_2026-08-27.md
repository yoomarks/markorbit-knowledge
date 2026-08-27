# KG-010 Retrieval Composition Boundary

Date: 2026-08-27  
Issue: #535  
Parent: #506

## Purpose

KG-010 exposes provider-neutral retrieval evidence for Brain without moving Brain reasoning into Knowledge.

Knowledge composes three evidence channels:

- **LEXICAL** — current SQLite FTS5/BM25 retrieval over verified canonical documents;
- **GRAPH** — current objective content-neighborhood edges with original relation origin/evidence;
- **VECTOR** — optional only, and present only when a real injected vector provider exists.

## Current capability truth

The repository currently has real FTS5/BM25 lexical retrieval and the durable content-relationship projection. It does not currently implement embedding generation or a vector database/provider.

Therefore the production KG-010 route reports VECTOR as unavailable. It never relabels lexical or graph evidence as VECTOR, never generates fake embeddings, and never manufactures similarity values.

A future vector provider must supply its own provider/model/index identity, metric semantics, content references, and native numeric values. Knowledge preserves these values; it does not normalize them into a cross-channel score.

## Identity and de-duplication

The lexical index stores canonical `RetrievalDocument` objects. KG-010 exposes lexical hits as `ContentObjectRefV1` with kind `DOCUMENT` and the retrieval document's canonical `documentId`.

Graph results retain their existing content kinds. Items are de-duplicated only when the full canonical content identity matches:

`workspaceId + objectKind + objectId`

A de-duplicated item keeps all channel-specific evidence.

## Ordering

KG-010 does not produce a blended relevance ranking.

Result items are sorted deterministically by canonical content identity. Within one item, evidence is ordered by stable channel order (`LEXICAL`, `GRAPH`, `VECTOR`) and then by the source channel's original position.

The original FTS BM25 score, graph edge/provenance, and vector provider-native value remain evidence only.

## Authorization

The internal route reuses the governed Workspace Principal gate introduced for Knowledge relationship consumption:

- internal service secret required;
- Workspace Principal required;
- valid unexpired session;
- `matter:read` required;
- requested workspace must exactly match the principal workspace.

Cross-workspace evidence from any provider is rejected.

## Brain boundary

Knowledge does **not** perform or return:

- entity resolution;
- customer/matter/business relevance;
- legal conclusions;
- strategy or recommendations;
- trust/truth/authority scoring;
- blended lexical/graph/vector relevance scores;
- user-specific final ranking.

Brain consumes the objective evidence pack and owns those decisions.
