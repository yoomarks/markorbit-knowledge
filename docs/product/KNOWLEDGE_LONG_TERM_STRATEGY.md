# MarkOrbit Knowledge — Long-Term Strategy

> Status: **CANONICAL PRODUCT DIRECTION**
>
> Effective: 2026-08-25
>
> This document defines the long-term role of MarkOrbit Knowledge. When an older roadmap, task pack, or architecture note conflicts with this document, this document governs product direction. Historical documents remain useful as implementation history, not as authority for future ownership boundaries.

## 1. Mission

MarkOrbit Knowledge is the long-term industry information foundation for MarkOrbit.

Its mission is to **objectively acquire, preserve, structure, relate, update, and make retrievable the information that exists in the intellectual-property industry**.

Knowledge is not the system that decides what information is correct, more important, commercially preferable, legally advisable, or strategically meaningful. Those interpretation and reasoning responsibilities belong to Brain and, where appropriate, to humans or protected business systems.

The permanent boundary is:

```text
Knowledge = what sources said / what actually happened
Brain     = what the information means
```

Knowledge may organize and summarize source material to make it usable, but it must not silently turn source material into MarkOrbit judgment.

## 2. Permanent responsibility boundary

### Knowledge owns

- acquisition;
- source preservation;
- raw and derived artifact lineage;
- normalization and structure;
- provenance;
- source identity and timestamps;
- relationships between information objects;
- retrieval and indexing;
- version history;
- change tracking;
- objective source summaries;
- objective reconstruction of real cases.

### Knowledge does not own

- source-quality ranking;
- provider ranking;
- expert ranking;
- legal-truth certification;
- reliability scoring intended to decide whose answer is right;
- deep interpretation;
- cross-case generalization;
- prediction;
- recommendation;
- strategy selection;
- client advice;
- protected business decisions;
- autonomous filing or other protected actions.

Those are Brain, human, Core, or other governed-system responsibilities.

## 3. The four long-term Knowledge pillars

Knowledge will be developed as four first-class information-source families.

| Pillar | Core question                                               | Primary source                                   | Current maturity       | Long-term role                                     |
| ------ | ----------------------------------------------------------- | ------------------------------------------------ | ---------------------- | -------------------------------------------------- |
| Web    | What has the public world published?                        | Websites, official documents, APIs, feeds, media | Established            | Broad public-information foundation                |
| AI     | What did an AI source answer when asked a defined question? | OpenAI, DeepSeek, Claude, Gemini, other models   | Established foundation | Repeatable machine-source interview archive        |
| Expert | What did a lawyer, agent, or expert answer?                 | Professional correspondence                      | To build               | Professional-practice information archive          |
| Case   | What actually happened in a real matter?                    | MarkReg operational matters and their evidence   | To build               | Highest-scarcity first-party industry case archive |

The four pillars are complementary. Knowledge does not declare one pillar inherently true or superior to another. They answer different questions and preserve different observations.

## 4. Pillar A — Web Knowledge

Web Knowledge captures the public information world, including:

- intellectual-property offices and courts;
- laws, regulations, manuals, practice notices, fee schedules, gazettes, and official guidance;
- professional-firm websites and practitioner publications;
- industry news, reports, specialist sites, blogs, video, audio, and public datasets;
- public APIs and structured endpoints.

The current crawler, acquisition, RawArtifact, provenance, conversion, discovery, and source-monitoring capabilities remain inside `markorbit-knowledge` for now.

### Strategic decision

**Web acquisition is not being migrated into the shared Capability layer in the current phase.**

Although web acquisition could become reusable elsewhere in the future, current reuse does not justify the extraction cost. A later migration requires demonstrated multi-product demand, not architectural aesthetics.

## 5. Pillar B — AI Knowledge

For Knowledge, AI is an **information source**, not the reasoning brain of Knowledge.

A governed AI acquisition is conceptually an interview:

