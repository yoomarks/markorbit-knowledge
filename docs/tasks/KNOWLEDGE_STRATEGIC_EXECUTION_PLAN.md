# MarkOrbit Knowledge — Strategic Execution Plan

> Status: **CANONICAL ENGINEERING TASK PLAN**
>
> Effective: 2026-08-25
>
> This file translates the four-pillar Knowledge strategy into executable engineering work. It is intentionally opinionated about sequence and ownership so future engineers can continue independently without losing the product boundary.

## 1. Program objective

Build MarkOrbit Knowledge into a durable four-pillar information foundation:

1. Web;
2. AI;
3. Expert;
4. Case.

At the same time, move the two clearly shared transport capabilities out of Knowledge:

- AI invocation/runtime -> `yoomarks/markorbit` shared AI Capability;
- email send/receive/sync -> `yoomarks/markorbit` shared Communication Capability.

Do **not** migrate Web acquisition in the current program.

Do **not** add evaluation, ranking, deep interpretation, cross-case inference, prediction, recommendation, or legal-truth decisions to Knowledge.

## 2. Program operating rule — “抓大放小”

Engineering should optimize for durable end-to-end information assets, not the number of tickets closed.

Every proposed task must map to at least one of:

- Web source strength;
- AI source strength;
- Expert source strength;
- Case source strength;
- AI Capability migration;
- Communication Capability migration;
- provenance / durability / retrieval / interoperability required by those tracks.

If a task does not materially advance one of those outcomes, defer it unless it fixes a production defect or security/governance risk.

### Prefer

- complete vertical slices;
- real source data;
- stable interfaces;
- idempotent handoffs;
- evidence preservation;
- migration parity tests;
- operational simplicity;
- reuse of proven ADK/RawArtifact primitives.

### Avoid

- generic frameworks without a current consumer;
- adding providers merely to increase provider count;
- universal schemas before real examples exist;
- duplicate MarkReg case entry;
- a second AI gateway;
- a second mail platform;
- moving Web for symmetry;
- Knowledge-side scoring/interpretation disguised as metadata;
- large rewrites when a compatibility bridge is safer.

## 3. Current verified baseline

At the 2026-08-25 planning checkpoint:

- `markorbit-knowledge` main includes ADK-11 through PR #441;
- grounded SourcePack, rendering, citation structure, persisted PREPARED evidence, safe queue admission, and explicit provider-authorization contracts exist;
- ADK-07 fail-closed retry/concurrency hardening exists;
- issue #405 remains open for the real ADK-06 3×2 paid-provider acceptance;
- issue #429 remains open for repository ruleset/main protection, protected live secrets/environment, and durable encrypted evidence retention;
- `markorbit-knowledge` main remains unprotected at the verified checkpoint;
- `yoomarks/markorbit` already has a thin `@markorbit/ai` package suitable as the shared AI Capability starting point;
- no accessible MarkReg repository/module was located by name in the current GitHub installation during this audit.

#405 and #429 are operational/governance gates. They remain important, but they are no longer the product roadmap around which Knowledge should continuously add architecture.

## 4. Program workstreams

The program is divided into six workstreams:

- **KS-00 — Strategic reset and canonical documentation**
- **K-CAP-AI — AI Capability extraction**
- **K-CAP-COMM — Communication Capability foundation**
- **K-EXP — Expert Knowledge**
- **K-CASE — Case Knowledge**
- **K-FED — Four-pillar federation and downstream consumption**

Web acquisition continues as maintenance/evolution work under the existing Knowledge architecture unless a concrete gap blocks a pillar.

---

# KS-00 — Strategic reset and canonical documentation

## KS-001 — Establish canonical four-pillar direction

**Repository:** `yoomarks/markorbit-knowledge`

**Deliverables:**

- `KNOWLEDGE_LONG_TERM_STRATEGY.md`;
- `KNOWLEDGE_CAPABILITY_SOURCE_BOUNDARIES.md`;
- `CASE_DOSSIER_AND_EXPERT_SOURCE_ARCHITECTURE.md`;
- this execution plan;
- current-state reconciliation;
- supersession notices on stale strategic/task documents.

**Acceptance:**

- future engineer has one unambiguous source of truth;
- four source pillars are explicit;
- AI/email migration and Web non-migration are explicit;
- Knowledge/Brain boundary is explicit;
- Case-from-MarkReg principle is explicit.

**Status:** this PR.

---

# K-CAP-AI — Shared AI Capability migration

