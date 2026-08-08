# ADR-0012: Website Source Profile and source-local evidence graph

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

Controlled Autonomous Discovery can now start from a homepage and discover real website pages, documents and sitemaps. The current implementation still promotes an accepted page candidate into its own `SourceDefinition`. That is acceptable for proving the review-to-collection loop, but it is the wrong long-term granularity for official offices, law firms and other large websites.

At production scale, one website must be governed as one operational source while its internal pages, documents, site structure, observed organizations, observed professionals and public business contact points remain subordinate evidence-scoped records.

The change must preserve two existing boundaries:

1. Schema v1 `SourceDefinition` remains the acquisition-control identity and is not redefined.
2. MarkOrbit Core continues to own semantic entity resolution, legal interpretation, knowledge construction, value scoring and professional judgment.

## Decision

1. A governed website is represented by one Schema v1 `SourceDefinition` with `sourceType=WEB`.
2. A new independently versioned **Source Graph Protocol v1** is introduced. It does not modify Schema v1.
3. A `WebsiteSourceProfile` binds one website-level `SourceDefinition` to a canonical origin and a mandatory website root node.
4. Source Graph nodes represent source-local evidence observations:
   - `WEBSITE`;
   - `SECTION`;
   - `PAGE`;
   - `DOCUMENT`;
   - `SITEMAP`;
   - `ORGANIZATION`;
   - `PERSON`;
   - `CONTACT_POINT`.
5. Source Graph edges record observed structural or evidentiary relationships such as `CONTAINS`, `DISCOVERED_FROM`, `PUBLISHED_BY`, `AUTHORED_BY`, `WORKS_AT` and `HAS_CONTACT_POINT`.
6. URL-addressable nodes use `CANONICAL_URI` identity. Organization, person and contact observations use `SOURCE_LOCAL` identity and must not be merged across independent sources by Knowledge.
7. Every node and edge requires provenance. Graph observations without evidence are invalid.
8. Graph review states are `OBSERVED`, `RETAINED` and `REJECTED`. There is intentionally no `VERIFIED` graph state.
9. `RETAINED` means an operator chose to keep the observation as useful evidence. It does not certify legal truth, source authority, professional quality or identity correctness.
10. Public website discovery may retain only public professional/business contact information. Private-personal enrichment is outside this protocol and outside the product scope.
11. Observation batches are source/profile scoped and idempotent so persistence can upsert repeated discovery safely without turning a graph batch into execution authority.

## SourceDefinition versus Source Graph

`SourceDefinition` answers:

> What governed acquisition source may MarkOrbit operate against, using which connector and collection policy?

`WebsiteSourceProfile` and Source Graph answer:

> What structure and evidence has MarkOrbit observed inside that source?

They are intentionally separate. A page should normally become a graph node, not another operational source.

## Identity policy

### URL-addressable resources

`WEBSITE`, `PAGE`, `DOCUMENT`, `SITEMAP` and URL-backed `SECTION` nodes use a canonical HTTP(S) URI as their identity key inside the website profile.

### Organizations, people and contacts

Observed organizations, people and contact points are source-local observations. Knowledge may preserve names, roles and public business contact evidence, but it must not infer that two observations from different sources are the same real-world entity.

Cross-source entity resolution and canonical professional identity belong to MarkOrbit Core / the later reviewed Professional Graph promotion process.

## Relationship claims

The Source Graph records what a source exposes. It must not convert marketing or website statements into verified business relationships. For example, a law-firm page mentioning a company may be represented as `MENTIONS`; it must not automatically become a verified client relationship.

A richer relationship-claim protocol may be added later with explicit evidence and review semantics.

## Migration strategy

This ADR does not perform a destructive migration.

A later implementation increment will:

1. group existing page-level WEB sources by canonical website origin;
2. create one website-level SourceDefinition and WebsiteSourceProfile per reviewed site;
3. convert former page-level sources into Source Graph PAGE/DOCUMENT nodes;
4. preserve old source IDs in migration provenance/aliases;
5. attach collection plans to the website-level source;
6. keep collection authorization separate from graph review.

Until that migration is implemented, existing page-level SourceDefinitions remain valid operational records.

## Consequences

### Positive

- A 100,000-page trademark-office site no longer implies 100,000 operational Sources.
- Discovery becomes a map of one source instead of a source explosion.
- Structural and professional observations retain evidence and review state.
- Cross-source identity mistakes are prevented at the acquisition layer.
- Future Professional Graph promotion can be explicit, reviewed and outcome-aware.

### Costs

- Persistence needs new profile/node/edge/batch registries.
- Existing page-level source data needs a controlled compatibility migration.
- Collection targeting will eventually need optional graph-node targeting without weakening SourceDefinition ownership.

## Rejected alternatives

### Keep one SourceDefinition per page

Rejected because source count scales with page count, collection policy becomes fragmented and site-level governance becomes impossible.

### Put pages and people directly inside SourceDefinition

Rejected because SourceDefinition is a stable operational acquisition contract, not a mutable discovered-content graph.

### Resolve people and organizations globally inside Knowledge

Rejected because entity resolution is semantic interpretation owned by MarkOrbit Core and because automatic cross-source merges create unacceptable professional-intelligence errors.

### Add a `VERIFIED` graph state

Rejected because provenance verification, professional/legal correctness and entity truth are different concepts. The graph only records observation retention/rejection.