```text
Defined question / assignment
        ↓
Shared MarkOrbit AI Capability
        ↓
Provider + model response
        ↓
Knowledge AI Source Record
```

Knowledge should preserve, at minimum:

- the question or assignment identity;
- prompt/instruction identity and version when relevant;
- provider and model identity;
- exact acquired response or retained response artifact;
- acquisition timestamp;
- request/response provenance;
- execution/evidence identity required to audit the acquisition.

Knowledge must not convert the existence of an AI answer into a claim that the answer is legally correct.

### Strategic decision

Provider SDKs, API credentials, transport, model invocation, shared retry/delivery semantics, usage metering, and cost accounting are **platform capabilities** and should migrate to the `yoomarks/markorbit` Capability layer.

The existing `yoomarks/markorbit/packages/ai` package is the preferred starting point because it is already described as a model gateway / structured invocation abstraction. The migration must reuse—not discard—the safety and evidence lessons implemented in ADK.

Knowledge retains the **information-acquisition task and source record**, not platform-wide AI transport ownership.

## 6. Pillar C — Expert Knowledge

Expert Knowledge captures answers from lawyers, trademark agents, local associates, consultants, and other professional experts.

The primary initial channel is email.

A typical flow is:

```text
Knowledge Expert Question Task
        ↓
Shared Communication Capability
        ↓
Outbound email / thread
        ↓
Expert reply + attachments
        ↓
Knowledge Expert Source Record
```

Knowledge should preserve:

- the exact question asked;
- expert identity and professional context available to the system;
- organization / jurisdiction context;
- thread/message references;
- the answer as received;
- attachments and their provenance;
- timestamps;
- follow-up question/answer lineage;
- source visibility and access classification.

Knowledge does not rank experts or decide which expert is correct.

### Strategic decision

Mailbox connection, Gmail/Outlook/SMTP/IMAP transport, send/receive, mailbox synchronization, thread mechanics, attachment transfer, and delivery tracking are **shared Communication Capability** responsibilities in `yoomarks/markorbit`.

Knowledge owns the Expert interview/task semantics and the resulting source records.

## 7. Pillar D — Case Knowledge

Case Knowledge is the highest-scarcity long-term information asset in this strategy.

A Case is **not** one database fact, one event, one status history, or a manually completed form. A Case is a complete, objective **Case Dossier** reconstructing a real professional matter from beginning to end with its supporting evidence.

Examples include:

- a complete US trademark application and examination path;
- a US opposition/cancellation/enforcement matter;
- a Japanese trademark assignment;
- a renewal, declaration, appeal, recordal, cancellation, or restoration process in a specific jurisdiction.

### 7.1 Case Dossier content

A final Case Dossier may contain, where available and relevant:

- matter identity and jurisdiction;
- background and original request;
- parties / marks / application or registration references;
- the complete process timeline;
- every material procedural step;
- client and associate communications;
- questions asked and answers received;
- official notices and filing receipts;
- submissions and supporting documents;
- POAs, assignments, declarations, evidence, certificates, and other files;
- fee quotations, official fees, professional fees, disbursements, bank charges, and actual costs where permitted;
- statutory and operational deadlines;
- elapsed time for material stages;
- corrections, refusals, deficiencies, supplements, and unexpected events;
- final outcome;
- source references supporting the material statements in the dossier;
- privacy/redaction status and access classification.

An Event is a component of a Case. The Case Dossier is the Knowledge product.

### 7.2 No duplicate manual entry

Case Knowledge must not begin with staff manually recreating a matter in Knowledge.

The canonical flow is:

```text
Real operational matter in MarkReg
        ↓
Manager identifies case value
        ↓
One-click “send/promote to Knowledge Case”
        ↓
Case Candidate package/reference
        ↓
Knowledge collects linked matter information and evidence
        ↓
Case Dossier assembly
        ↓
Operator review / redaction / completeness
        ↓
Finalized Case Dossier
```

