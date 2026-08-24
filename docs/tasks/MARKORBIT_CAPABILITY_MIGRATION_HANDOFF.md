# MarkOrbit Main Repository — Capability Migration Handoff

> From: `yoomarks/markorbit-knowledge`
>
> To: `yoomarks/markorbit`
>
> Scope: shared AI Capability + shared Communication/email Capability
>
> Status: **READY FOR MAIN-REPO PLANNING/IMPLEMENTATION**

## 1. Purpose

Knowledge has proven production-grade patterns for AI acquisition and historical email ingestion, but AI invocation and email transport are not Knowledge-exclusive capabilities.

This handoff asks the MarkOrbit main-repository engineer to establish two shared capabilities while preserving Knowledge provenance and safety semantics.

This is not a request to move the entire Knowledge domain into `markorbit`.

## 2. Capability A — AI

### Existing target

The main repository already contains:

```text
packages/ai
  package name: @markorbit/ai
  description: Model gateway and structured invocation abstractions.
```

Its current source implementation is minimal. Use it as the preferred shared Capability target unless a concrete architectural blocker is demonstrated.

Do not create a second competing AI gateway by default.

## 3. AI ownership requested from main repo

Main `@markorbit/ai` should progressively own generic concerns:

- provider/model registry;
- provider SDK/HTTP integration;
- provider credential binding;
- structured invocation request;
- generic response envelope;
- provider request identifiers when available;
- timeout/network/delivery outcome representation;
- explicit retry eligibility / delivery uncertainty semantics;
- usage/token metadata where available;
- cost accounting primitives where available;
- generic invocation audit/correlation identity.

### Must remain outside generic AI Capability

- KnowledgeAssignment;
- SourcePack;
- AI Source record;
- Knowledge evidence/promotion semantics;
- Brain reasoning semantics;
- legal-truth decisions;
- provider ranking;
- client filing/action authority.

## 4. AI safety invariants imported from Knowledge experience

The shared Capability must not regress these learned rules:

1. paid provider timeout/network uncertainty is not automatically safe to replay;
2. unknown delivery state must be representable explicitly;
3. credentials are runtime secrets, not persisted domain data;
4. exact provider output must remain available to authorized consumers that need evidence preservation;
5. request/response identity must be auditable;
6. provider result does not imply legal truth;
7. retry classification must not be guessed from arbitrary exceptions.

## 5. AI implementation sequence

### MO-CAP-AI-001 — Audit

Read-only audit of:

- `markorbit/packages/ai`;
- current Core/Brain/Lite consumers if any;
- Knowledge DeepSeek/OpenAI adapters and ADK runtime;
- Knowledge error/delivery/retry contracts.

Deliver a responsibility map before moving code.

### MO-CAP-AI-002 — Invocation contract V1

Define the smallest shared contract that current consumers actually need.

Acceptance:

- provider/model selection;
- input/messages;
- correlation ID;
- output envelope;
- usage optional fields;
- delivery outcome;
- uncertainty/retry classification;
- typed errors.

### MO-CAP-AI-003 — First provider

Implement one current provider with tests and secret isolation.

### MO-CAP-AI-004 — Knowledge bridge acceptance

Coordinate with Knowledge so its adapter calls `@markorbit/ai` and still preserves exact source/evidence semantics.

### MO-CAP-AI-005 — Second provider

Migrate the remaining current provider and prove parity.

### MO-CAP-AI-006 — Duplicate transport retirement

Only after Knowledge parity, remove/deprecate generic duplicate transports from Knowledge.

## 6. Capability B — Communication/email

### Current state

No dedicated shared Communication/email package was identified in the main-repository package list during the 2026-08-25 audit.

Knowledge has historical IMAP production ingestion work, but that is no longer the desired owner for future generic mail transport.

The main repo should choose the package/service placement consistent with its architecture; do not assume a package name before that review.

## 7. Communication ownership requested from main repo

Initial shared email capability should own:

- account binding / provider config;
- credential reference handling;
- outbound send;
- inbound sync;
- message identity;
- thread/correlation identity;
- participants/addresses;
- attachments;
- delivery/send state;
- mailbox/sync cursor;
- provider-specific message/thread IDs;
- restart/idempotency behavior;
- generic audit metadata.

