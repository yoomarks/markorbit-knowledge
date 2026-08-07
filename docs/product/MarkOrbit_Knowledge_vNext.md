# MarkOrbit Knowledge vNext

> Status: Draft implementation direction
>
> Scope: acquisition, discovery, evidence preservation and operator control plane

## 1. Product definition

MarkOrbit Knowledge vNext evolves from a URL-by-URL acquisition console into a controlled discovery and evidence-supply system.

Its job is to help operators start from a small set of trusted seeds, discover relevant public professional sources and source-backed observations, acquire the underlying material, preserve provenance, normalize it and deliver verified Ready Packages to MarkOrbit Core.

Knowledge does **not** own legal interpretation, entity resolution, professional recommendation, capability/value scoring or protected decisions. Those remain MarkOrbit Core / product / human responsibilities.

```text
Seeds
  ↓
Controlled Discovery
  ├─ Source candidates
  ├─ Content candidates
  ├─ Entity observations
  └─ Public business contact observations
  ↓
Operator Review / Discovery Policy
  ↓
Accepted Sources + Collection Intent
  ↓
Workers / Connectors
  ↓
Immutable RawArtifact
  ↓
Conversion + Provenance Verification
  ↓
Ready Package
  ↓
MarkOrbit Core
```

## 2. Seed universe

Knowledge must support seeds from multiple source families:

- official trademark offices, courts, gazettes and government databases;
- professional firms and practitioner websites;
- industry blogs, articles, news and specialist information sites;
- video, webinar, podcast and other media channels;
- case and decision databases;
- gazette / announcement databases;
- structured datasets and APIs;
- private professional email and attachments;
- manual uploads and local data sources.

A seed is an entry point, not automatically an approved SourceDefinition.

```text
SEED → DISCOVERING → CANDIDATES → REVIEW → ACCEPTED SOURCE
```

## 3. Controlled Autonomous Discovery

Discovery has two primary directions.

### 3.1 Depth discovery

Starting from a root page or section, discover relevant same-site material through sitemap, navigation, page links, document links and structured endpoints.

Typical controls:

- maximum depth;
- maximum fetched pages / candidates;
- host and domain boundary;
- allow/deny patterns;
- rate and crawl budget;
- URL canonicalization and deduplication;
- content deduplication;
- collection frequency.

### 3.2 Lateral discovery

A collected source may reveal another candidate source through a citation, author profile, organization, case, document or referenced authority.

Lateral discovery proposes candidates. It never promotes a newly observed organization, professional or external site into a trusted source or MGSN provider without the appropriate review boundary.

## 4. Discovery observations

Knowledge may preserve source-backed observations without interpreting their final professional meaning.

### 4.1 Source candidate

A webpage, document, feed, API, dataset, media item or other location that may be worth acquiring.

### 4.2 Entity observation

A source may visibly identify:

- an organization;
- a professional person;
- a government authority;
- a company or brand;
- an author or speaker.

Knowledge records the observation and its evidence. Identity merge / entity resolution belongs to Core.

### 4.3 Contact observation

Knowledge may collect publicly presented **business/professional** contact points when relevant to professional-service operations, including business email, office phone, office address and public professional profile URLs.

Every contact observation must retain:

- observed value and type;
- source URI;
- observed timestamp;
- related observed person / organization when present;
- confidence in the extraction;
- visibility classification;
- last verification timestamp when rechecked.

Knowledge must not broaden discovery into unnecessary private-personal data collection. Private professional correspondence is handled under workspace/data-domain controls and is never treated as public discovery material.

## 5. Source intelligence vs Core intelligence

Knowledge needs acquisition heuristics, but those must not become MarkOrbit Core value/recommendation logic.

Allowed Knowledge-side signals include:

- source authority class;
- topical acquisition relevance;
- freshness / change frequency;
- duplicate likelihood;
- source connectivity;
- extraction confidence;
- acquisition priority.

These signals answer **what should the acquisition system inspect or collect next?**

They do not answer **what is legally correct, commercially best, professionally recommended or most valuable to the user?**

## 6. Professional network boundary

Public discovery can observe a professional or firm, but discovery status and network status are separate.

```text
DISCOVERED
  ↓
VERIFIED
  ↓
CONTACTED
  ↓
COOPERATED
  ↓
QUALIFIED
  ↓
MGSN PROVIDER
```

Knowledge may supply evidence for the early stages. Qualification, provider appointment and recommendation belong to the appropriate MarkOrbit / MGSN governance layer.

A website statement such as “we represented Brand X” must be stored as a source-backed relationship claim, not promoted automatically into a current-client fact.

