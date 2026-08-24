# MarkOrbit Knowledge — Strategic Review 2026-08-25

> Review type: product / design / architecture / engineering direction reset
>
> Outcome: approved direction captured in canonical strategy, architecture, and task files

## 1. Why this review was necessary

The repository had reached a technically mature ADK-11 safety/evidence boundary, but the implementation roadmap was beginning to risk confusing infrastructure progress with the long-term product mission.

The review was triggered by three product-level observations:

1. Knowledge must remain an objective information-acquisition and preservation system; it must not absorb Brain interpretation/evaluation responsibilities.
2. AI and email transport are clearly reusable MarkOrbit capabilities and should not remain strategically owned by Knowledge.
3. the most scarce long-term industry information is not public web content or model answers, but complete real professional cases accumulated from actual operations.

The purpose of this review is to prevent future engineers from continuing old task sequences after the product direction has changed.

## 2. Audit facts

### Repository state

- `markorbit-knowledge` reached ADK-11 through PR #441 before this review.
- PR #440 safely connected PREPARED grounded evidence to the ADK queue but kept grounded execution blocked.
- PR #441 added a separately governed provider-execution authorization model without enabling a live bridge.
- issues #405 and #429 remain open operational/governance gates.
- `main` was verified unprotected at the checkpoint.

### Documentation drift

The previous `MarkOrbit_Knowledge_vNext.md` remained focused on controlled public discovery and treated private professional email as part of the Knowledge seed universe.

The historical `K-EXT-C-EMAIL-WORKER-PRODUCTION-INGESTION.md` explicitly directed production email ingestion through a Knowledge worker.

Those were reasonable implementation directions at the time, but they no longer represent the target platform ownership after the four-pillar review.

### Main-repository capability audit

`yoomarks/markorbit` already contains `packages/ai` / `@markorbit/ai`, described as a model gateway and structured invocation abstraction. The implementation is currently thin, making it a natural target for shared AI Capability development rather than introducing a new gateway.

No equivalent shared Communication/email package was identified in the main-repository package list during this review.

### MarkReg integration audit

No accessible GitHub repository/module named MarkReg was found under the current `yoomarks` installation or main repository tree.

This does not invalidate the product decision that Case Knowledge must originate from real MarkReg matters. It means the first engineering task is to identify and verify the actual operational system boundary before implementing its producer side.

## 3. Design Director review

### Core design conclusion

Knowledge should be designed around **source work and information assets**, not infrastructure primitives.

The long-term operator-facing Information Architecture should make the four source families visible:

```text
Knowledge
  ├─ Web
  ├─ AI
  ├─ Expert
  └─ Cases
```

Workers, leases, provider adapters, mail synchronization, and execution ledgers remain engineering/system views, not the primary mental model for operators.

### Expert UX principle

The Expert workflow should feel like:

1. define/select a professional question;
2. select the expert;
3. send;
4. wait for response;
5. inspect captured answer/attachments;
6. optionally follow up;
7. close/capture.

It should not expose SMTP/IMAP/Gmail provider mechanics as the core workflow.

### Case UX principle

Case creation should **not** begin with a blank Knowledge form.

The first primary interaction belongs in MarkReg:

> “This real matter has case value — send it to Knowledge Case.”

Knowledge then presents collection/assembly/review progress, not a second case-management UI requiring operators to duplicate the matter.

### Case Dossier presentation principle

The final dossier should read as a coherent professional case file, not as a raw event dump.

The reader should be able to understand:

- background;
- what happened;
- in what order;
- who requested/responded;
- which materials were used;
- what official steps occurred;
- costs and timing where available;
- final result;
- where each material statement came from.

There is intentionally no “best practice” or “lesson learned” section in Knowledge. Brain may create such interpretations later.

## 4. Architect review

### Primary architecture decision

Separate shared transport capability from Knowledge source semantics.

```text
AI Capability ───────────────┐
                            ├─> Knowledge AI Source
Communication Capability ───┤
                            ├─> Knowledge Expert Source
MarkReg ─────────────────────┤
                            └─> Knowledge Case Source
Knowledge Web acquisition ─────> Knowledge Web Source
```

### AI

Move generic:

- provider SDKs;
- credentials;
- invocation;
- delivery semantics;
- usage/cost;
- generic response envelope

toward main-repo `@markorbit/ai`.

Keep in Knowledge:

- assignments/questions;
- source bindings;
- Knowledge evidence;
- source records;
- Knowledge-specific orchestration and provenance.

### Email

Move generic:

- send;
- receive/sync;
- account binding;
- message/thread identity;
- attachments;
- delivery/sync state

