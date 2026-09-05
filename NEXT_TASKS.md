# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Evidence Supply Workbench

**Boundary:** existing Acquisition & Knowledge Staging Control Plane

**Checkpoint:** 2026-09-06

Re-verify live GitHub state before protected, cross-repository,
authenticated-source, or paid execution.

## Phase 4 direction

Knowledge has completed the Phase 3 evidence-workbench foundations rather than
leaving them as an active P1 queue:

- #704 removed the bounded Hybrid Search correctness ceiling;
- #705 unified Browser/Search corpus truth through Knowledge Query Read Model V2;
- #706 added the durable-truth Operator Inbox;
- #707 added objective Evidence Change Review;
- #709 made Reader the central Evidence Inspector surface;
- #711 added factual source coverage/freshness visibility;
- #712 made Knowledge navigation workspace-aware;
- #713 moved retrieval/debug implementation detail behind progressive disclosure.

The next stage does **not** add another retrieval stack, another detail shell, or
MarkOrbit Core semantic/business-intelligence logic. The product goal is to turn
the completed primitives into one continuous evidence-supply workflow, then make
supply health explainable, then freeze reproducible multi-document evidence
contexts for downstream use.

## Immediate Phase 4 execution order

### P0 — Evidence Workspace (#725)

Unify Browser, Search, Operator Inbox and the existing Reader/Inspector into one
continuous workspace navigation model.

Required outcomes:

- query, filters, pagination and useful selection state survive evidence review;
- Browser/Search/Inbox open the same canonical Evidence Inspector experience;
- explicit deep links and back/forward navigation restore the originating work
  context;
- workspace mismatches fail closed;
- Content, Changes, Provenance, Relations and History remain reachable without
  duplicating evidence truth or a second Reader.

This task is application-architecture consolidation. It does not change search
ranking, corpus truth, evidence mutation rules or Core responsibilities.

### P1 — Explainable Evidence Supply Health (#726)

Compose existing durable Source, Run, Scheduler, Artifact, Change, Coverage and
delivery facts into one deterministic evidence-supply condition model.

Keep `COMPLETE | PARTIAL | UNKNOWN` coverage independent from operational health.
Expose factual freshness, reliability, latency and change signals with explicit
reason codes and drill-through evidence. Do not create a hidden trust score,
legal-quality score or AI-generated health narrative.

### P1/P2 — Immutable Evidence Sets / Review Packages (#727)

Add a general workspace-scoped `Evidence Set V1` that freezes exact document,
RawArtifact, version and digest lineage selected by an operator.

A frozen set must remain reproducible after the live corpus changes, report
objective newer-version drift separately, and expose a governed downstream
read/export contract that Core can reference without reconstructing the original
context from a moving corpus.

Knowledge owns context identity and lineage; Core owns semantic synthesis,
legal/business significance, recommendations and user-facing intelligence.

## Phase 4 dependency rule

Execute in this order unless a proven production defect requires interruption:

1. #725 Evidence Workspace;
2. #726 Evidence Supply Health;
3. #727 Evidence Sets / Review Packages.

Do not open additional broad Knowledge product lanes while these three are active
unless a concrete correctness, security, evidence-integrity or cross-repository
contract defect cannot be contained inside them.

## External/operator gates that remain real

### ADK-06 live 3×2 acceptance (#405)

The paid/live provider acceptance remains an explicit operator gate. Run only
with fresh owner authorization, the exact current Knowledge main SHA, protected
execution controls, real provider credentials and authorized durable non-public
evidence retention. Phase 4 product work does not authorize or substitute for
that live run.

### Repository governance / live evidence retention (#429)

Repository governance remains separate from product work. Preserve protected
main, workflow review, protected live credentials, exact-SHA execution and
durable non-public live-evidence retention requirements. Do not weaken these
controls to simplify Phase 4 development.

### CNIPA backend-only evidence debt (#691)

The bounded CNIPA MVP remains complete while backend-only source identity,
schema, pagination and population-coverage facts stay explicitly unverified.
Advance #691 only when a legitimate permitted authenticated raw/source-response
channel exists. Do not bypass CAPTCHA/SSO, anti-debug protections, or extract or
replay session credentials.

## Engineering trigger rule

Start or interrupt a Knowledge coding task only when at least one of these is
true **and** it has concrete acceptance criteria:

1. a live/production path exposes a reproducible acquisition, lineage,
   retrieval, isolation or interoperability defect;
2. a frozen regression corpus exposes a measurable correctness regression;
3. a cross-repository contract drift check proves compatibility work is
   required;
4. an accepted product requirement introduces a new evidence-supply capability
   that still belongs inside Knowledge;
5. an observed operator-throughput, review-usability, coverage-truth or
   evidence-inspection gap prevents efficient use of already-durable evidence.

This rule does not authorize speculative framework work.

## Do not start merely to keep coding

- another generic retrieval/search framework;
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
- paid/live #405 for roadmap optics;
- a second Evidence Inspector, review package runtime or delivery engine when the
  existing durable contracts can be reused.

## Operating rule

**抓大放小.** Prefer continuous operator context, complete corpus truth, exact
lineage, factual supply health, reproducible evidence contexts and durable
cross-system evidence over additional framework surface.
