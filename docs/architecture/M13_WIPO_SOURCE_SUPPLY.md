# M13 — WIPO Source Coverage and Operational Supply

## Purpose

M13 extends the source-data plane from the initial USPTO baseline to WIPO without changing the architectural boundary of `markorbit-knowledge`.

The repository remains responsible for official source discovery, immutable evidence, normalization, indexing, provenance, change detection and delivery to MO. It does not interpret Madrid rules, calculate deadlines, resolve legal applicability or generate professional answers.

## Curated WIPO coverage

The catalog now includes ten explicitly curated WIPO trademark-source targets under jurisdiction `WO`:

### FOUNDATIONAL

1. Madrid System portal
2. Madrid Monitor / Find and Monitor
3. Global Brand Database
4. Nice Classification / NCLPub
5. Madrid System legal texts
6. Madrid System forms
7. Madrid System fees and fee calculator
8. WIPO Gazette of International Marks

### SUPPORTING

9. Madrid Member Profiles

### CHANGE_SIGNAL

10. Madrid System Information Notices

Each target records public official entrypoints, acquisition hints, expected evidence forms and change sensitivity. A coverage target remains declarative metadata only. It is not collection permission.

## Operational path

M13 generalizes the existing foundational-source tooling so both `US` and `WO` use the same controlled path:

```text
SourceCoverageTarget
  -> explicit bootstrap
  -> SourceDefinition
  -> ACTIVE + MANUAL CollectionPlan
  -> optional --dispatch-target=<target-id>
  -> RawArtifact
  -> AUTO_PROFILE normalization
  -> Staging verification
  -> Retrieval index
  -> Source Supply Health
```

The bootstrap CLI accepts `--jurisdiction=US|WO`. `US` remains the default for backward compatibility.

WIPO sources use the same `crawl4ai-web@1.2.0` connector contract and the same attachment, hash, provenance and conversion controls as USPTO sources.

## Dynamic applications

Madrid Monitor, the Global Brand Database, NCLPub and the Madrid fee calculator are dynamic applications. M13 does not infer or scrape undocumented internal APIs. When a target expects structured JSON but passive authorized acquisition does not capture it, the existing `STRUCTURED_ENDPOINT_NOT_CAPTURED` capability gap remains visible rather than being treated as complete coverage.

## Collection authority

M13 does not create schedules or automatically dispatch WIPO runs.

- Source bootstrap does not authorize collection.
- Prepared supply plans are `ACTIVE` but `MANUAL`.
- A run exists only after an operator supplies `--dispatch-target=<target-id>`.
- The existing US representative live-smoke flag remains US-only.

## Conversion policy

Once an explicitly dispatched collection creates immutable RawArtifacts, the M9/M10/M11 pipeline applies unchanged:

- page Markdown may auto-normalize;
- HTML remains raw evidence;
- linked PDFs use the text-layer PDF converter;
- rich attachments use the rich-document converter;
- image OCR is explicit by artifact kind;
- scanned PDFs never silently switch to OCR;
- missed handoffs self-reconcile;
- retryable ConversionRun failures use bounded retry/backoff and dead-letter recovery.

WIPO normalized output is namespaced under `sources/wipo/{artifactId}.md`.

## Health and delivery

`SourceSupplyHealth` already derives its target set from the source coverage catalog. Adding the WIPO targets therefore makes `jurisdiction=WO` health queries available without a parallel health implementation. WIPO sources can be observed through the same registration, acquisition, freshness, normalization and retrieval health states used for USPTO.

## Explicit non-goals

M13 does not:

- schedule or continuously crawl WIPO;
- bypass WIPO access controls or login requirements;
- harvest undocumented application APIs;
- compute Madrid deadlines, fees or legal effects;
- turn legal texts into Rule/Requirement/Deadline objects;
- build an ontology or knowledge graph;
- answer trademark questions directly.
