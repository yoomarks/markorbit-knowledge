# AI Distilled Knowledge Acquisition V1

Status: **ADK-00 through ADK-05 implemented; ADK-06 not started**

## Purpose

AI models are treated as external research lawyers that answer governed Knowledge assignments. Knowledge issues the assignment, records the exact provider response, extracts the assistant-authored Markdown, and preserves provenance. Knowledge does not grade the answer.

The durable product idea is not one provider integration. It is a provider-replaceable acquisition lane in which the long-lived assets are the assignment, instruction-set revision, raw response, submission evidence, distilled Markdown, versioned Assignment Graph and governed Assignment Candidates.

## Authority boundary

`AI response != verified knowledge != legal truth != Brain conclusion`.

Knowledge may record that DeepSeek, OpenAI, Kimi, Claude or Gemini produced a particular answer. Knowledge must not use this acquisition layer to decide which model is correct, compare legal opinions, resolve conflicts, infer legal truth, recommend an action or publish a user-facing legal conclusion.

Those downstream semantics belong to Brain/Core.

Every distilled artifact carries:

```text
sourceKind = SYNTHETIC_AI
legalTruthVerified = false
```

Every Assignment Graph carries:

```text
executionAuthorityGranted = false
legalTruthVerified = false
```

Every Assignment Candidate carries:

```text
status = PROPOSED
activationAuthorized = false
executionAuthorityGranted = false
legalTruthVerified = false
recursiveAutoExecution = false
```

A graph may describe governed question topology. A candidate may propose a future question. Neither object authorizes a provider call, scheduler action, graph mutation or recursive execution.

## V1 objects

### Knowledge Assignment

`AiKnowledgeAssignmentV1` is the governed question given to an AI provider. It binds jurisdiction, domain, topic, title, an immutable instruction-set id/revision, output language, exact rendered prompt and creation time.

The assignment, not the provider, is the durable knowledge-engineering asset. The same assignment may later be sent to multiple providers without changing its identity.

ADK-02 persists KnowledgeAssignments and immutable InstructionSet revisions. Revisions are sequential and cannot be rewritten after persistence.

### Research Submission

`AiResearchSubmissionV1` records one provider answer with provider/model, requested/completed timestamps, prompt SHA-256, exact raw provider response SHA-256, Markdown SHA-256/byte size and optional provider request id. Credentials are never part of the contract or stored submission.

### Distilled Knowledge Artifact

`AiDistilledKnowledgeArtifactV1` is the Markdown derivative of the provider response. It keeps content-addressed Markdown identity and links back to the raw response and prompt hashes.

The provider response is primary acquisition evidence; Markdown is a derivative knowledge artifact. ADK-03 sends the exact provider JSON through the existing authenticated Worker/lease RawArtifact lifecycle first. The Markdown derivative is ingested only after the raw provider artifact is durable, with `parentArtifactIds` linking it back to the raw response.

### Assignment Graph

`AiAssignmentGraphV1` is an immutable, versioned topology of already-persisted KnowledgeAssignments within one jurisdiction/domain scope. It contains roots, follow-up nodes, directed `DECOMPOSES`, `DEPENDS_ON` or `SUPPORTS` relationships, change reason/evidence refs and fixed no-execution/no-legal-truth boundaries.

ADK-04 persists graph snapshots, nodes and edges relationally with foreign-key linkage back to durable KnowledgeAssignments. Graph revisions are sequential, immutable, scope-consistent and acyclic.

### Assignment Candidate

`AiAssignmentCandidateV1` is an evidence-backed proposal for a possible future KnowledgeAssignment. It is not itself an Assignment and cannot be scheduled or executed.

A candidate binds:

- the exact Assignment Graph id and revision where the gap was observed;
- a parent Assignment already present in that graph revision;
- a suggested graph relation;
- jurisdiction/domain/topic/title;
- an existing immutable InstructionSet revision;
- language and proposed prompt;
- a discovery method;
- one or more evidence entries carrying reference, evidence class, SHA-256 identity and rationale;
- fixed `PROPOSED` / no-activation / no-execution boundaries.

Evidence classes are `OFFICIAL`, `PROFESSIONAL`, `INDUSTRY` and `SYNTHETIC_AI`. Evidence from an AI answer is therefore permitted as evidence that a question may be worth asking, but it never proves legal truth.

ADK-05 persists candidates immutably, rejects graph/parent/instruction scope drift, and deterministically deduplicates equivalent proposals. The persistence API intentionally has no activation or execution method. Turning an accepted candidate into a new KnowledgeAssignment and a new graph revision requires a separate governed decision.

## Provider runtime

ADK-01 introduces a provider-neutral `AiKnowledgeProviderAdapter` plus the first canary adapter, `DeepSeekKnowledgeAdapter`.

The DeepSeek adapter uses only `https://api.deepseek.com/chat/completions`, reads `DEEPSEEK_API_KEY` only from runtime environment, preserves exact returned JSON bytes, extracts non-empty assistant content as Markdown, bounds runtime/response size, classifies retryable provider failures, and never marks legal truth as verified.

A live provider request remains credential-gated. Generic CI validates deterministic transport and evidence boundaries without pretending a production credential was used.

## Current implementation boundary

ADK-00 through ADK-05 establish:

- authority contracts;
- provider-neutral runtime with DeepSeek canary;
- durable KnowledgeAssignments and immutable InstructionSet revisions;
- raw provider response and Markdown derivative RawArtifact lineage;
- immutable, versioned Assignment Graph persistence;
- evidence-backed, immutable Assignment Candidate proposals with no activation authority.

The implementation intentionally does **not** yet add:

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
6. **ADK-05 — implemented** — evidence-backed Assignment Candidate growth from official, professional, industry and AI evidence.
7. **ADK-06 — not started** — governed 3-topic × multi-provider production pilot.

Assignment growth may discover candidates automatically, but activation remains governed. AI-generated follow-up questions never recursively authorize their own execution.