MarkReg remains the operational system of record for the live matter. Knowledge receives a selected matter as a Case Candidate and turns the existing operational history into an information asset.

The current GitHub audit did not locate a MarkReg repository/module in the accessible `yoomarks` codebase. Therefore the first Case integration implementation task must identify the actual MarkReg system boundary before binding the contract to a specific repository. The product contract in this document remains valid regardless of the eventual code location.

### 7.3 Objective, not interpretive

Knowledge may write:

> “The associate requested a newly signed document on 6 March; the client returned the replacement on 8 March; the filing was submitted on 10 March.”

Knowledge must not elevate that case into a generalized conclusion such as:

> “Signing problems are the main risk in Japanese assignments.”

Cross-case comparison, lessons, likelihood, strategy, or recommendations belong to Brain.

## 8. Shared Capability policy

The Capability layer exists for capabilities with demonstrated multi-module reuse.

### Extract now

1. **AI Capability** — shared model gateway / invocation infrastructure.
2. **Communication Capability** — shared email transport and message infrastructure.

### Do not extract now

- Web acquisition;
- domain-specific Knowledge workers;
- low-frequency helper functions;
- Case semantics;
- Expert semantics.

The rule is:

> Extract a capability because multiple real consumers need it, not because a generic platform diagram looks cleaner.

## 9. Relationship to the wider MarkOrbit system

```text
                         Brain
          interpretation / comparison / reasoning
                           ▲
                           │
           ┌───────────────┼───────────────┐
           │               │               │
       Knowledge       Data Engine        Core
     information &      structured      business /
       evidence        world data       workflow
           ▲
           │
  ┌────────┼─────────┬───────────┐
  │        │         │           │
 Web       AI      Expert       Case
  │        │         │           │
  │    AI Capability │        MarkReg
  │              Communication
  │                Capability
```

The exact ownership of individual shared contracts may evolve, but the responsibility boundary must remain stable.

## 10. Product-development priority

Current maturity is asymmetric:

- Web: substantial foundation exists.
- AI: substantial Knowledge-side acquisition foundation exists; transport ownership now needs migration.
- Expert: source/product model needs to be built.
- Case: source/product model needs to be built and should become the highest-value accumulation track.

Therefore future development should not measure progress primarily by:

- number of AI providers;
- number of prompts;
- number of crawled URLs;
- number of framework abstractions.

More meaningful measures include:

- provenance completeness;
- source coverage across the four pillars;
- acquisition reliability;
- Expert Q&A thread completeness;
- percentage of selected MarkReg matters that can be assembled into a complete Case Dossier without duplicate manual entry;
- Case Dossier evidence coverage;
- retrieval usefulness for downstream Brain/Core/Lite consumers;
- freshness and version/change visibility.

These are information-system measures, not truth or recommendation scores.

## 11. Long-term moat

Public web acquisition is broadly replicable. AI APIs are commercially available. Experts can be contacted by competitors.

A large, well-governed archive of **real professional Case Dossiers accumulated through actual operations over many years is much harder to reproduce quickly**.

The strategic advantage is not that Knowledge itself becomes more opinionated. It is that Brain and other MarkOrbit products eventually receive a richer, more complete, more traceable information world.

The long-term objective is therefore:

> Build the most complete, objective, traceable intellectual-property industry information foundation MarkOrbit can sustainably acquire — especially the real case history that only genuine operations can produce.

## 12. Engineering operating rule — “抓大放小”

Every material Knowledge task should answer at least one of these questions:

1. Does it strengthen one of the four Knowledge pillars?
2. Does it complete the current AI or Communication Capability migration?
3. Does it improve provenance, durability, retrieval, or interoperability required by those pillars?
4. Does it reduce duplicate manual work in Expert or Case acquisition?

If not, it is probably not a current strategic priority.

Do not expand infrastructure simply because it can be generalized. Prefer end-to-end source flows, durable information assets, and clear ownership boundaries.
