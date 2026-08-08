# Source Graph Protocol v1

## Status

Source Graph Protocol v1 is an independently versioned MarkOrbit Knowledge protocol. It complements, but does not modify, locked Schema v1.

The TypeScript mirror is exported from `@markorbit/contracts/source-graph-v1` through the package root. The language-neutral JSON Schema lives under `schemas/source-graph/v1/`.

## Purpose

The protocol changes the durable discovery model from:

```text
accepted page = SourceDefinition
```

to:

```text
one governed website SourceDefinition
  → one WebsiteSourceProfile
    → source-local graph of observed structure and evidence
```

This is the required granularity before MarkOrbit Knowledge can scale from a few official sites to large trademark offices and 100k–200k professional websites.

## System boundary

### Schema v1 SourceDefinition

Owns operational acquisition identity:

- workspace and data-domain ownership;
- source type/category/authority classification;
- connector binding;
- canonical URI/entrypoints;
- collection-plan ownership;
- source lifecycle.

### WebsiteSourceProfile

Owns website identity for structural discovery:

- `sourceId` binding;
- canonical origin/host;
- explicitly observed host aliases;
- root website graph node.

### Source Graph

Owns source-local observations:

- website structure;
- pages/documents/sitemaps;
- observed organizations and people;
- public professional/business contact observations;
- observed relationships and provenance.

### MarkOrbit Core

Still owns:

- legal meaning and conclusions;
- semantic entity resolution;
- cross-source canonical person/organization identity;
- conflict resolution;
- knowledge/capability/value objects;
- recommendations and professional judgment.

## Objects

### WebsiteSourceProfile

One profile binds to one WEB SourceDefinition.

Important fields:

- `id`: `spf_<ULID>`;
- `sourceId`: Schema v1 source;
- `canonicalOrigin` / `canonicalHost`;
- `observedHostAliases`;
- `rootNodeId`.

A profile is not collection authority. It is descriptive structure attached to an already governed source.

### SourceGraphNode

Node IDs use `sgn_<ULID>`.

Kinds:

| Kind | Meaning | Identity policy |
| --- | --- | --- |
| WEBSITE | graph root for the governed website | canonical URI |
| SECTION | navigation/structural section | canonical URI when addressable, otherwise source-local |
| PAGE | HTML/web page | canonical URI |
| DOCUMENT | PDF/DOCX/XML/other document target | canonical URI |
| SITEMAP | sitemap URL set or index | canonical URI |
| ORGANIZATION | organization observed in this source | source-local |
| PERSON | professional/person observed in this source | source-local |
| CONTACT_POINT | public/business or correctly scoped private professional contact observation | source-local |

Organization/person/contact nodes are evidence observations, not globally resolved entities.

### SourceGraphEdge

Edge IDs use `sge_<ULID>`.

Supported relationship kinds:

- `CONTAINS`;
- `DISCOVERED_FROM`;
- `LINKS_TO`;
- `PUBLISHED_BY`;
- `AUTHORED_BY`;
- `WORKS_AT`;
- `HAS_CONTACT_POINT`;
- `MENTIONS`;
- `REFERENCES`;
- `CITES`.

Direction is semantic:

```text
parent CONTAINS child
page DISCOVERED_FROM sitemap-or-page
page PUBLISHED_BY organization
page AUTHORED_BY person
person WORKS_AT organization
organization HAS_CONTACT_POINT contact
page MENTIONS organization-or-person
```

The protocol intentionally does not define `REPRESENTS`, `CLIENT_OF` or similar verified commercial relationships.

### SourceGraphObservationBatch

Batch IDs use `sgb_<ULID>`.

A batch is an idempotent set of source-local observations produced by Discovery, Collection, Extraction or Manual Import. It is not execution authority and does not authorize crawling.

Every batch is scoped to exactly one:

```text
workspaceId + sourceId + profileId
```

Persistence may upsert repeated observations from the same batch/idempotency key while preserving first/last seen timestamps and provenance.

## Review semantics

Graph review state is deliberately limited to:

```text
OBSERVED → RETAINED
         ↘ REJECTED
```

`RETAINED` means “keep this observation as useful evidence.” It does not mean:

- legally correct;
- authoritative;
- verified professional identity;
- recommended provider;
- verified customer/client relationship.

There is no `VERIFIED` graph state.

Lifecycle state is independent:

```text
ACTIVE → STALE → REMOVED
```

A retained node may later become stale if the source stops exposing it.

## Identity and deduplication

### Canonical URI identity

Website/page/document/sitemap nodes use normalized HTTP(S) URI identity. Discovery canonicalization should remove fragments and known tracking parameters before graph creation.

Repeated observations of the same canonical URI update one source-local node rather than creating new nodes.

### Source-local identity

Organizations, people and contacts use source-local identity keys. Knowledge may deduplicate repeated observations **within the same source profile**, but it must not merge two people or organizations across unrelated sources.

Cross-source identity promotion requires a separate reviewed process outside Source Graph Protocol v1.

## Provenance

Every node and edge requires one or more provenance records.

A provenance record can point to:

- Discovery candidate/batch;
- RawArtifact;
- manual observation;
- imported evidence.

Minimum evidence includes:

- `sourceId`;
- `sourceUri`;
- `observedAt`.

Optional references include candidate ID, discovery batch ID, RawArtifact ID and locator fragment.

No evidence → no graph observation.

## Contact/privacy rule

Website discovery may collect public professional/business contact data that is relevant to professional intelligence, such as:

- public business email;
- general office email;
- office phone/address;
- contact form;
- public professional profile;
- business messaging channel.

It must not perform private-personal enrichment or infer unrelated personal contact information.

Private cooperation email ingestion may later create workspace-private professional observations, but must preserve workspace visibility and must not promote them to public graph data automatically.

## Relationship to existing Discovery observations

`discovery-observation-v1.ts` remains compatible as a lightweight candidate/observation vocabulary. Source Graph Protocol v1 is the durable website-scoped graph envelope that can retain equivalent evidence without performing entity resolution.

No existing observation contract is removed by this protocol.

## Migration target

Future implementation should move toward:

```text
Homepage Seed
  → Website SourceDefinition
  → WebsiteSourceProfile
  → Discovery
  → PAGE / DOCUMENT / SITEMAP nodes
  → organization/person/contact observations
  → human retain/reject
  → collection against the website SourceDefinition
  → RawArtifact evidence linked back into graph provenance
```

Existing page-level SourceDefinitions must be migrated non-destructively and retain compatibility provenance.

## Explicit non-goals for v1

- global entity resolution;
- professional ranking;
- client-relationship truth;
- legal conclusions;
- automatic MGSN provider promotion;
- graph-driven collection without explicit execution authorization;
- replacing RawArtifact as immutable evidence.
