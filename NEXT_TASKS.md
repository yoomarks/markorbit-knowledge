# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Evidence Supply Workbench inside the existing Acquisition & Knowledge Staging Control Plane boundary  
**Checkpoint:** 2026-09-04  

This is the short execution pointer. Re-verify live GitHub state before protected, cross-repository, authenticated-source or paid execution.

## Phase 3 direction

Knowledge has completed the prior infrastructure/correctness closeout through the Knowledge Browser completeness work in #696/#702. The next stage does **not** expand Knowledge into MarkOrbit Core semantic/business-intelligence responsibilities.

The product emphasis now shifts from proving that evidence can safely enter the system to making durable evidence fast to find, inspect, compare, review and deliver:

- complete and trustworthy browse/search corpus semantics;
- one corpus-truth read model across operator surfaces;
- durable-truth operator work queues;
- objective evidence change review;
- evidence inspection, provenance and version lineage;
- factual source coverage/freshness visibility.

## Immediate P1 execution order

### P1-0 — Roadmap/current-state truth refresh (#703)

Refresh project docs against live repository truth and record this Phase 3 execution direction. Preserve external/operator gates rather than manufacturing code work around them.

### P1-1 — Hybrid Search completeness (#704)

`GET /api/knowledge/search` still uses bounded candidate windows (`MAX_SCAN = 100`, `MAX_FTS_HITS = 50`). Remove the bounded-candidate correctness ceiling rather than increasing it. Do not present a bounded composed candidate count as an exact total.

### P1-2 — Knowledge Query Read Model V2 (#705)

Unify Browser and Search corpus membership/filter/facet/order semantics so workspace, source, jurisdiction, artifact kind, status, time, counts and pagination do not drift across two truth paths. Retrieval/ranking may remain a separate layer.

### P1-3 — Operator Inbox (#706)

Build one workspace-scoped daily work queue derived only from durable Source/Run/Artifact/Staging/Vault/ReadyPackage evidence. Initial categories include acquisition failure, stale/degraded source, new material, changed evidence, review-needed, Vault conflict, ready-to-deliver and delivery-blocked/reconciliation work.

### P1-4 — Evidence Change Review (#707)

Make objective previous/current version changes reviewable with immutable RawArtifact and normalized-document lineage. Show text/structure/metadata differences without legal-significance scoring or recommendation.

## External / operator gates that remain real

### Repository governance (#429)

Repository-admin governance remains separate from code work. Do not weaken exact-SHA, review or evidence-retention controls to make live acceptance easier.

### ADK-06 live 3×2 acceptance (#405)

Run only with explicit paid/live authorization, current exact Knowledge main SHA, real DeepSeek/OpenAI credentials, protected execution controls, evidence passphrase and authorized durable non-public evidence retention.

### CNIPA backend-only evidence debt (#691)

The bounded CNIPA MVP is already closed. Remaining backend-only source-identity/schema/pagination/coverage facts require a legitimate permitted authenticated raw/source-response channel. Do not bypass CAPTCHA/SSO, anti-debug protections, or extract/replay session credentials.

## P2 product/UX backlog

After the P1 correctness and work-loop sequence above:

1. Evidence Inspector V2 — make Reader the central Content / Changes / Provenance / Relations / History surface.
2. Search UX V2 — URL-persisted filters, status/artifact/date facets, chips, pagination, back-navigation state and saved views.
3. Source Coverage Board — jurisdiction/authority/source-family freshness, last success/change and `COMPLETE | PARTIAL | UNKNOWN` boundaries.
4. Workspace-aware Knowledge navigation — remove product-page dependence on `DEFAULT_WORKSPACE` and make workspace a real navigation context.
5. Progressive disclosure — keep retrieval/debug evidence available while moving implementation details such as FTS/BM25 scores out of the primary operator hierarchy.

## Engineering trigger rule

Start a new Knowledge coding task when at least one of these is true **and** it has concrete acceptance criteria:

1. a live/production path exposes a reproducible acquisition, lineage, retrieval, isolation or interoperability defect;
2. a frozen regression corpus exposes a measurable quality/correctness regression;
3. a cross-repository contract drift check proves compatibility work is required;
4. a product requirement introduces a new evidence-supply capability that still belongs inside Knowledge;
5. an observed operator-throughput, review-usability, coverage-truth or evidence-inspection gap prevents efficient use of already-durable Knowledge evidence.

This broader trigger does not authorize speculative framework work.

## Do not start merely to keep coding

- another generic retrieval framework unrelated to #704/#705;
- blended cross-channel relevance/truth scoring;
- synthetic vector/provider metrics;
- fabricated graph edges or graph lift;
- Knowledge-local generic AI provider transport;
- Knowledge-local generic mailbox/provider platform;
- fake live Expert communication evidence;
- direct MarkReg DB/persistence reads;
- speculative Case ontology/framework expansion;
- broad Web extraction expansion without a concrete production gap;
- autonomous CNIPA auth/CAPTCHA bypass;
- paid/live #405 for roadmap optics.

## Operating rule

**抓大放小.** Prefer complete corpus truth, exact lineage, real source flows, objective changes, measurable operator throughput and durable cross-system evidence over additional framework surface.
