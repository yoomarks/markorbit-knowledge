# USPTO TSDR Document Acquisition Policy V1

## Decision

Knowledge will admit USPTO Trademark Status and Document Retrieval (TSDR) work through two
separate targeted intents:

1. `CASE_DOCUMENT_INDEX` obtains the official document list/metadata for exactly one eight-digit
   serial number. The exact response must enter immutable RawArtifact storage, but this intent does
   not authorize any listed document binary.
2. `SELECTED_DOCUMENT_BINARY` may acquire one PDF or ZIP only after official TSDR metadata has
   supplied a document identity/type/description and a versioned classifier has assigned a
   policy-admitted high-value family. The selection must reference the immutable index RawArtifact.

This is an additive Worker Runtime policy. It does not change locked Schema v1 and does not add a
second acquisition or RawArtifact system.

## Official access boundary

The USPTO identifies `https://tsdrapi.uspto.gov` as the TSDR API origin and requires an API key
for programmatic bulk access. The credential is sent in the `USPTO-API-KEY` header. Knowledge
stores only a Schema v1 `secretRef`; a raw API key is never accepted by this contract.

USPTO's published ceilings are frozen as admission maxima:

- general/metadata requests: 60 requests per API key per minute;
- PDF or ZIP requests: 4 requests per API key per minute.

A future executor may choose lower operational limits. It must not raise them above this policy
without new official evidence and a reviewed policy revision.

Official references:

- <https://www.uspto.gov/trademarks/apply/check-status-view-documents/trademark-bulk-data>
- <https://tsdr.uspto.gov/faqview>
- <https://developer.uspto.gov/sites/default/files/2020-09/Enterprise-API-User-Guide-v2.pdf>

## Value-based download policy

Binary admission is limited to the first Foundation evidence families:

- office actions;
- applicant responses;
- next-action notices;
- outcome documents;
- registration certificates;
- post-registration actions;
- petition decisions.

Application filings, specimens, routine correspondence, and `OTHER` remain index-only. This is an
acquisition-cost policy, not a claim about legal significance. The classifier identity, version,
and source index RawArtifact ID are retained so the selection decision is reproducible and can
evolve under review.

The admitted classifier is `uspto-tsdr-document-family@1.0.0`. It performs exact matching against
separately normalized official Type and Description field values. It does not use broad substring
matching. Unknown metadata remains `UNCLASSIFIED`; Type/Description matches that point to different
families become `AMBIGUOUS`. Both states block binary admission. The acquisition policy recomputes
the classification and rejects a caller-supplied family, classifier identity, or version that does
not reproduce from the source metadata.

## Evidence and authority

Every admitted binary must enter the existing immutable RawArtifact path with exact bytes, hash,
source URI, source document metadata, collection lineage, and version chain. This policy does not
interpret document contents, create a legal outcome, assert title, establish a deadline, or admit
an extracted fact into Data Engine.

Coverage is `TARGET_SERIAL_ONLY`. Serial ranges, multiple-case bundles, population mirroring, and
complete-population claims fail closed. A Data Engine fact candidate requires a later governed
Evidence-to-Fact bridge with document/version/locator and method provenance.

## Current implementation boundary

The CASE_DOCUMENT_INDEX intent now has a production Worker Runtime acquirer for the official
single-serial bundle.xml?sn={serialNumber} endpoint. It resolves the API key only through the
admitted secretRef, sends USPTO-API-KEY, bounds timeout/response size, treats rate limits and
provider failures explicitly, and returns the exact XML bytes to the existing artifact-backed
collection pipeline for immutable RawArtifact admission.

SELECTED_DOCUMENT_BINARY remains fail-closed. The runtime does not construct an unverified
single-document URL from provider metadata, does not register an API key, does not download a
selected live PDF/ZIP, does not interpret document contents, does not publish a ReadyPackage, and
does not mutate production state. A selected-binary executor requires separately verified official
endpoint semantics that bind one source document identity to one returned binary.

## Sparse business-document refinement

TSDR is not a default historical-document archive. Binary acquisition is intentionally narrower
than document-index acquisition.

Every selected binary must now declare one of two purposes:

- `LIVE_BUSINESS_EVENT` for a current OA, declaration/maintenance, or renewal service chain;
- `CASE_RESEARCH` for a deliberately selected historical case needed for professional research.

A live-business request must identify the `OA`, `DECLARATION`, or `RENEWAL` chain.
`OTHER_RESEARCH` is accepted only with `CASE_RESEARCH`.

This prevents a high-value-looking document type from silently becoming authority to download the
entire history of a case. The upstream Capability/Product decides that the document is needed;
Knowledge only enforces the bounded acquisition and preserves the immutable document evidence.

The business chain may later contain notice, filing/response and result/outcome documents, but
Knowledge does not infer the commercial opportunity that caused the chain to be requested.
