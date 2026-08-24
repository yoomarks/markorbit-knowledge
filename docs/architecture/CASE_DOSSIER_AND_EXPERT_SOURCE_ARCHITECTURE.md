# Expert Source and Case Dossier Architecture

> Status: **TARGET SOURCE ARCHITECTURE**
>
> Effective: 2026-08-25
>
> Depends on:
> - `docs/product/KNOWLEDGE_LONG_TERM_STRATEGY.md`
> - `docs/architecture/KNOWLEDGE_CAPABILITY_SOURCE_BOUNDARIES.md`

## 1. Purpose

Web and AI acquisition have substantial foundations. The next major source families are Expert and Case.

They must be built as first-class Knowledge sources without turning Knowledge into an email product, a CRM, a case-management system, or a reasoning engine.

This document defines the source objects, workflows, boundaries, and first vertical slices.

## 2. Expert Knowledge is a captured professional answer

Expert Knowledge is created when MarkOrbit asks a professional a defined question and preserves the response as an attributable information source.

Typical experts include:

- local trademark agents;
- attorneys;
- IP firms;
- official-service intermediaries;
- specialist consultants;
- other professional correspondents.

The primary initial channel is email, but the Knowledge model must not be permanently coupled to SMTP/IMAP. The source concept is a professional response; the transport is a shared Capability.

## 3. Expert Question workflow

```text
Operator / approved workflow
        ↓
ExpertQuestionTask
        ↓
Communication Capability send request
        ↓
Thread correlation
        ↓
Reply / follow-up / attachments
        ↓
ExpertSourceRecord
        ↓
Raw evidence + normalized searchable representation
```

### 3.1 ExpertQuestionTaskV1

Minimum fields:

- `taskId`;
- `topic`;
- `jurisdiction` when applicable;
- `question`;
- `expertRef`;
- `organizationRef` when known;
- `requestedBy` / source workflow ref;
- `communicationThreadRef` once created;
- `state`;
- `createdAt`;
- `sentAt`;
- `closedAt`;
- optional `relatedKnowledgeRefs`;
- optional `relatedCaseCandidateId` or `caseDossierId`.

No field should claim that an expert is authoritative, preferred, correct, or high quality.

### 3.2 ExpertSourceRecordV1

Minimum fields:

- `sourceRecordId`;
- `taskId`;
- `expertRef`;
- `organizationRef` when known;
- `jurisdiction` / topic;
- `messageRef` or message refs;
- `threadRef`;
- exact/raw answer artifact reference;
- normalized text derivative reference;
- attachment references;
- `receivedAt`;
- `capturedAt`;
- provenance;
- access classification;
- optional follow-up relationship.

## 4. Expert workflow requirements

The first implementation must prove:

1. Knowledge can create a question task without owning mailbox credentials.
2. The Communication Capability can send the request and return a stable request/thread identity.
3. A reply can be correlated back to the original Knowledge task.
4. Raw message and attachments can be preserved or referenced with auditable provenance.
5. The normalized response is searchable.
6. Follow-up replies remain in the same interview lineage.
7. Restart/replay does not create duplicate Knowledge answers.
8. No source-quality score is created.

## 5. Expert source non-goals

Do not make the first Expert phase into:

- a complete CRM;
- a lawyer marketplace;
- expert recommendation/ranking;
- automated negotiation;
- autonomous legal instruction;
- bulk unsolicited outreach;
- a replacement for existing business correspondence tools.

The first goal is much narrower: **ask a legitimate professional question through a shared communication path and preserve the answer as a Knowledge source.**

## 6. Case Knowledge is a complete dossier

A Case Dossier is an objective, coherent, evidence-backed reconstruction of a real matter.

It is not equivalent to:

- a row in a matter database;
- a status record;
- a list of events;
- an AI-generated article;
- a manually filled case-study form;
- a Brain-generated lesson or recommendation.

The source is the real matter and its operational evidence.

## 7. Case source principle — promote, do not re-enter

The operational matter already exists in MarkReg. Staff must not manually reconstruct the same matter in Knowledge.

The primary user interaction belongs in MarkReg:

> **“This matter has case value — send it to Knowledge Case.”**

