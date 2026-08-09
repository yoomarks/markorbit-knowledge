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
    └── Optional Obsidian Vault projection → human review
```

## Canonical asset

The canonical derived document is the verified Staging Markdown object, not an Obsidian file. Obsidian is a replaceable projection for human browsing and review.

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

M3.1 canonicalizes collected `MARKDOWN` RawArtifacts. The existing Crawl4AI collection path already produces Markdown evidence, so M3.1 deliberately reuses that bounded production path instead of adding a second HTML parser.

Arbitrary HTML/PDF/DOCX normalization, OCR and attachment extraction remain later M3 work and must preserve the same canonical document/provenance contract.

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

Those meanings remain owned by MarkOrbit Core / MO. M3 supplies reliable evidence and normalized documents.

## Next increments

After M3.1 is proven on the live USPTO path, the next data-supply gaps are:

1. arbitrary HTML/PDF normalization into the same Canonical Markdown contract;
2. lightweight enrichment and chunk/index generation;
3. stable retrieval APIs for MO;
4. change feed/version delivery.
