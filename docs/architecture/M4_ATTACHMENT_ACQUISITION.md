# M4 — Attachment Acquisition Reliability

## Purpose

M4 closes the collection-side gap between web pages and the richer document normalization path introduced in M3.5.

The production path becomes:

```text
Official website
  ├── HTML / Markdown pages
  └── explicitly authorized same-host attachments
        ├── PDF
        ├── DOCX / XLSX
        ├── CSV / JSON / XML / TEXT / EMAIL
        └── IMAGE
                ↓
        immutable RawArtifact
                ↓
        M3 canonical conversion
                ↓
        verified Canonical Markdown
                ↓
        Retrieval / Change Feed / MO
```

## Authorization boundary

Attachment acquisition is never implied by connector capability.

The connector may advertise `FETCH_ATTACHMENTS`, but a Collection Plan must still explicitly set:

```text
policy.fetchAttachments = true
```

and the desired attachment kinds must be included in:

```text
output.artifactKinds
```

The default discovery-created plan remains `fetchAttachments = false` and outputs only `HTML` and `MARKDOWN`. Accepting a discovered source therefore does not silently broaden collection authority.

## Supported attachment kinds

The production Crawl4AI adapter can emit the following explicitly authorized RawArtifact kinds:

- `PDF`
- `DOCX`
- `XLSX`
- `CSV`
- `JSON`
- `XML`
- `EMAIL`
- `IMAGE`
- `TEXT`

These kinds align with the existing M3.5 rich extraction/OCR path. Legacy binary Office formats and ZIP archives are intentionally not treated as normalized documents by this increment.

## Network and evidence controls

Attachment acquisition preserves the same evidence boundary as page collection:

- only `http` / `https` URLs on standard ports;
- local/private targets are rejected through the existing DNS/public-address checks;
- attachment links must remain on the authorized source host;
- redirects are restricted to the existing same-host / `www` equivalence rule;
- optional production egress proxy policy remains in force;
- Collection Plan include/exclude URL patterns still gate queued links;
- page and attachment network attempts share the immutable `maxItems` budget;
- per-artifact and total byte limits are enforced before RawArtifact ingestion;
- downloaded bytes are hashed with SHA-256 and reverified by the Node adapter;
- duplicate attachment bytes within a collection run are suppressed;
- PDF and OOXML payloads receive minimal signature validation;
- HTML returned from an apparent document URL is rejected instead of mislabeled as a document.

The Python sidecar still cannot register RawArtifacts or mutate collection state. It only emits bounded byte manifests. The Node Worker verifies paths, sizes, digests and immutable Collection Plan output authorization before the existing ArtifactBackedCollectionExecutor can create RawArtifact ingestion sessions.

## Connector versioning

The richer production manifest is `crawl4ai-web@1.2.0`.

Version `1.1.0` remains historical configuration; M4 does not mutate already bound source definitions automatically. New discovery acceptance and current USPTO bootstrap/smoke paths bind to `1.2.0`.

## Semantic boundary

M4 does not infer legal meaning from downloaded documents. It does not classify trademark rules, deadlines, procedures, applicability or case impact. Attachment type classification is transport/document-format classification only.

## Next large workstream

With pages and attachments able to enter the canonical pipeline, the next large source-supply problem is explicit Source Coverage management: a governed target catalog by jurisdiction/authority/source family, coverage status, acquisition health and freshness so MO can tell whether foundational official material is actually present rather than merely searchable when collected.