Initial scope is **email**, not every possible communication channel.

## 8. Communication safety lessons from Knowledge

The historical Knowledge email ingestion work should be audited for reusable invariants:

- TLS verification;
- read-only fetch semantics where appropriate;
- IMAP UID/UIDVALIDITY correctness;
- cursor only advances after durable downstream completion;
- restart/replay does not duplicate messages;
- same-identity changed content is detected;
- message hashes can be verified;
- mailbox secrets remain outside domain artifacts.

These are lessons, not a requirement to copy the old worker architecture.

## 9. Communication implementation sequence

### MO-CAP-COMM-001 — ADR and contract V1

Identify package/service placement and define:

- SendEmailRequest;
- SendEmailResult;
- MessageRef;
- ThreadRef;
- AttachmentRef;
- inbound event/sync result;
- delivery/sync states;
- account binding.

### MO-CAP-COMM-002 — Outbound email

Implement minimal outbound send for the first Knowledge Expert Q&A consumer.

Acceptance:

- stable idempotency key;
- no duplicate send on retry;
- returned message/thread identity;
- attachment support sufficient for first consumer;
- secrets isolated.

### MO-CAP-COMM-003 — Inbound reply correlation

Implement enough inbound sync to capture a reply to a known outbound thread.

Acceptance:

- stable message identity;
- thread correlation;
- attachment refs;
- restart-safe cursor;
- no duplicate downstream messages.

### MO-CAP-COMM-004 — Knowledge Expert integration

Coordinate with Knowledge `K-EXP` tasks so one real expert question can be sent and its answer captured without Knowledge owning mail transport.

### MO-CAP-COMM-005 — Broader consumer validation

After Expert proves the path, validate whether Core/MarkReg require additional contract fields. Expand from real needs rather than speculative CRM scope.

## 10. What main repo is NOT being asked to take now

Do not migrate from Knowledge in this phase:

- Web crawler/acquisition;
- SourceDefinition domain semantics;
- Expert question/source models;
- Case Dossier;
- Case Candidate;
- Knowledge RawArtifact system as a whole;
- Knowledge retrieval/indexing;
- ADK assignment libraries;
- Knowledge-specific orchestration;
- source evaluation or legal truth.

## 11. Cross-repo interface requirement

Both capabilities must expose stable interfaces that allow Knowledge to preserve provenance without sharing databases.

For each invocation/message crossing the boundary, the consumer should receive enough stable identity to record:

- which capability request occurred;
- which provider/account performed it;
- when it occurred;
- provider/native identity where available;
- delivery state;
- output/message/artifact reference;
- replay/idempotency identity.

Secrets must not cross back as data.

## 12. Compatibility policy

Migration should use a strangler/bridge approach:

```text
Old Knowledge transport
        │
        ├── compatibility period
        ▼
Shared Capability
        │
        ▼
Knowledge source/evidence mapping
```

Do not delete the old path merely because a new contract exists. Delete/deprecate only after end-to-end parity is proven on current consumers.

## 13. Governance relationship

Knowledge issues #405 and #429 remain separate:

- #405 proves a specific historical live AI acquisition acceptance;
- #429 addresses repository/governance/live-secret/evidence controls.

Capability migration must not silently declare either issue complete.

If the runtime path for #405 changes materially before execution, coordinate acceptance documentation rather than bypassing the original evidence requirements.

## 14. Main-repo completion definition

The Capability migration phase is accepted only when:

### AI

- Knowledge can execute a real supported AI acquisition through shared `@markorbit/ai`;
- evidence/provenance survives;
- ambiguous delivery remains fail-closed;
- duplicate generic Knowledge provider transport has a defined retirement path.

### Communication

- Knowledge can send one real Expert question through shared Communication;
- the real reply is correlated and returned/referenced;
- attachments are supported for the vertical slice;
- replay does not duplicate outbound or inbound messages;
- Knowledge stores the Expert source, not mailbox credentials/transport logic.

## 15. Coordination rule

Main-repo engineers should treat `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md` in `markorbit-knowledge` as the source-side dependency plan.

Do not extend scope into Web Capability migration or Brain reasoning during this capability handoff without a new explicit architecture decision.