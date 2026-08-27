# KG-008 Hybrid Search + Graph Navigation

Issue: #530  
Umbrella: #506

## Implemented composition

KG-008 composes only retrieval channels that exist in Knowledge today:

1. metadata matching over current Knowledge documents;
2. verified-content lexical retrieval through the existing `SQLITE_FTS5_BM25` index.

The same staging document is deduplicated. FTS result order is preserved. Metadata matching can add a second match-channel marker but cannot boost or reorder an FTS hit. Metadata-only results are appended deterministically.

## Graph boundary

Each search result can open the native Reader or jump directly to the bounded local 1-hop/2-hop content graph. Graph relationships, origin, provenance and evidence are navigation/context only and never change search order.

KG-008 does not claim vector search. Vector composition remains KG-010. Knowledge still performs no customer/trademark/applicant/company/person entity resolution, business/case relevance scoring, truth/trust ranking, legal conclusion, recommendation or strategy scoring.

## Acceptance evidence

Automated composition tests cover:

- FTS order preservation;
- duplicate full-text chunks collapsing to one document;
- one document exposing both `FULL_TEXT` and `METADATA` channels;
- deterministic metadata-only append;
- absence of graph-derived ranking and synthetic vector semantics.

PR merge remains gated on all triggered/relevant checks being green on the exact current PR head.
