# M3 — Canonical Document Pipeline

## Purpose

M3 turns immutable collected evidence into a stable document supply format for MO without moving MarkOrbit Core knowledge semantics into this repository.

```text
Official Source
    ↓
Collection Worker
    ↓
Immutable RawArtifact
    ↓
Controlled Conversion
    ↓
Canonical Markdown + YAML provenance
    ↓
Verified Staging CAS
    ├── Ready Package → MarkOrbit Core / MO
    ├── Retrieval Index → MO search/read API
    └── Optional Obsidian Vault projection → human review
```

## Canonical asset

The canonical derived document is the verified Staging Markdown object, not an Obsidian file and not the retrieval index. Obsidian and retrieval indexes are replaceable projections built from verified canonical Markdown.

A Canonical Markdown document uses ordinary UTF-8 Markdown plus a restricted YAML frontmatter block under `markorbit:`. The metadata is generated from control-plane SourceDefinition, RawArtifact and ConversionRun state; the conversion Worker does not invent source identity or provenance.

Canonical metadata v1 includes:

- document and Workspace identity;
- Source identity, display name, category and explicit authority level;
- jurisdictions and languages copied from SourceDefinition;
- RawArtifact identity, logical document identity and artifact version;
- artifact kind and original filename;
- canonical/source URI;
- captured/published timestamps when available;
- ConversionRun and exact Converter identity;
- immutable input SHA-256.

The control plane recomputes the expected frontmatter before Staging ingestion and rejects a Worker output whose canonical metadata does not exactly match control-plane provenance.

## Current input boundary

M3.1 canonicalized collected `MARKDOWN` RawArtifacts.

M3.2 extends the same controlled production path to:

- `HTML` / `text/html` / `application/xhtml+xml` RawArtifacts;
- `PDF` / `application/pdf` RawArtifacts that contain an extractable text layer.

All three production converters are explicit, versioned and registered in the control plane:

- `builtin-markdown-staging@1.0.0`;
- `builtin-html-markdown@1.0.0`;
- `builtin-pdf-markdown@1.0.0`.

The production Worker advertises only these exact converter versions and dispatches by the ConversionRun-bound converter identity. HTML/PDF conversion therefore uses the same lease, immutable RawArtifact read grant, output grant, provenance verification, Staging verification and ReadyPackage finalization controls already established by M3.1.

## HTML normalization

The built-in HTML normalizer is deterministic and evidence-oriented. It preserves document-level structure needed for retrieval while avoiding professional interpretation:

- headings;
- paragraphs and block boundaries;
- lists;
- links, except unsafe executable/data schemes;
- emphasis and inline code;
- simple table cell/row boundaries;
- preformatted text.

Scripts, styles, templates, SVG content and comments are removed. HTML entities are decoded. The converter does not infer trademark rules, deadlines, procedures, legal effect or business meaning.

## PDF normalization

M3.2 supports text-layer PDFs without adding OCR. The built-in PDF normalizer:

- validates the `%PDF-` header;
- reads text operators from PDF content streams;
- supports uncompressed streams and Flate-compressed streams;
- handles common literal-string and hexadecimal text operators;
- emits ordinary Markdown text under the same Canonical Markdown provenance block.

If a PDF has no extractable text through the bounded deterministic parser, conversion fails closed with `PDF_NORMALIZATION_NO_EXTRACTABLE_TEXT`. It does not guess, synthesize content or silently treat an image-only/scanned PDF as text.

This means scanned documents, complex font/CMap decoding, OCR and richer PDF layout reconstruction remain later acquisition/normalization work. They must preserve the same RawArtifact and provenance chain rather than bypassing it.

## M3.3 retrieval foundation

M3.3 makes verified canonical documents directly retrievable by MO without making the retrieval layer the source of truth.

A document is indexed only after:

1. canonical Markdown provenance matches control-plane evidence;
2. Staging verification reaches `READY`;
3. the ConversionRun is finalized `COMPLETED`;
4. a verified ReadyPackage has been created.

The indexing path is deterministic and derivative:

```text
Verified Canonical Markdown
    ↓
Heading-aware document chunking
    ↓
Lexical keyword extraction
    ↓
SQLite FTS5 full-text index
    ↓
BM25-ranked retrieval
```

Chunking preserves heading ancestry and paragraph/block boundaries. Long text is split by bounded character windows without attempting legal or professional semantic segmentation. Keywords are frequency/structure weighted lexical terms derived from the title, headings and document text; they are not trademark ontology labels or legal conclusions.

The current retrieval index stores all indexed artifact versions and marks only the highest observed `artifactVersion` for a logical document as current. Default search returns current versions only. Historical versions remain addressable explicitly by version and are therefore available for later change/diff delivery work.

### MO retrieval API

M3.3 exposes two stable read paths:

```text
GET /api/retrieval/search
  ?workspaceId=...
  &q=Section%208%20maintenance
  &sourceId=...
  &jurisdiction=US
  &language=en
  &authorityLevel=PRIMARY_OFFICIAL
  &limit=20

GET /api/retrieval/documents/{documentId}
  ?workspaceId=...
  &version=...
```

Search returns BM25-ranked document/chunk hits with provenance-bearing document metadata. Document retrieval returns the indexed document metadata, deterministic chunks and the exact verified canonical Markdown bytes read from Staging CAS.

The current index mode is `SQLITE_FTS5_BM25`. Vector embeddings are intentionally not canonical data and are not required for correctness; a later vector index may be added as another rebuildable projection over the same canonical Markdown/chunks.

## Converter registration and policy

The admin control plane ensures the three M3 converter manifests exist when repositories are initialized. This only makes conversion capabilities available; it does not create collection authority, collection schedules or professional knowledge semantics.

Conversion Profiles remain explicit control-plane configuration. M3 does not silently create source-specific policy or decide which sources MO should collect.

## Obsidian

`LocalObsidianVaultProjectionRepository` is an optional derived projection:

- only verified `READY` Staging documents may be projected;
- the Staging `targetPath` remains the relative Markdown path;
- output is namespaced by Workspace;
- absolute paths, parent traversal and symbolic-link roots/targets are rejected;
- identical bytes are idempotent;
- no Obsidian plugin is required.

Obsidian is not a database, source of truth, indexing contract or runtime dependency for MO.

## Semantic boundary

M3 does not extract or assert:

- trademark rules, requirements or deadlines;
- legal applicability or legal truth;
- knowledge-graph entity/relationship semantics;
- recommendations or Next Best Action;
- Source Value or Evidence Maturity changes;
- collection scheduling authority.

Those meanings remain owned by MarkOrbit Core / MO. M3 supplies reliable evidence, normalized documents, retrieval primitives and provenance.

## Next increments

With canonicalization and retrieval now connected, the remaining large data-supply gaps are:

1. OCR and richer attachment/document extraction where deterministic text extraction is insufficient;
2. optional vector/embedding projection and retrieval fusion after the lexical baseline is proven;
3. change feed/version diff delivery to MO;
4. source-coverage and acquisition reliability expansion across target jurisdictions.
