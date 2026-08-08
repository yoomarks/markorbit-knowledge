# RawArtifact → Source Graph Extraction v1

## Status

Production extraction boundary for Source Graph Protocol v1. This increment does not modify locked acquisition Schema v1 and does not introduce a legal-truth or professional-verification state. The extractor is an evidence projection step after acquisition; it is not a second crawler and cannot expand collection authority.

## Production flow

```text
Crawl4AI / controlled collector
        ↓
RawArtifact finalize
        ↓ immutable bytes + SHA-256
Deterministic web-structure extractor
        ↓
SourceGraphObservationBatch
        ↓
WebsiteSourceProfile / Source Map
```

Artifact finalization remains the immutable evidence boundary. Source Graph extraction is derived evidence processing and therefore cannot make a successful artifact upload fail retroactively.

## Supported inputs

The v1 extractor processes finalized `HTML` and `MARKDOWN` RawArtifacts for Sources that already own a `WebsiteSourceProfile`.

Before parsing, the service:

1. resolves the immutable content object from the RawArtifact repository;
2. rereads the stored bytes;
3. verifies byte length against both RawArtifact and content-object metadata;
4. recomputes SHA-256 and requires it to match both immutable records;
5. requires the artifact URI to remain inside the governed website host scope.

Unsupported artifact kinds, oversized inputs, missing website profiles and out-of-scope URIs are skipped without changing RawArtifact state.

## Deterministic observations

The extractor emits deterministic Source Graph IDs from the immutable artifact identity, graph identity and captured timestamp. Its idempotency key includes the RawArtifact ID and extractor version.

Reprocessing the same immutable artifact with the same extractor version must therefore produce the same `SourceGraphObservationBatch`. The Source Graph repository can return a replay rather than creating duplicate evidence.

Changing extraction semantics requires an extractor version change instead of silently reusing an old idempotency key.

## Structural extraction

Within the governed website boundary the extractor can observe:

- the captured page and its canonical URI;
- same-site PAGE links;
- linked documents such as PDF, DOCX, XLSX, CSV, JSON and ZIP;
- sitemap XML links;
- explicit `mailto:` and `tel:` public business contact points;
- explicit JSON-LD Organization and Person records;
- explicit JSON-LD `author`, `publisher` and `worksFor` relationships.

A canonical homepage is represented by the existing `WEBSITE` root node instead of a duplicate PAGE node.

External-domain links are deliberately ignored in this v1 extraction boundary. Lateral discovery of another domain must return through governed Discovery / Source review rather than silently expanding one Source Graph across trust boundaries.

## Provenance and truth boundary

Every derived node and edge carries `RAW_ARTIFACT` provenance with:

- governed Source ID;
- observed source URI;
- RawArtifact ID;
- observation timestamp;
- an optional locator fragment describing where the evidence came from.

Machine extraction always creates `OBSERVED` evidence. It does **not** assert that:

- a legal proposition is correct;
- a person or organization identity is globally resolved;
- an email address or phone number is currently accurate;
- an organization is authoritative;
- a professional is qualified;
- a professional belongs in MGSN.

Existing human `RETAINED` or `REJECTED` decisions remain protected by Source Graph persistence semantics.

## Finalization failure isolation

The Worker artifact-finalize endpoint attempts Source Graph extraction after immutable artifact finalization. If derived extraction fails, the finalize response reports a deferred extraction result while preserving successful artifact ingestion.

This prevents a parser defect, malformed publisher metadata or derived-graph problem from creating a false Worker upload retry loop.

Operators can retry extraction explicitly through:

`POST /api/raw-artifacts/:id/source-graph`

## Deliberate limits

The first production extractor is bounded and deterministic. It does not:

- execute page JavaScript;
- fetch additional URLs;
- infer legal claims with an LLM;
- perform cross-source entity resolution;
- promote discovered professionals to MGSN;
- auto-verify contacts;
- create new Sources for lateral domains;
- change Source authority level;
- authorize a collection run.

Later increments may add richer structured extraction, extraction-run observability and Source Intelligence scoring while preserving these authority and provenance boundaries.