## 7. Public and private evidence

Public web evidence and private operational evidence must remain distinguishable.

Examples of evidence classes:

- OFFICIAL_SOURCE;
- PUBLIC_PROFESSIONAL_SOURCE;
- PUBLIC_MEDIA_SOURCE;
- PRIVATE_PROFESSIONAL_EMAIL;
- INTERNAL_OPERATIONAL_RECORD.

A lawyer email describing local practice is not automatically an official rule. Downstream systems must be able to distinguish official text, observed practice, professional opinion and internal experience.

## 8. Media acquisition

Media should use an evidence-preserving conversion pipeline:

```text
Video / Audio
  ↓
Caption import or speech-to-text
  ↓
Timestamped transcript
  ↓
Segments / chapters
  ↓
Observed entities / citations
  ↓
Staging + provenance
```

A derived statement must remain traceable to the original media item and timestamp range.

## 9. Operator-first Admin IA

The default admin experience should be organized around business work, not infrastructure primitives.

### Workbench

- Overview
- Discovery
- Sources
- People & Organizations
- Knowledge
- Collection
- Packages

### System / Advanced

- Workers
- Connectors
- Converters
- Conversion Runs
- Raw Artifacts
- Collection Plans
- Execution Runs
- Obsidian / Staging
- Errors
- Audit
- Settings

Workers, leases, manifests and execution ledgers remain first-class engineering objects, but they move out of the operator's primary navigation.

## 10. Human-friendly flows

### Add seed

Default flow:

1. enter one homepage / endpoint or upload a seed list;
2. automatically profile the entry point;
3. run bounded discovery;
4. show candidates with source-backed reasons;
5. operator accepts, rejects or creates a reusable discovery policy;
6. accepted candidates become source / collection intent through existing contracts.

Advanced connector and crawl controls remain available behind an Advanced section.

### Review queue

Review actions should support:

- Accept;
- Reject;
- Preview;
- Accept similar;
- Always include section/pattern;
- Never include section/pattern.

Review feedback becomes discovery policy data. It must not be represented as legal training labels.

## 11. Autonomy levels

Sources may use staged automation:

- **L0 Manual** — operator supplies exact targets;
- **L1 Assisted** — system discovers, operator approves candidates;
- **L2 Guided** — known-safe patterns auto-accept, exceptions require review;
- **L3 Autonomous** — discovery and collection run inside an approved policy and budget;
- **L4 Trusted Monitoring** — stable source is continuously maintained and only material exceptions surface to operators.

The first production target is L1/L2, not unrestricted crawling.

## 12. Delivery phases

### Phase 1 — Discovery MVP

- homepage seed;
- bounded HTML link discovery;
- URL normalization and dedupe;
- candidate review boundary;
- accepted candidate → collection plan flow;
- operator-first Discovery UI.

Validate with USPTO plus a small set of professional-firm sites.

### Phase 2 — Entity and contact observations

- organization observations;
- professional-person observations;
- public business contact observations;
- evidence/provenance for every observation;
- no automatic identity merge.

### Phase 3 — Discovery control and scale

- sitemap / robots support;
- source-specific policies;
- authority/relevance/freshness acquisition signals;
- durable discovery frontier;
- retry, lease and distributed execution integration;
- bulk seed import for large professional-site inventories.

### Phase 4 — Media, case and gazette acquisition

- timestamped media conversion;
- case / decision acquisition profiles;
- gazette and announcement update feeds;
- structured data adapters.

### Phase 5 — Relationship evidence

Preserve source-backed relationship observations such as authored-by, works-at, cites, published-by and mentioned-client so Core can resolve and interpret them.

### Phase 6 — Continuous discovery flywheel

Core may return declarative knowledge-gap or source-follow-up requests. Knowledge converts those requests into bounded discovery work without importing Core reasoning logic into this repository.

## 13. Success measures

Do not optimize primarily for terabytes downloaded or URL count.

Operational measures should include:

- accepted discovery candidate rate;
- duplicate suppression rate;
- provenance completeness;
- source freshness and change latency;
- collection / conversion failure rate;
- Ready Package acceptance rate;
- stale public-business contact detection rate;
- percentage of accepted sources used downstream by Core / MarkReg / Lite.

## 14. Non-goals for the first implementation

- unrestricted recursive crawling;
- automatic legal conclusions;
- automatic professional recommendation or ranking;
- automatic MGSN qualification;
- private-personal data enrichment unrelated to professional-service use;
- replacing immutable RawArtifact / existing worker and conversion architecture;
- making Obsidian the system of record.
