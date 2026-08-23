# AI Distilled Knowledge Acquisition V1

Status: **ADK-00 through ADK-08 implemented; ADK-07 durable production queue closed; ADK-08 initial US Trademark Assignment Library established**

## Purpose

AI models are treated as external research lawyers that answer governed Knowledge assignments. Knowledge issues the assignment, records the exact provider response, extracts the assistant-authored Markdown, and preserves provenance. Knowledge does not grade the answer.

The durable product idea is not one provider integration. It is a provider-replaceable acquisition lane in which the long-lived assets are the assignment, instruction-set revision, raw response, submission evidence, distilled Markdown, versioned Assignment Graph, governed Assignment Candidates, durable production execution evidence and reusable Assignment Libraries.

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

Every Assignment Library carries:

```text
answerContentStored = false
executionAuthorityGranted = false
legalTruthVerified = false
candidateAutoActivation = false
```

Production execution remains separately governed. A library entry never grants execution authority. ADK-07 queue materialization and workers still require the existing governed production-pilot and execution boundaries.

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

A candidate binds the exact graph revision and parent Assignment where the gap was observed, a suggested graph relation, scope/topic/title, an immutable InstructionSet revision, language/proposed prompt, discovery method, and one or more evidence entries carrying reference, evidence class, SHA-256 identity and rationale.

Evidence classes are `OFFICIAL`, `PROFESSIONAL`, `INDUSTRY` and `SYNTHETIC_AI`. Evidence from an AI answer may show that a question is worth asking, but it never proves legal truth.

ADK-05 persists candidates immutably, rejects graph/parent/instruction scope drift, and deterministically deduplicates equivalent proposals. The persistence API intentionally has no activation or execution method.

### Production Pilot

`AiProductionPilotPlanV1` freezes exactly three governed Assignments, at least two providers, an approval reference and explicit authorization for live provider calls. The plan permanently prohibits provider-quality comparison, legal-truth verification and candidate auto-activation.

`AiProductionPilotRunV1` records one receipt for every Assignment/provider cell. A cell is one of:

- `EXECUTED` — a real injected provider adapter returned an acquisition;
- `BLOCKED_ADAPTER` — no real adapter was available for that provider;
- `BLOCKED_CREDENTIAL` — the real adapter refused to execute because its runtime credential was missing;
- `FAILED` — the adapter attempted execution but returned a governed acquisition error.

ADK-06 supplies the provider-neutral matrix runner and deterministic tests for full execution, missing-adapter and missing-credential paths. The runner never creates a provider ranking, legal-truth conclusion or candidate activation.

### Durable AI Knowledge Job

ADK-07 turns governed Assignment/provider cells into durable production jobs. The queue provides deterministic execution identity, atomic claim semantics, retry boundaries, stale-claim recovery, credential blocking, terminal failures, `BLOCKED_RECOVERY` quarantine for uncertain work, CAS recovery and operator recovery commands.

Provider success followed by Artifact persistence uncertainty is never treated as safely replayable provider work. Raw provider response and Markdown lineage remain the durable completion evidence.

### Assignment Library

`AiAssignmentLibraryV1` is an immutable, versioned proposition library over already-persisted KnowledgeAssignments. It organizes reusable questions by jurisdiction, domain and workflow without storing provider answers or changing Assignment identity.

ADK-08 introduces durable library persistence and the initial `kal_us_trademark_core@1` library backed by `kis_us_trademark_research_core@1`. Its first twelve US Trademark workflows are Filing, Examination, Office Action, Section 8, Section 9, Section 15, Section 71, Specimen, Assignment, Opposition, Cancellation and TTAB.

Library revisions are sequential and immutable. Entries foreign-key to durable Assignments, reject jurisdiction/domain scope drift, and can be resolved by workflow. Australia and Canada are planned jurisdiction expansions and are not represented as implemented until concrete governed libraries exist.

## Provider runtime

ADK-01 introduces a provider-neutral `AiKnowledgeProviderAdapter` plus the first canary adapter, `DeepSeekKnowledgeAdapter`.

The DeepSeek adapter uses only `https://api.deepseek.com/chat/completions`, reads `DEEPSEEK_API_KEY` only from runtime environment, preserves exact returned JSON bytes, extracts non-empty assistant content as Markdown, bounds runtime/response size, classifies retryable provider failures, and never marks legal truth as verified.

A live provider request remains credential-gated. Generic CI validates deterministic transport and evidence boundaries without pretending a production credential was used.

## Current implementation boundary

ADK-00 through ADK-08 now establish:

- authority contracts;
- provider-neutral runtime with DeepSeek canary;
- durable KnowledgeAssignments and immutable InstructionSet revisions;
- raw provider response and Markdown derivative RawArtifact lineage;
- immutable, versioned Assignment Graph persistence;
- evidence-backed Assignment Candidate proposals with no activation authority;
- governed production-pilot control surface and receipts;
- durable production queue execution with safe retry/recovery and uncertainty quarantine;
- immutable Assignment Libraries with an initial twelve-workflow US Trademark proposition catalog.

The implementation intentionally still does **not** provide:

- automatic candidate activation;
- recursive follow-up execution;
- model comparison or answer scoring;
- legal-truth verification;
- Brain validation or Core user-facing conclusions;
- execution authority from Assignment Library membership;
- a claim that future Australia or Canada libraries exist before their concrete governed seeds and tests are merged.

## Sequence status

1. **ADK-00 — implemented** — architecture and authority contract.
2. **ADK-01 — implemented** — provider-neutral runtime + DeepSeek canary.
3. **ADK-02 — implemented** — durable KnowledgeAssignment and immutable InstructionSet revisions.
4. **ADK-03 — implemented** — raw provider response + Markdown derivative integration with existing RawArtifact boundaries.
5. **ADK-04 — implemented** — immutable, versioned Assignment Graph.
6. **ADK-05 — implemented** — evidence-backed Assignment Candidate growth.
7. **ADK-06 — implemented** — governed multi-provider production-pilot control surface and receipts.
8. **ADK-07 — implemented and closed** — durable production queue, worker, failure safety and operator recovery.
9. **ADK-08 — implemented for initial US Trademark library** — governed Assignment Library contract, persistence, bootstrap and twelve-workflow US seed; Australia and Canada are future expansions.