## Goal

Move generic AI invocation capability into `yoomarks/markorbit` while keeping Knowledge source semantics in `markorbit-knowledge`.

Do not weaken the safety properties learned from ADK.

## K-CAP-AI-001 — Audit and freeze the migration surface

**Primary repository:** `yoomarks/markorbit`

**Read-only source repository:** `yoomarks/markorbit-knowledge`

**Tasks:**

1. inventory current Knowledge provider adapters and shared-vs-domain-specific logic;
2. inventory `@markorbit/ai` package and existing main-repo consumers;
3. classify each current ADK concern as:
   - shared transport capability;
   - Knowledge source semantics;
   - live-acceptance/governance-only;
4. freeze a minimal Capability contract before moving code.

**Required output:** cross-repo migration matrix.

**Acceptance:** every moved responsibility has an explicit target owner; no “move all ADK to Core” ambiguity.

## K-CAP-AI-002 — Define AI invocation V1 contract

**Repository:** `yoomarks/markorbit`

**Target:** `packages/ai`

Minimum generic request/response concepts should cover only proven needs, such as:

- provider/model;
- structured messages/input;
- provider options required by current consumers;
- request/correlation ID;
- response body/envelope;
- provider request ID when available;
- usage metadata when available;
- delivery outcome;
- retry classification;
- delivery uncertainty;
- generic error identity;
- timing.

**Non-goals:** KnowledgeAssignment, SourcePack, Case, Expert, legal truth, Brain prompt semantics.

**Acceptance:** Knowledge can map its current provider request into the generic contract without losing evidence identity.

## K-CAP-AI-003 — Migrate first real provider

**Repository:** `yoomarks/markorbit`

Implement one current production provider behind `@markorbit/ai`.

**Acceptance:**

- deterministic unit tests;
- credential isolation;
- exact response available to consumer;
- timeout/network uncertainty represented explicitly;
- no automatic replay of ambiguous paid delivery at capability layer;
- usage/cost fields optional rather than invented when provider does not return them.

## K-CAP-AI-004 — Knowledge compatibility bridge

**Repository:** `yoomarks/markorbit-knowledge`

Add a Knowledge provider adapter/bridge that invokes shared `@markorbit/ai` capability while preserving:

- Knowledge assignment identity;
- source binding;
- execution identity;
- RawArtifact/evidence lifecycle;
- CAS/recovery rules;
- exact provider response ingestion;
- current no-legal-truth boundary.

**Acceptance:** existing deterministic Knowledge tests pass through the bridge.

## K-CAP-AI-005 — Migrate second provider and prove parity

Migrate the other current provider through the shared capability.

**Acceptance:** OpenAI + DeepSeek Knowledge flows no longer require independent generic transport implementations inside Knowledge.

## K-CAP-AI-006 — Remove duplicated generic transport

Only after parity is proven:

- remove or deprecate duplicate provider transports from Knowledge;
- retain Knowledge-specific acquisition adapters and evidence mapping;
- update architecture docs.

**Hard rule:** no big-bang deletion before bridge parity.

## K-CAP-AI-007 — Reconcile #405 live acceptance

Do not reinterpret historical #405 criteria casually after migration.

Before executing #405:

- confirm the accepted runtime path;
- confirm exact-SHA policy;
- confirm #429 governance requirements;
- update acceptance documentation only if migration genuinely changes the runtime path;
- preserve the original evidence goals.

**Do not execute paid acceptance merely to unblock this migration plan.**

---

# K-CAP-COMM — Shared Communication Capability

## Goal

Provide one reusable email communication path for MarkOrbit modules. Knowledge uses it to ask experts; it does not own the mail platform.

## K-CAP-COMM-001 — Main-repo communication capability ADR

**Repository:** `yoomarks/markorbit`

Determine the smallest package/service placement consistent with main-repo architecture.

Do not pre-decide a giant omni-channel messaging platform.

Initial scope: email.

Define:

- account binding;
- send request;
- inbound sync;
- message identity;
- thread identity;
- attachment identity/reference;
- delivery state;
- sync cursor;
- provider-specific metadata;
- secrets boundary.

**Acceptance:** Core/MarkReg/Knowledge can all theoretically consume the contract without Knowledge-specific fields.

## K-CAP-COMM-002 — Preserve lessons from legacy Knowledge email ingestion

**Repositories:** both

Audit the existing Knowledge IMAP worker for reusable safety behavior:

