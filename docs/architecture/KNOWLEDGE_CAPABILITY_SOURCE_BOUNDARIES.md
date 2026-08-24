# Knowledge Capability and Source Boundaries

> Status: **CANONICAL ARCHITECTURE DECISION**
>
> Effective: 2026-08-25
>
> Product direction: `docs/product/KNOWLEDGE_LONG_TERM_STRATEGY.md`

## 1. Why this boundary exists

MarkOrbit Knowledge has accumulated strong acquisition, provenance, provider, and worker infrastructure. Some of that infrastructure is now clearly useful beyond Knowledge.

The architecture must separate:

- **platform capabilities** — reusable ways MarkOrbit communicates with external systems;
- **Knowledge source semantics** — why Knowledge is acquiring something and how the acquired information is preserved;
- **Brain reasoning** — what acquired information means;
- **operational systems** — where live business matters are actually managed.

The goal is not maximum abstraction. The goal is stable ownership with minimal duplication.

## 2. Canonical boundary

```text
Shared Capability Layer
  ├─ AI Capability
  └─ Communication Capability
          │
          ▼
MarkOrbit Knowledge
  ├─ Web Source
  ├─ AI Source
  ├─ Expert Source
  └─ Case Source
          │
          ▼
Brain / Core / Lite / other governed consumers
```

Knowledge does not become the owner of platform-wide AI or email transport merely because Knowledge was an early consumer.

## 3. Capability decision matrix

| Capability / domain                   | Current owner                                          | Target owner                                  | Migrate now?       | Reason                                        |
| ------------------------------------- | ------------------------------------------------------ | --------------------------------------------- | ------------------ | --------------------------------------------- |
| AI provider transport / SDKs          | Knowledge ADK + thin main package                      | `yoomarks/markorbit` Capability               | Yes                | Clear multi-product reuse                     |
| AI credentials / model invocation     | Knowledge ADK currently contains production paths      | `yoomarks/markorbit` Capability               | Yes                | Must not be Knowledge-specific                |
| AI usage/cost/delivery mechanics      | Knowledge ADK currently carries safety logic           | `yoomarks/markorbit` Capability               | Yes, incrementally | Shared operational concern                    |
| Email send/receive/sync               | Knowledge has an IMAP ingestion implementation/history | `yoomarks/markorbit` Communication Capability | Yes                | Core/MarkReg/Knowledge all need communication |
| Email thread/attachment mechanics     | Knowledge-specific paths exist                         | Shared Communication Capability               | Yes                | Reusable transport primitive                  |
| Web crawler/acquisition               | Knowledge                                              | Knowledge                                     | No                 | Current reuse does not justify extraction     |
| Expert interview semantics            | Not yet first-class                                    | Knowledge                                     | Build              | Information-source semantics                  |
| Case Dossier semantics                | Not yet first-class                                    | Knowledge                                     | Build              | Knowledge asset, not platform primitive       |
| MarkReg operational matter            | MarkReg                                                | MarkReg                                       | No                 | Operational system of record                  |
| Interpretation/scoring/recommendation | Must remain outside Knowledge                          | Brain / governed business logic               | No                 | Permanent responsibility boundary             |

## 4. AI Capability target

The main `yoomarks/markorbit` repository already contains `@markorbit/ai` at `packages/ai`, whose package description identifies it as a model gateway and structured invocation abstraction. Its current implementation is intentionally thin. This is the preferred target for shared AI capability rather than creating a second competing gateway.

### 4.1 AI Capability owns

- provider adapters and SDK integration;
- provider/model registry;
- credentials and secret references;
- transport execution;
- shared delivery-state semantics;
- timeout / network uncertainty representation;
- provider request identifiers where available;
- shared retry eligibility primitives;
- usage/tokens/cost accounting where supported;
- structured invocation contract;
- streaming/non-streaming transport if required by consumers;
- capability-level audit identity;
- generic response envelope.

### 4.2 Knowledge owns after migration

- `KnowledgeAssignment` / source-acquisition intent;
- question/prompt purpose;
- SourcePack and source binding where applicable;
- AI Source record;
- acquired response artifact and provenance;
- Knowledge-specific evidence lineage;
- Knowledge queue/orchestration semantics that remain domain-specific;
- mapping a generic AI capability response into immutable Knowledge evidence.

