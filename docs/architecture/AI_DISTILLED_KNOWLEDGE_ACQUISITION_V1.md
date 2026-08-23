# AI Distilled Knowledge Acquisition V1

Status: **ADK-00 / ADK-01 scope freeze**

## Purpose

AI models are treated as external research lawyers that answer governed Knowledge assignments. Knowledge issues the assignment, records the exact provider response, extracts the assistant-authored Markdown, and preserves provenance. Knowledge does not grade the answer.

The durable product idea is not one provider integration. It is a provider-replaceable acquisition lane in which the long-lived assets are the assignment, instruction-set revision, raw response, submission evidence and distilled Markdown.

## Authority boundary

`AI response != verified knowledge != legal truth != Brain conclusion`.

Knowledge may record that DeepSeek, OpenAI, Kimi, Claude or Gemini produced a particular answer. Knowledge must not use this acquisition layer to decide which model is correct, compare legal opinions, resolve conflicts, infer legal truth, recommend an action or publish a user-facing legal conclusion.

Those downstream semantics belong to Brain/Core.

Every distilled artifact therefore carries:

```text
sourceKind = SYNTHETIC_AI
legalTruthVerified = false
```

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

## What ADK-01 does not do

ADK-01 intentionally does not yet add:

- database persistence for assignments or submissions;
- a scheduler/queue for assignments;
- a growing Assignment Graph;
- instruction-set revision persistence;
- automatic assignment-candidate discovery;
- model comparison or answer scoring;
- Brain validation;
- production bulk execution;
- automatic calls when a credential is absent.

These remain later ADK work packages. The initial implementation proves the provider-neutral acquisition contract and the raw-response-to-Markdown integrity boundary without reopening the frozen Source/RawArtifact architecture.

## Planned sequence

1. **ADK-00** — architecture and authority contract.
2. **ADK-01** — provider-neutral runtime + DeepSeek canary.
3. **ADK-02** — durable KnowledgeAssignment and immutable InstructionSet revisions.
4. **ADK-03** — durable raw submission + Markdown artifact integration with existing RawArtifact/conversion boundaries.
5. **ADK-04** — versioned Assignment Graph.
6. **ADK-05** — evidence-backed Assignment Candidate growth from official, professional, industry and AI artifacts.
7. **ADK-06** — governed 3-topic × multi-provider production pilot.

Assignment growth may discover candidates automatically, but activation must remain governed. AI-generated follow-up questions must never recursively authorize their own execution.