- TLS;
- read-only fetch when appropriate;
- UID/UIDVALIDITY;
- cursor advancement;
- restart/idempotency;
- hash verification;
- secret separation;
- attachment/message evidence semantics.

Produce a migration checklist; do not blindly copy implementation details.

## K-CAP-COMM-003 — Outbound email V1

**Repository:** `yoomarks/markorbit`

Implement the minimal send path needed by Expert Q&A.

Requirements:

- account binding by reference;
- stable send request ID;
- recipient/subject/body;
- optional attachments;
- no credential leakage;
- send/delivery state;
- returned provider/message/thread identity when available;
- idempotency to prevent duplicate sends on retry.

## K-CAP-COMM-004 — Inbound sync and thread correlation V1

Implement enough inbound synchronization to correlate a professional reply to the sent Expert question.

Acceptance:

- stable message identity;
- stable thread/correlation mechanism;
- reply capture;
- attachment refs;
- restart-safe cursor;
- no duplicate downstream message on replay.

## K-CAP-COMM-005 — Knowledge bridge and legacy path retirement plan

**Repository:** `yoomarks/markorbit-knowledge`

Knowledge must consume the Communication Capability for new Expert workflows.

Historical email ingestion code may remain temporarily for compatibility, but no new strategic email transport features should be added there.

**Acceptance:** migration/deprecation date or condition is documented.

---

# K-EXP — Expert Knowledge

## Goal

Create the first real Expert information-source pipeline using shared Communication Capability.

## K-EXP-001 — Expert source contracts

**Repository:** `yoomarks/markorbit-knowledge`

Implement versioned contracts for:

- `ExpertQuestionTaskV1`;
- `ExpertSourceRecordV1`;
- communication correlation refs;
- attachment/source refs;
- state machine;
- access classification.

**Must not contain:** expert score, authority score, recommended expert, truth score.

## K-EXP-002 — Expert question persistence and idempotency

Persist tasks and responses durably.

Requirements:

- exact question frozen once sent;
- idempotent send request reference;
- one reply may have multiple messages/follow-ups;
- raw source evidence preserved/referenced;
- normalized derivative separate from original;
- restart-safe correlation.

## K-EXP-003 — Expert Q&A operator flow

Build the smallest operator flow that can:

1. select/identify expert;
2. write or choose a question;
3. send through Communication Capability;
4. show waiting/replied/captured state;
5. inspect reply and attachments;
6. close or send a follow-up.

Do not build a full CRM.

## K-EXP-004 — First live Expert vertical slice

Use one legitimate real professional question in one jurisdiction.

Acceptance evidence:

- outgoing question;
- Capability send identity;
- incoming reply;
- correlated thread;
- captured attachments if any;
- immutable Knowledge source record;
- no duplicate capture after replay;
- no expert ranking.

## K-EXP-005 — Expert source retrieval

Expose Expert information through Knowledge retrieval with filters such as:

- jurisdiction;
- topic;
- expert/organization ref;
- date;
- related case/source refs.

Return provenance alongside content.

---

# K-CASE — Real Case Knowledge

## Goal

Create complete Case Dossiers from real MarkReg matters without duplicate manual re-entry.

This is the highest-value long-term accumulation track.

## K-CASE-000 — Locate and freeze the real MarkReg integration boundary

**Blocking discovery task.**

The current GitHub audit did not find a repository/module named MarkReg.

Before coding the producer, determine:

- where MarkReg runs;
- actual repository/service if any;
- owner;
- canonical matter ID;
- available API/event/export methods;
- authorization model;
- document storage/ref model;
- email/correspondence model;
- status/event history model.

**Acceptance:** signed-off integration facts. Do not guess.

## K-CASE-001 — Case Candidate V1 contract

**Knowledge side contract can begin once K-CASE-000 identifies enough producer facts.**

Minimum identity:

- candidate ID;
- source system;
- source matter ID;
- source matter version/snapshot where available;
- promoted by;
- promoted at;
- optional operator case-value note;
- access scope;
- retrieval/export reference;
- idempotency key.

**Acceptance:** same source matter promotion is deterministic/idempotent.

## K-CASE-002 — MarkReg one-click promotion UX

**Repository/system:** actual MarkReg location from K-CASE-000.

Add an operator action such as:

> Send to Knowledge Case

The action must:

- create/reuse candidate;
- not duplicate case data manually;
- expose resulting Knowledge candidate/dossier state when feasible;
- enforce authorization;
- avoid implying public publication.