### 4.3 Brain owns

Brain may use the same AI Capability for reasoning. That does not make Brain reasoning a Knowledge function.

The shared capability can therefore support two very different consumers:

```text
Knowledge -> AI Capability -> acquired source response
Brain     -> AI Capability -> reasoning execution
```

The transport is shared; the semantic purpose and data ownership are not.

## 5. AI migration rules

Migration must be incremental and preserve proven safety behavior.

Do not perform a big-bang deletion of ADK provider code before the shared capability proves parity.

Required sequence:

1. define a minimal shared invocation contract from real existing consumers;
2. implement one provider through `@markorbit/ai`;
3. add a Knowledge compatibility adapter that calls the shared capability;
4. prove current deterministic tests and fail-closed delivery semantics still hold;
5. migrate the second provider;
6. move generic credential/usage/transport responsibility out of Knowledge;
7. remove duplicated Knowledge provider transports only after parity evidence exists.

### Safety invariants to preserve

- delivery-uncertain paid calls are not automatically replayed;
- secrets are never persisted in Knowledge records;
- exact provider output needed as evidence remains preservable;
- Knowledge execution identity remains auditable;
- provider response does not become legal truth;
- #405 live acceptance and #429 governance remain independent gates until actually satisfied.

## 6. Communication Capability target

Email is a shared communication channel, not a Knowledge-specific acquisition primitive.

A shared Communication Capability in `yoomarks/markorbit` should be designed from real consumers, starting with email.

### 6.1 Communication Capability owns

- account/provider binding;
- Gmail / Outlook / SMTP / IMAP integrations as required;
- outbound send;
- inbound synchronization;
- message identity;
- thread identity;
- participant/address representation;
- attachment transfer/reference;
- delivery/send state;
- mailbox cursor/sync state;
- provider-specific identifiers;
- generic message audit metadata;
- safe secret handling.

It does not decide the business meaning of a message.

### 6.2 Knowledge Expert Source owns

- expert-question task identity;
- why the expert was asked;
- requested jurisdiction/topic;
- expected answer scope;
- correlation to a Communication thread;
- captured expert answer;
- captured attachments/evidence;
- follow-up lineage;
- Knowledge provenance and indexing.

### 6.3 Other consumers

The same Communication Capability may later serve:

- Core client communication;
- MarkReg matter correspondence;
- billing/operations notices;
- other MarkOrbit applications.

Knowledge should not own those use cases.

## 7. Existing Knowledge email worker

The historical Knowledge email ingestion path remains useful engineering evidence, especially around:

- read-only mailbox access;
- UID/UIDVALIDITY semantics;
- restart safety;
- message hash verification;
- secret separation;
- immutable artifact ingestion.

However, it is no longer the target ownership model for new email transport development.

New transport work should target the shared Communication Capability. Knowledge-specific code may temporarily remain as a compatibility path during migration.

## 8. Web acquisition stays in Knowledge

Current web acquisition is strongly coupled to Knowledge source discovery, evidence capture, crawl policy, conversion, and provenance.

The current decision is explicitly:

> **Do not migrate Web acquisition to the Capability layer now.**

Revisit only if multiple independent MarkOrbit products need the same crawler/connector runtime and the extraction produces less duplication than it creates.

## 9. Expert Source integration contract

The first Expert vertical slice should use an asynchronous task/correlation pattern, not embed mail transport inside Knowledge.

Conceptual objects:

```text
ExpertQuestionTask
  id
  expertRef
  topic / jurisdiction
  question
  communicationRequestRef
  state
  createdAt

CommunicationThreadRef
  capabilityThreadId
  provider/account binding ref

ExpertSourceRecord
  taskId
  answer message ref(s)
  attachment ref(s)
  receivedAt
  provenance
  raw/derived artifact refs
```

Recommended task states:

```text
DRAFT
-> READY_TO_SEND
-> SENT
-> WAITING_RESPONSE
-> RESPONSE_RECEIVED
-> NEEDS_FOLLOW_UP (optional)
-> CAPTURED
-> CLOSED
```

These states describe acquisition workflow, not expert quality.

## 10. Case Source integration contract

Case acquisition has a different entry pattern from Web, AI, or Expert.

It begins with a real operational matter selected in MarkReg.