That action creates or references a Case Candidate.

Knowledge then performs its own evidence collection and dossier assembly.

## 8. Case Candidate workflow

```text
REAL MATTER IN MARKREG
        │
        │ manager/operator selects case value
        ▼
CASE CANDIDATE
        │
        ├─ stable MarkReg matter ref
        ├─ promotion identity / timestamp
        ├─ access scope
        └─ optional operator note
        │
        ▼
KNOWLEDGE INTAKE
        │
        ├─ collect matter snapshot/reference
        ├─ collect timeline/events
        ├─ collect files
        ├─ collect communications
        ├─ collect fees/deadlines/outcomes
        └─ collect related objective source material when needed
        │
        ▼
DOSSIER ASSEMBLY
        │
        ▼
REVIEW / REDACTION / COMPLETENESS
        │
        ▼
FINALIZED CASE DOSSIER
```

## 9. What “one click” means

The MarkReg action must not immediately claim a final Knowledge case exists.

“One click” should mean:

- create/reuse a deterministic Case Candidate;
- transfer or expose the authorized source references;
- start Knowledge collection;
- avoid duplicate manual entry;
- show the resulting Knowledge intake/dossier state back to the operator when integration permits.

The same MarkReg matter promoted twice must not create two independent Case Candidates unless an explicit new version/re-promotion is requested.

## 10. Case Dossier model

A Case Dossier should be modeled as a versioned aggregate with structured sections plus retained evidence references.

### 10.1 Identity and background

- dossier ID/version;
- source MarkReg matter ID;
- jurisdiction;
- matter type;
- mark/application/registration identifiers as allowed;
- parties/roles as allowed;
- initiating request;
- starting procedural state;
- case period;
- access/privacy classification.

### 10.2 Process narrative

An objective narrative describing the matter from beginning to end.

Narrative statements should remain traceable to one or more source references wherever practicable.

### 10.3 Timeline

Each material event may include:

- event identity;
- date/time;
- actor/role;
- action or occurrence;
- input document/message refs;
- output document/message refs;
- resulting status if recorded;
- deadline if relevant;
- amount/currency if relevant;
- source/provenance refs.

The timeline is evidence for the Case Dossier; it is not itself the whole dossier.

### 10.4 Communications

Capture material correspondence such as:

- client instructions;
- local associate requests;
- expert explanations;
- follow-ups;
- clarification of official requirements;
- confirmations of filing/completion.

Preserve thread/message identity and attachment lineage through the Communication Capability or imported MarkReg evidence references.

### 10.5 Documents

Potential document classes include:

- applications;
- OA/examination notices;
- receipts;
- decisions;
- assignments;
- POAs;
- declarations;
- specimens/evidence;
- appeal/opposition/cancellation papers;
- invoices;
- official fee receipts;
- bank/payment confirmations;
- certificates;
- translations;
- client-provided supporting materials.

### 10.6 Money

Where authorized and useful, record factual amounts and categories:

- official fees;
- professional fees;
- taxes;
- disbursements;
- bank charges;
- penalties;
- restoration/extension fees;
- actual total paid/charged when determinable.

Knowledge must not infer whether a fee was “reasonable” or recommend a price.

### 10.7 Time

Record factual timing:

- event timestamps;
- filing-to-receipt time;
- notice-to-response time;
- response-to-decision time;
- total elapsed case time;
- explicit statutory deadlines captured from source material.

Knowledge may calculate deterministic elapsed durations from recorded timestamps. It must not predict future duration as a Knowledge conclusion.

### 10.8 Outcome

Record what actually happened:

- filed;
- accepted;
- refused;
- registered;
- renewed;
- assigned;
- restored;
- withdrawn;
- abandoned;
- opposed;
- cancelled;
- settled;
- other observed outcome.

Do not derive “success probability” or “best approach.”

## 11. Dossier evidence architecture

A mature Case Dossier should support three separable representations:

```text
Original evidence
      ↓
Normalized / structured case evidence
      ↓
Objective dossier rendering
```

### Original evidence

Preserved or externally referenced source bytes/records.

### Structured evidence

Normalized events, participants, documents, amounts, dates, and links.

### Dossier rendering