## K-CASE-003 — Knowledge Case Candidate intake

**Repository:** `markorbit-knowledge`

Build intake that:

- validates source identity;
- persists candidate;
- is idempotent;
- records source snapshot/export refs;
- starts collection;
- handles unavailable source gracefully.

## K-CASE-004 — Case evidence collection adapters

Collect or reference authorized matter material:

- metadata;
- status history/events;
- documents;
- correspondence;
- fees/payment evidence where permitted;
- deadlines;
- final outcome.

Reuse existing RawArtifact/provenance primitives where appropriate.

Do not create a parallel evidence store unless a proven requirement exists.

## K-CASE-005 — Case Dossier V1 schema

Implement the aggregate defined in `CASE_DOSSIER_AND_EXPERT_SOURCE_ARCHITECTURE.md`.

Required sections:

- identity/background;
- process narrative;
- timeline;
- communications;
- documents;
- money;
- time;
- outcome;
- provenance/access/privacy;
- dossier version/completeness.

**No lessons/recommendations section.**

## K-CASE-006 — Objective dossier assembly

Build deterministic assembly first.

AI-assisted drafting may be added through shared AI Capability only when:

- every material statement can retain source references;
- the AI output is treated as a derivative;
- original evidence remains authoritative as source material;
- no interpretive “best practice” is introduced.

## K-CASE-007 — Privacy/redaction workflow

Before broader use, implement:

- access classification;
- redaction derivatives;
- original-vs-redacted lineage;
- reviewer state;
- no automatic public publish.

## K-CASE-008 — First real end-to-end Case Dossier

Choose one completed real matter with strong evidence.

Preferred candidate types:

- US OA;
- US Section 8;
- Japanese assignment.

Acceptance:

1. operator selects real MarkReg matter once;
2. candidate is created/reused;
3. Knowledge pulls/receives evidence;
4. dossier is assembled;
5. timeline and material narrative are source-linked;
6. privacy review completes;
7. final dossier is retrievable;
8. no duplicate matter entry was required;
9. no Brain-style lesson or recommendation was generated.

## K-CASE-009 — Case refresh/versioning

Support later source changes without rewriting history.

Requirements:

- immutable or auditable prior dossier version;
- source snapshot/version relationship;
- refresh/reassembly;
- supersession state;
- deterministic source-matter linkage.

## K-CASE-010 — Scale by matter type, not universal abstraction

After the first slice proves the model, add the next real matter types incrementally.

Each expansion must be justified by actual case volume/value.

Do not create a universal global IP case ontology before enough real dossiers reveal the common structure.

---

# K-FED — Four-pillar federation

## Goal

Make Web, AI, Expert, and Case discoverable as one Knowledge information fabric without flattening their source identities.

## K-FED-001 — Common source descriptor

Define the minimum metadata common to all four pillars, for example:

- source family;
- source identity;
- acquired/observed time;
- jurisdiction/topic tags where available;
- provenance root;
- access classification;
- raw/derived refs;
- related source refs.

Do not force every source family into one giant identical schema.

## K-FED-002 — Unified retrieval surface

Allow downstream consumers to retrieve across source families while preserving source type.

Examples:

- Web only;
- AI only;
- Expert only;
- Case only;
- all sources related to Japanese trademark assignment;
- all information related to a specific case/matter ref.

## K-FED-003 — Cross-source relationships

Permit explicit relationships such as:

- Case references Web source;
- Case triggered Expert question;
- Expert answer relates to Case;
- AI source task was created for a topic also covered by Web/Expert sources.

Relationships are observations/links, not truth judgments.

## K-FED-004 — Brain consumption contract

Define a downstream payload that gives Brain:

- content;
- source family;
- provenance;
- timestamps/version;
- access controls;
- relations;
- enough source context to reason appropriately.

Knowledge must not precompute the Brain conclusion.

---

# 5. Recommended execution sequence

The workstreams are not strictly serial, but dependency order matters.

## Stage A — canonical reset

1. KS-001.
2. Freeze current architecture direction.
3. Stop opening new Knowledge-local AI/mail transport features unless required for migration safety.

## Stage B — shared capability foundations

4. K-CAP-AI-001..004.
5. K-CAP-COMM-001..004.

AI and Communication can proceed in parallel if separate engineers are available.

## Stage C — first new information pillar

6. K-EXP-001..004 once Communication has an end-to-end send/reply slice.

