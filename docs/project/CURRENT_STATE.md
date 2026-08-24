# MarkOrbit Knowledge — Current Engineering State

Checkpoint date: 2026-08-25

This file is the canonical engineering handoff entry point. It records a verified checkpoint, not a dynamically generated branch pointer. Before any protected or paid operation, verify the current GitHub `main` SHA and the relevant issue/PR state again.

## Verified baseline

- Repository: `yoomarks/markorbit-knowledge`
- Verified `main` before this strategic-document PR: `82c007162e0f09513cf66ae4ee070d123d9ea111`
- Latest baseline merge: PR #441 — ADK-11 grounded provider execution authorization
- PR #440 merged grounded PREPARED evidence admission into ADK-07 queue with provider execution still blocked
- Open production acceptance gate: issue #405 — ADK-06 real 3×2 provider acceptance
- Open repository-governance gate: issue #429 — protected main/ruleset, protected live secrets/environment, and durable encrypted evidence retention
- `main` was verified as `protected: false` at this checkpoint; do not claim #429 complete until actual repository administration proves otherwise.
- Core ReadyPackage V2 cross-repository completion: Core PR `yoomarks/markorbit#182` merged; the older Knowledge PR #407 is not the active acceptance path.

## Canonical strategic direction

The post-ADK-11 product direction is defined by:

1. `docs/product/KNOWLEDGE_LONG_TERM_STRATEGY.md`
2. `docs/architecture/KNOWLEDGE_CAPABILITY_SOURCE_BOUNDARIES.md`
3. `docs/architecture/CASE_DOSSIER_AND_EXPERT_SOURCE_ARCHITECTURE.md`
4. `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`

When older roadmap/task documents conflict with these files, the four canonical files above govern future product direction.

## Permanent Knowledge / Brain boundary

Knowledge objectively acquires, preserves, structures, relates, updates, versions, and retrieves information.

Knowledge does **not** own:

- source or provider ranking;
- legal-truth certification;
- deep interpretation;
- cross-case generalization;
- prediction;
- recommendation;
- strategy;
- protected decisions.

Those belong to Brain, humans, Core, or other governed systems.

For Knowledge, an AI answer is an acquired information source. For Brain, AI may be a reasoning/understanding tool. Do not merge those responsibilities.

## Four long-term Knowledge pillars

### 1. Web

Public web, official sources, documents, APIs, feeds, media, and structured public information.

**State:** substantial foundation implemented.

**Current architecture decision:** Web acquisition remains inside `markorbit-knowledge`; do not migrate it to shared Capability now.

### 2. AI

Defined questions/assignments answered by AI providers and preserved as auditable source responses.

**State:** substantial acquisition/evidence foundation implemented through ADK-11.

**Current architecture decision:** generic provider transport/runtime should migrate incrementally to the shared `yoomarks/markorbit` AI Capability, using the existing thin `@markorbit/ai` package as the preferred starting point. Knowledge retains AI source-task semantics and source/evidence records.

### 3. Expert

Questions sent to lawyers/agents/experts and their professional replies/attachments preserved as Knowledge sources.

**State:** first-class source model not yet implemented.

**Current architecture decision:** email send/receive/sync/thread/attachment transport belongs in a shared `yoomarks/markorbit` Communication Capability. Knowledge owns Expert question tasks and captured Expert source records.

### 4. Case

Complete objective Case Dossiers reconstructed from real operational matters.

**State:** first-class Case Dossier pipeline not yet implemented.

**Current architecture decision:** Case is not manually re-entered in Knowledge. A manager/operator selects a real matter in MarkReg and one-click promotes it as a Case Candidate. Knowledge then collects/references the real matter data, documents, correspondence, fees, timing, outcome, and related objective sources to assemble the final dossier.

The current GitHub audit did not locate an accessible MarkReg repo/module by name. `K-CASE-000` in the strategic execution plan must resolve the actual system/repository/interface before implementing the producer. Do not invent or duplicate MarkReg.

## ADK sequence

