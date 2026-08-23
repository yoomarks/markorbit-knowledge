# AI Distilled Knowledge Acquisition V1

Status: **ADK-00 through ADK-04 implemented; ADK-05 / ADK-06 not started**

## Purpose

AI models are treated as external research lawyers that answer governed Knowledge assignments. Knowledge issues the assignment, records the exact provider response, extracts the assistant-authored Markdown, and preserves provenance. Knowledge does not grade the answer.

The durable product idea is not one provider integration. It is a provider-replaceable acquisition lane in which the long-lived assets are the assignment, instruction-set revision, raw response, submission evidence, distilled Markdown and versioned Assignment Graph.

## Authority boundary

`AI response != verified knowledge != legal truth != Brain conclusion`.

Knowledge may record that DeepSeek, OpenAI, Kimi, Claude or Gemini produced a particular answer. Knowledge must not use this acquisition layer to decide which model is correct, compare legal opinions, resolve conflicts, infer legal truth, recommend an action or publish a user-facing legal conclusion.

Those downstream semantics belong to Brain/Core.

Every distilled artifact therefore carries:

```text
sourceKind = SYNTHETIC_AI
legalTruthVerified = false
```

Every Assignment Graph also carries a fixed governance boundary:

```text
executionAuthorityGranted = false
legalTruthVerified = false
```

A graph may describe which governed questions are roots and how follow-up questions relate. It never authorizes a provider call, scheduler action or recursive execution.

## V1 objects

### Knowledge Assignment

`AiKnowledgeAssignmentV1` is the governed question given to an AI provider. It binds:

- jurisdiction;
- domain;
- topic;
- title;
- immutable instruction-set id and revision;
- output language;
- the exact rendered prompt;
- creation time.

The assignment, not the provider, is the durable knowledge-engineering asset. The same assignment may later be sent to multiple providers without changing its identity.

ADK-02 persists KnowledgeAssignments and immutable InstructionSet revisions. Revisions are sequential and cannot be rewritten after persistence.

### Research Submission

`AiResearchSubmissionV1` records one provider answer with:

- provider and returned model;
- requested/completed timestamps;
- prompt SHA-256;
- exact raw provider response SHA-256;
- Markdown SHA-256 and UTF-8 byte size;
- optional provider request id.

Credentials are never part of the contract or stored submission.

### Distilled Knowledge Artifact

`AiDistilledKnowledgeArtifactV1` is the Markdown derivative of the provider response. It keeps content-addressed Markdown identity and links back to the raw response and prompt hashes.

The provider response is primary acquisition evidence; Markdown is a derivative knowledge artifact. This mirrors the existing `HTML/JSON -> RawArtifact -> Markdown` Knowledge design rather than creating an AI-only truth store.

ADK-03 sends the exact provider JSON through the existing authenticated Worker/lease RawArtifact lifecycle first. The Markdown derivative is ingested through the same lifecycle only after the raw provider artifact is durable, with `parentArtifactIds` linking the Markdown artifact back to its raw response.

### Assignment Graph

`AiAssignmentGraphV1` is an immutable, versioned topology of already-persisted KnowledgeAssignments within one jurisdiction/domain scope.

A graph revision contains:

- one or more root assignments;
- follow-up assignments;
- directed `DECOMPOSES`, `DEPENDS_ON` or `SUPPORTS` relationships;
- a change reason and optional evidence refs;
- fixed `executionAuthorityGranted=false` and `legalTruthVerified=false` boundaries.

Graph revisions are sequential and immutable. All referenced assignments must already exist, every node must remain in the graph jurisdiction/domain, edges must reference graph nodes, and the resulting topology must be acyclic.

ADK-04 persists graph snapshots, nodes and edges relationally with foreign-key linkage back to durable KnowledgeAssignments. Graph mutation therefore requires a new revision rather than rewriting history.

## Provider runtime

ADK-01 introduces a provider-neutral `AiKnowledgeProviderAdapter` plus the first canary adapter, `DeepSeekKnowledgeAdapter`.

The DeepSeek adapter:

- uses only `https://api.deepseek.com/chat/completions`;
- reads `DEEPSEEK_API_KEY` only from the runtime environment;
- never includes credentials in the stored provider request body or output artifact;
- bounds runtime and response bytes;
- stores the exact returned JSON bytes;
- extracts non-empty assistant content as Markdown;
- classifies HTTP 429/5xx and transport failures as retryable;
- classifies contract/content/credential failures as deterministic;
- never marks legal truth as verified.

A live provider request remains credential-gated. Generic CI validates the deterministic transport and evidence boundaries without pretending that a production credential was used.

## Current implementation boundary

ADK-00 through ADK-04 now establish:

- the authority contract;
- provider-neutral runtime with a DeepSeek canary;
- durable KnowledgeAssignments and immutable InstructionSet revisions;
- exact raw provider response and Markdown derivative integration with RawArtifact lineage;
- immutable, versioned Assignment Graph persistence.

The implementation intentionally does **not** yet add:

- automatic assignment-candidate discovery;
- candidate activation;
- recursive follow-up execution;
- a production assignment scheduler;
- model comparison or answer scoring;
- legal-truth verification;
- Brain validation or Core user-facing conclusions;
- production multi-provider bulk execution.

## Planned sequence

1. **ADK-00 — implemented** — architecture and authority contract.
2. **ADK-01 — implemented** — provider-neutral runtime + DeepSeek canary.
3. **ADK-02 — implemented** — durable KnowledgeAssignment and immutable InstructionSet revisions.
4. **ADK-03 — implemented** — raw provider response + Markdown derivative integration with existing RawArtifact boundaries.
5. **ADK-04 — implemented** — immutable, versioned Assignment Graph.
6. **ADK-05 — not started** — evidence-backed Assignment Candidate growth from official, professional, industry and AI artifacts.
7. **ADK-06 — not started** — governed 3-topic × multi-provider production pilot.

Assignment growth may discover candidates automatically, but activation must remain governed. AI-generated follow-up questions must never recursively authorize their own execution.
