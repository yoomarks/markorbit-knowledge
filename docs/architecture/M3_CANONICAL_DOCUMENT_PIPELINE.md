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
Controlled Conversion / Extraction
    ↓
Canonical Markdown + YAML provenance
    ↓
Verified Staging CAS
    ├── Ready Package → MarkOrbit Core / MO
    ├── Retrieval Index → MO search/read API
    ├── Change Feed → MO source-change delivery
    └── Optional Obsidian Vault projection → human review
```

## Canonical asset

The canonical derived document is the verified Staging Markdown object, not an Obsidian file, extraction-process output or retrieval index. Extractors produce a Markdown body only; canonical provenance is added and verified by the governed conversion path.

A Canonical Markdown document uses ordinary UTF-8 Markdown plus a restricted YAML frontmatter block under `markorbit:`. The metadata is generated from control-plane SourceDefinition, RawArtifact and ConversionRun state; conversion and extraction workers do not invent source identity or provenance.

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

M3.2 added deterministic built-in normalization for:

- `HTML` / `text/html` / `application/xhtml+xml`;
- text-layer `PDF` / `application/pdf`.

M3.5 adds controlled local-process extraction for:

- `DOCX`;
- `XLSX`;
- `CSV`;
- `JSON`;
- `XML`;
- RFC 822 `EMAIL`;
- plain `TEXT`;
- `IMAGE` OCR;
- scanned/image-based `PDF` OCR.

Production converters are explicit and versioned:

- `builtin-markdown-staging@1.0.0`;
- `builtin-html-markdown@1.0.0`;
- `builtin-pdf-markdown@1.0.0`;
- `local-rich-document-markdown@1.0.0`;
- `local-ocr-markdown@1.0.0`.

The production Worker advertises only these exact converter versions and dispatches by the ConversionRun-bound converter identity. All converter paths use the same lease, immutable RawArtifact read grant, output grant, provenance verification, Staging verification and ReadyPackage finalization controls.

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

## PDF normalization and OCR

The built-in PDF normalizer remains the preferred deterministic path for PDFs with an extractable text layer. It:

- validates the `%PDF-` header;
- reads text operators from PDF content streams;
- supports uncompressed streams and Flate-compressed streams;
- handles common literal-string and hexadecimal text operators;
- emits ordinary Markdown under the same Canonical Markdown provenance block.

If a PDF has no extractable text through the bounded deterministic parser, that converter still fails closed with `PDF_NORMALIZATION_NO_EXTRACTABLE_TEXT`.

M3.5 adds a separate explicit OCR converter rather than silently changing the deterministic PDF converter. The OCR path is a governed `LOCAL_PROCESS` capability and therefore must be chosen through Conversion Profile policy. It renders bounded PDF pages through `pdftoppm` and recognizes them through Tesseract when those trusted runtime executables are available. Image artifacts use Tesseract directly.

OCR does not silently fall back to invented text. Missing engines, renderer failures, page-limit breaches, timeouts and empty OCR results are explicit failures. OCR output is classified as non-deterministic because engine/version/language-pack changes can affect recognized text.

## Rich attachment extraction

`local-rich-document-markdown@1.0.0` uses a Python standard-library worker and produces Markdown body content only.

Current extraction behavior:

- DOCX: paragraphs, Word heading styles and tables from package XML;
- XLSX: worksheet rows/cells, shared strings and sheet headings from package XML;
- CSV: bounded rows rendered as Markdown tables;
- JSON: parsed and stably formatted JSON;
- XML: bounded element/attribute text paths;
- EMAIL: selected transport headers plus preferred plain-text body;
- TEXT: UTF-8/UTF-16 decoding with newline normalization.

The local process cannot define canonical frontmatter. Node verifies process output path, byte count, SHA-256, UTF-8 validity, output bounds and temporary-directory confinement before adding control-plane provenance.

## M3.3 retrieval foundation

Verified canonical documents are directly retrievable by MO without making the retrieval layer the source of truth.

A document is indexed only after:

1. canonical Markdown provenance matches control-plane evidence;
2. Staging verification reaches `READY`;
3. the ConversionRun is finalized `COMPLETED`;
4. a verified ReadyPackage has been created.

The indexing path is derivative:

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

The retrieval index stores all indexed artifact versions and marks only the highest observed `artifactVersion` for a logical document as current. Historical versions remain explicitly addressable.

### MO retrieval API

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

Search returns BM25-ranked document/chunk hits with provenance-bearing document metadata. Document retrieval returns indexed metadata, deterministic chunks and the exact verified canonical Markdown bytes read from Staging CAS.

## M3.4 change delivery

Current versions emit evidence-oriented `CREATED`, `UPDATED` or `UNCHANGED` change events after indexing. Section-level diffs report `ADDED`, `REMOVED` and `MODIFIED` normalized source sections with before/after hashes, chunk IDs and text. This is source-content change evidence only; MO decides legal or operational significance.

## Converter registration and policy

The admin control plane ensures the five M3 converter manifests exist when repositories are initialized. This only makes conversion capabilities available; it does not create collection authority, collection schedules or professional knowledge semantics.

Conversion Profiles remain explicit control-plane configuration. M3 does not silently decide that a PDF should use OCR, does not select source-specific collection policy and does not decide which sources MO should collect.

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
- semantic meaning of source changes;
- affected-case inference;
- collection scheduling authority.

Those meanings remain owned by MarkOrbit Core / MO. M3 supplies reliable evidence, normalized documents, retrieval primitives, source changes and provenance.

## Next major gaps

After M3.5, remaining major data-supply work is:

1. source-coverage and acquisition reliability expansion across target jurisdictions;
2. attachment discovery/acquisition coverage so rich files actually enter RawArtifact consistently;
3. real-world OCR calibration across languages, scanned official documents and difficult layouts;
4. optional vector/embedding projection and retrieval fusion only after lexical retrieval and corpus coverage are proven.