- **ADK-00 — Implemented.** Architecture and authority contract.
- **ADK-01 — Implemented.** Provider-neutral runtime and DeepSeek adapter.
- **ADK-02 — Implemented.** Durable KnowledgeAssignment and immutable InstructionSet revisions.
- **ADK-03 — Implemented.** Exact provider JSON plus Markdown RawArtifact lineage.
- **ADK-04 — Implemented.** Immutable versioned Assignment Graph.
- **ADK-05 — Implemented.** Evidence-backed Assignment Candidates.
- **ADK-06 — Implementation complete; live acceptance OPEN.** Issue #405 still requires a real DeepSeek + OpenAI 3×2 run and retained evidence.
- **ADK-07 — Implemented and safety hardened.** Durable queue, explicit retries, ambiguous-delivery quarantine and CAS worker/recovery transitions.
- **ADK-08 — Implemented.** Initial US Trademark Assignment Library.
- **ADK-09 — Implemented.** Governed candidate promotion with immutable promotion receipt; no automatic approval/execution.
- **ADK-10 — Implemented.** Separate US/AU/CA trademark Assignment Libraries and catalog bootstrap.
- **ADK-11 — Implemented through current safety boundary.** Official SourcePack/bindings, grounded prompt rendering, immutable persistence, structural citation validation/evidence, PREPARED execution envelopes/evidence, safe queue admission into `BLOCKED_EXECUTION`, and explicit append-only provider-execution authorization contracts. No grounded worker bridge to paid provider execution is authorized by this implementation alone.

## ADK-06 acceptance gate (#405)

Issue #405 must remain open until the actual live acceptance criteria are proven, including:

- exactly the frozen assignments `kas_us_trademark_filing`, `kas_us_trademark_section_8`, `kas_us_trademark_ttab`;
- exactly providers `DEEPSEEK`, `OPENAI`;
- approval reference `github:yoomarks/markorbit-knowledge#405`;
- six of six provider cells `EXECUTED`;
- six acquisition/lineage records;
- twelve unique finalized RawArtifact receipts;
- no unresolved in-flight provider delivery;
- authenticated execution state completed;
- no provider ranking, legal-truth verification or candidate auto-activation;
- encrypted evidence retained in authorized non-public durable storage.

The owner-only dispatch freezes the exact authorized commit. A live workflow whose actual `GITHUB_SHA` differs must fail closed.

#405 is an infrastructure acceptance milestone, not the main future product roadmap. Do not build indefinite new ADK architecture merely because #405 remains operationally open.

## Repository governance gate (#429)

At this checkpoint the repository is public and `main` remains unprotected, while live ADK workflows depend on paid-provider secrets and an evidence passphrase.

The connected engineering surface still does not expose branch-protection/ruleset or Environment administration. Therefore #429 remains a genuine external governance task.

Before routine paid live execution, repository administration should enforce the required main/ruleset and live-secret/evidence controls described in #429.

## Current engineering order

1. Use the four canonical strategy/architecture/task files as the roadmap.
2. Begin `K-CAP-AI` shared AI Capability extraction in `yoomarks/markorbit`; preserve ADK safety/evidence semantics through a compatibility bridge.
3. Begin `K-CAP-COMM` email Communication Capability in `yoomarks/markorbit` based on real consumers; do not build another Knowledge-owned mail platform.
4. Start `K-CASE-000` immediately to locate/freeze the real MarkReg integration boundary.
5. Build the Expert vertical slice once shared Communication can send and correlate a reply.
6. Build the first Case Candidate -> Case Dossier vertical slice from one real completed MarkReg matter.
7. Federate Web/AI/Expert/Case retrieval only after real persisted examples exist; do not design a giant abstract ontology first.
8. Complete #429 when repository-admin capability is available and execute #405 only when its real operational gates are satisfied.

## Current stop/go decisions

### GO

- shared AI Capability migration;
- shared Communication/email Capability;
- Expert source model;
- MarkReg -> Case Candidate contract;
- complete Case Dossier model and first real vertical slice;
- provenance/retrieval/federation needed by the four pillars.

### STOP / DEFER

- additional Knowledge-local generic AI provider transports;
- additional Knowledge-local email transport expansion;
- Web Capability extraction;
- provider count as a roadmap goal;
- Knowledge-side source/expert/case scoring;
- Knowledge-side lessons/recommendations/predictions;
- manually recreating MarkReg cases in Knowledge;
- universal global Case ontology before real dossiers justify it.

## Engineering operating rule

**抓大放小.** Prefer durable end-to-end information assets and real source flows over micro-frameworks and speculative generalization.

Before accepting a material task, ask whether it strengthens one of the four pillars, completes AI/Communication Capability migration, or materially improves provenance/durability/retrieval/interoperability required by those pillars. If not, it is probably not a current strategic priority.