```text
MarkReg matter
  -> operator selects “case value”
  -> idempotent Case Candidate export/reference
  -> Knowledge intake
  -> evidence collection
  -> Case Dossier assembly
  -> review/redaction/completeness
  -> finalized dossier
```

### 10.1 MarkReg owns

- live matter identity;
- operational status;
- canonical matter actions as actually recorded;
- operational documents and correspondence references;
- user/operator action to select/promote a matter;
- idempotent export/reference identity.

### 10.2 Knowledge owns

- Case Candidate intake;
- source snapshot/reference needed for reproducibility;
- dossier-specific evidence collection;
- linking communication/documents/artifacts;
- objective timeline assembly;
- objective narrative assembly;
- completeness state;
- privacy/redaction state;
- dossier versions;
- finalized Case Dossier retrieval/indexing.

### 10.3 MarkReg discovery prerequisite

The 2026-08-25 GitHub audit did not locate an accessible repository or code module named MarkReg under the current `yoomarks` installation or `yoomarks/markorbit` tree.

Therefore the first implementation ticket must establish:

- actual MarkReg system location;
- owner/team;
- stable matter identifier;
- supported API/event/export mechanism;
- document/email reference model;
- authorization model.

Do not invent a repository or duplicate MarkReg data while this discovery is unresolved.

## 11. Case Candidate minimum envelope

The initial cross-system contract should remain minimal. It should identify the matter and allow Knowledge to collect what is authorized, rather than serializing every possible field into a giant contract.

Suggested envelope:

```text
CaseCandidateV1
  candidateId
  sourceSystem = MARKREG
  sourceMatterId
  sourceMatterVersion / snapshot identity if available
  promotedBy
  promotedAt
  caseReason / operator note (optional)
  accessScope
  retrievalRef or exportBundleRef
  idempotencyKey
```

A later immutable export bundle may include or reference:

- matter metadata;
- events;
- communications;
- documents;
- fees;
- deadlines;
- outcomes.

## 12. Case Dossier lifecycle

Recommended initial lifecycle:

```text
CANDIDATE
-> COLLECTING
-> ASSEMBLED
-> REVIEW_REQUIRED
-> FINALIZED
```

Optional terminal/supporting states may include:

- `REJECTED` — selected matter is not suitable;
- `BLOCKED_SOURCE` — required source material is unavailable;
- `NEEDS_REDACTION` — privacy/access review is incomplete;
- `SUPERSEDED` — a later dossier version replaces an earlier one.

Avoid `PUBLISHED` unless external publication becomes an explicit separate product action. A finalized Knowledge case is not automatically public.

## 13. Privacy and first-party case data

Case information can contain customer, attorney-client, commercial, billing, and personal data.

Case architecture must therefore support:

- source-level access classification;
- workspace/tenant authorization where applicable;
- redaction before broader internal or external use;
- separation between original evidence and redacted derivatives;
- immutable provenance for redacted derivatives;
- no automatic public publication;
- no assumption that a case selected for Knowledge is shareable outside its authorized audience.

The strategic value of Case Knowledge does not override confidentiality duties.

## 14. Architecture guardrails

1. Do not add new generic AI provider transports inside Knowledge except temporary migration compatibility.
2. Do not add a second shared AI gateway; build on `@markorbit/ai` unless a concrete blocker is proven.
3. Do not build another full email stack inside Knowledge.
4. Do not move Web acquisition merely for symmetry.
5. Do not make Expert scoring a Knowledge feature.
6. Do not make Case lessons/recommendations a Knowledge feature.
7. Do not require duplicate manual entry of MarkReg matters.
8. Do not couple Case design to a guessed MarkReg repository.
9. Prefer stable, versioned cross-system contracts over database sharing.
10. Preserve source evidence before generating derived summaries.

## 15. Cross-repository acceptance rule

A cross-repository migration is complete only when:

- ownership is explicit;
- versioned contract exists;
- producer/consumer compatibility is tested;
- secrets do not cross into inappropriate storage;
- provenance survives the boundary;
- restart/idempotency behavior is defined;
- old duplicate path is either removed or explicitly time-bounded;
- the Knowledge consumer can prove the source record came from the shared capability / source system.

Architecture diagrams are not acceptance evidence.