Expert provides a smaller and faster proving ground for the new Capability boundary.

## Stage D — Case foundation, started early

7. K-CASE-000 should start immediately because MarkReg location/integration discovery can block later work.
8. K-CASE-001 and K-CASE-005 can be designed from verified integration facts and one real matter.
9. K-CASE-002..008 form the first real Case vertical slice.

Case should not wait for every Expert feature to finish.

## Stage E — federation

10. K-FED work begins only after at least three source families have real persisted examples, preferably all four.

Do not design federation solely from abstract schemas.

---

# 6. Current stop/go decisions

| Topic | Decision |
| --- | --- |
| Add more AI providers inside Knowledge | STOP unless required by an approved source need |
| Build shared AI Capability in main repo | GO |
| Build shared Communication/email Capability | GO |
| Move Web crawler to Capability | STOP for now |
| Build Expert source model | GO after/with Communication V1 |
| Build Case Dossier model | GO |
| Build manual “new Case” form as primary entry | STOP |
| Build MarkReg one-click Case Candidate promotion | GO after K-CASE-000 |
| Build Knowledge source/expert/case scoring | STOP |
| Build Brain-style recommendations in Knowledge | STOP |
| Complete #429 governance | GO when repo-admin capability is available |
| Execute #405 paid live acceptance | WAIT for actual gates and explicit operational readiness |
| Expand ADK architecture around #405 indefinitely | STOP |

---

# 7. Definition of Done by strategic milestone

## Milestone M-K1 — Capability boundary proven

Done when:

- at least one real Knowledge AI acquisition uses shared main-repo AI Capability end to end;
- at least one real send/reply flow uses shared Communication Capability;
- Knowledge contains no newly duplicated provider/mail transport for those flows;
- provenance survives both boundaries.

## Milestone M-K2 — Expert source live

Done when:

- one real expert question/reply exists as a durable ExpertSourceRecord;
- thread and attachments are auditable;
- replay is idempotent;
- no ranking/truth score exists.

## Milestone M-K3 — First real Case Dossier

Done when:

- a real MarkReg matter is one-click selected;
- no duplicate manual case recreation is required;
- material evidence is collected/referenced;
- reviewable dossier is assembled;
- privacy/redaction review exists;
- final dossier is versioned and retrievable.

## Milestone M-K4 — Four-pillar Knowledge fabric

Done when:

- Web, AI, Expert, and Case all have production-grade source records;
- common retrieval preserves source family/provenance;
- Brain can consume all four without Knowledge making the conclusion for it.

---

# 8. Engineering review checklist for every future PR

Before merging a material Knowledge PR, reviewers should ask:

1. Which four-pillar objective does this serve?
2. Is this actually a shared Capability and therefore in the wrong repo?
3. Does it introduce evaluation/reasoning that belongs to Brain?
4. Does it preserve original evidence and provenance?
5. Is idempotency/restart behavior defined?
6. Does it create duplicate manual work?
7. If Case-related, does it originate from real MarkReg data?
8. If AI/email-related, is generic transport being added back into Knowledge?
9. Is the scope based on a real vertical slice or speculative generalization?
10. Will this still matter after the next provider/model/vendor changes?

If the answers reveal boundary drift, fix the architecture before adding more code.

# 9. Ownership handoff summary

### `yoomarks/markorbit`

Build and own:

- shared AI Capability;
- shared Communication Capability;
- versioned generic transport contracts;
- shared transport-level secrets, delivery, usage, and provider integrations.

### `yoomarks/markorbit-knowledge`

Build and own:

- Web source system;
- AI source tasks/records using shared AI Capability;
- Expert source tasks/records using Communication Capability;
- Case Candidate intake and Case Dossiers sourced from MarkReg;
- evidence/provenance/retrieval/federation;
- source-family relationships.

### MarkReg

Build and own:

- operational matter truth;
- one-click case-value selection/promotion;
- stable matter/export/reference contract.

Actual repository/system location must be established by K-CASE-000 before implementation ownership is assigned to a codebase.

### Brain

Owns:

- understanding;
- comparison;
- evaluation;
- inference;
- cross-case generalization;
- prediction;
- recommendation;
- decision support.

# 10. Final directive to future engineers

Do not make Knowledge “smarter” by making it more opinionated.

Make Knowledge **richer, more complete, more real, more traceable, and easier to retrieve**.

The long-term competitive asset is the accumulated information world—especially complete real Case Dossiers—not the number of internal frameworks or AI providers.