to a shared main-repo Communication Capability.

Keep in Knowledge:

- Expert question task;
- Expert response capture;
- Knowledge provenance and indexing.

### Web

Do not migrate now. Revisit when genuine multi-product reuse exists.

### Case

MarkReg is the operational system of record; Knowledge is the dossier/information-asset system. Use versioned contracts and idempotent promotion, not shared database assumptions.

## 5. Product Manager review

### Product definition

Knowledge is an industry information foundation, not a legal-answer engine.

The four source pillars answer four different questions:

- **Web:** what was publicly published?
- **AI:** what did a model answer when asked?
- **Expert:** what did a professional answer?
- **Case:** what actually happened in a real matter?

### Strategic priority

Web and AI already have meaningful foundations. Expert and Case should now become first-class roadmap tracks.

Case is the highest-scarcity long-term asset because complete real matters require actual operations and time to accumulate. It should therefore receive sustained investment even if its first implementation is narrower and slower than adding another web source or AI provider.

### Success metrics

Do not use provider count or prompt count as primary success metrics.

Prefer:

- four-pillar coverage;
- provenance completeness;
- acquisition reliability;
- Expert reply capture completeness;
- Case Dossier completeness;
- percentage of selected MarkReg matters assembled without duplicate manual entry;
- retrieval usefulness;
- source freshness/version visibility.

### Roadmap principle

“抓大放小” means protecting the big information-system direction from being consumed by small framework work. Production bugs/security issues still matter, but speculative generalization is not a roadmap substitute.

## 6. Chief Engineer review

### Engineering conclusion

Do not rewrite the repository. The existing ADK/RawArtifact/provenance/queue work is valuable infrastructure and should be reused.

The next engineering program is a **boundary migration plus two new source verticals**, not a greenfield rebuild.

### Engineering priorities

1. freeze canonical documents and stop strategic drift;
2. migrate AI generic transport incrementally through a compatibility bridge;
3. build shared Communication V1 from the Expert Q&A consumer;
4. identify actual MarkReg boundary immediately;
5. implement Expert Q&A end to end;
6. implement one real Case Dossier end to end;
7. only then generalize/federate based on real persisted examples.

### Engineering risks

#### Risk A — big-bang AI migration

Mitigation: provider-by-provider parity and compatibility adapters.

#### Risk B — Communication Hub scope explosion

Mitigation: start with email and the minimal Expert consumer; do not build omni-channel CRM infrastructure without demand.

#### Risk C — Case universal-schema overdesign

Mitigation: build against one real completed matter, then a second matter type.

#### Risk D — duplicate operational data

Mitigation: MarkReg promotion/export; no primary manual Case recreation.

#### Risk E — confidentiality leakage

Mitigation: access classification, original/restricted evidence, redacted derivatives, no automatic publication.

#### Risk F — Knowledge/Brain boundary erosion

Mitigation: PR review checklist; explicitly reject scoring/recommendation/generalization inside Knowledge.

#### Risk G — historical documents driving future work

Mitigation: canonical file hierarchy plus supersession banners on stale roadmap/task packs.

## 7. Joint decisions

The four review lenses converge on these decisions:

1. **Knowledge remains objective information infrastructure.**
2. **Four pillars are canonical: Web, AI, Expert, Case.**
3. **AI transport migrates to shared main-repo AI Capability.**
4. **Email transport migrates to shared main-repo Communication Capability.**
5. **Web acquisition does not migrate now.**
6. **Expert Knowledge is built over Communication Capability, not a Knowledge mail stack.**
7. **Case Knowledge originates from real MarkReg matters selected by operators.**
8. **Case is a complete Case Dossier, not a row/event list/manual form.**
9. **Case Dossier may be objectively summarized but does not contain Brain-style lessons, predictions, or recommendations.**
10. **The first Case implementation uses one real vertical slice rather than a global universal ontology.**
11. **#405/#429 remain real gates but no longer define the product roadmap.**
12. **Future engineers follow `KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md` and must justify work against the strategic pillars.**

## 8. Canonical outputs of this review

- `docs/product/KNOWLEDGE_LONG_TERM_STRATEGY.md`
- `docs/architecture/KNOWLEDGE_CAPABILITY_SOURCE_BOUNDARIES.md`
- `docs/architecture/CASE_DOSSIER_AND_EXPERT_SOURCE_ARCHITECTURE.md`
- `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`
- `docs/tasks/MARKORBIT_CAPABILITY_MIGRATION_HANDOFF.md`
- updated `docs/project/CURRENT_STATE.md`

These files convert the review from a conversation into repository-governed engineering direction.