A readable case document assembled from the structured evidence, with provenance links back to supporting material.

A corrected rendering does not rewrite original evidence.

## 12. Case Dossier completeness

Completeness is not “case quality.” It is an operational measure of whether required information has been collected.

A dossier may expose objective completeness flags such as:

- matter metadata present;
- start/end state present;
- timeline assembled;
- key communications linked;
- material official documents linked;
- fee data available / unavailable;
- outcome present;
- privacy review complete;
- source references resolved.

Do not turn completeness into a legal-merit score.

## 13. Case Dossier assembly may use AI, but AI is not the case source

AI can assist with mechanical information work such as:

- extracting dates and entities from correspondence;
- ordering events;
- drafting an objective summary from cited case evidence;
- detecting missing referenced attachments;
- generating a proposed dossier structure;
- translating source text while retaining original evidence.

If AI is used, the AI call goes through the shared AI Capability.

The actual Case source remains the real matter evidence. AI-generated text is a derivative used to help assemble the dossier, not a substitute for source evidence.

## 14. Case-related external collection

A selected matter may require additional objective information to make the dossier understandable, for example:

- the version of an official form or rule notice in force at the time;
- an official status page;
- an authority notice referenced by the matter;
- a professional reply that answered a case-specific question.

Knowledge may collect those sources through its normal Web source or Expert source pathways and link them to the Case Dossier.

This is source enrichment, not Brain interpretation.

## 15. First Case vertical slice

Do not start with a universal global Case schema covering every procedure.

The recommended first slice is one real, completed matter type with rich evidence and manageable variability, selected from MarkReg after the actual system location is confirmed.

Candidate examples:

- US trademark Office Action response;
- US Section 8 maintenance matter;
- Japanese trademark assignment.

Selection criteria:

- real completed matter exists;
- full emails/documents are available;
- material timeline is reconstructable;
- fees/outcome are known;
- privacy/redaction can be handled;
- workflow contains enough complexity to validate the dossier model.

Acceptance target:

> A manager selects one real MarkReg matter once, and Knowledge produces a reviewable Case Dossier with no duplicate manual reconstruction of the matter.

## 16. Case states

Recommended initial state machine:

```text
CANDIDATE
  ↓
COLLECTING
  ↓
ASSEMBLED
  ↓
REVIEW_REQUIRED
  ↓
FINALIZED
```

Supporting states:

- `REJECTED`;
- `BLOCKED_SOURCE`;
- `NEEDS_REDACTION`;
- `SUPERSEDED`.

The final state is not `PUBLISHED`. Publication is a separate future product action and must never be implied by Knowledge finalization.

## 17. Privacy/redaction model

The dossier pipeline must assume sensitive data exists.

At minimum distinguish:

- original restricted evidence;
- internal normalized evidence;
- redacted derivative;
- final audience/access classification.

The system must support a dossier that is valuable internally while not being suitable for public release.

Client names, contact data, invoices, privileged communications, bank/payment information, and confidential commercial material require explicit handling rules before broader use.

## 18. Relationship between Expert and Case

Expert and Case are separate pillars but can link naturally.

Example:

```text
Case Dossier
  └─ unresolved procedural question
       └─ ExpertQuestionTask
            └─ ExpertSourceRecord
                 └─ linked back into Case Dossier evidence
```

The expert answer remains an Expert source. The case remains a Case source. The relationship is explicit rather than flattening all information into one undifferentiated document.

## 19. Relationship to Brain

Brain may later ask questions such as:

- What do several experts collectively suggest?
- Which historical cases are most similar to this current matter?
- What is the typical observed duration?
- Which procedural problems recur most often?
- What should the user do next?

Those are valuable future capabilities, but they are **not Case Knowledge implementation tasks**.

Knowledge should focus on making the underlying Expert and Case information complete enough that Brain can reason without reconstructing missing provenance.

## 20. Delivery principle

Build the smallest end-to-end Expert and Case flows that create durable information assets.

Do not spend the first phase building generalized workflow engines, scoring frameworks, ontology systems, or universal case taxonomies that are not required by a real Expert Q&A or real MarkReg case promotion.

The durable direction is broad. The first implementations should remain narrow and real.