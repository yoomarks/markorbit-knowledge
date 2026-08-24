# AI Distilled Knowledge Acquisition V1

Status: **ADK-00 through ADK-10 implemented; ADK-06 production control surface implemented with real 3×2 live acceptance still open in issue #405; ADK-07 production queue safety hardened through #427; US/AU/CA Trademark Assignment Libraries established**

## Purpose

AI models are treated as external research lawyers that answer governed Knowledge assignments. Knowledge issues the assignment, records the exact provider response, extracts the assistant-authored Markdown, and preserves provenance. Knowledge does not grade the answer.

The durable product idea is not one provider integration. It is a provider-replaceable acquisition lane in which the long-lived assets are the assignment, instruction-set revision, raw response, submission evidence, distilled Markdown, versioned Assignment Graph, governed Assignment Candidates, promotion receipts, durable production execution evidence and reusable Assignment Libraries.

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

Production execution remains separately governed. A library entry or candidate promotion never grants execution authority. ADK-07 queue materialization and workers still require the existing governed production-pilot and execution boundaries.

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

ADK-05 persists candidates immutably, rejects graph/parent/instruction scope drift, and deterministically deduplicates equivalent proposals. The persistence API intentionally has no automatic activation or execution method.

### Candidate Promotion Receipt

ADK-09 adds governed, operator-approved proposition promotion without introducing automatic approval. One approved Assignment Candidate can be converted into a durable KnowledgeAssignment together with the exact next Assignment Graph and Assignment Library revisions and an immutable `AiAssignmentCandidatePromotionV1` receipt.

Promotion rejects stale graph candidates and stale library approvals rather than silently rebasing an earlier operator decision. Candidate evidence refs remain part of the graph lineage, one candidate can be promoted only once, and exact replay is idempotent.

Promotion does not enqueue ADK-07 jobs, call providers, rank models, verify legal truth, authorize protected actions or recursively promote candidates.

### Production Pilot

`AiProductionPilotPlanV1` freezes exactly three governed Assignments, at least two providers, an approval reference and explicit authorization for live provider calls. The plan permanently prohibits provider-quality comparison, legal-truth verification and candidate auto-activation.

`AiProductionPilotRunV1` records one receipt for every Assignment/provider cell. A cell is one of:

- `EXECUTED` — a real injected provider adapter returned an acquisition;
- `BLOCKED_ADAPTER` — no real adapter was available for that provider;
- `BLOCKED_CREDENTIAL` — the real adapter refused to execute because its runtime credential was missing;
- `FAILED` — the adapter attempted execution but returned a governed acquisition error.

ADK-06 supplies the provider-neutral matrix runner, real DeepSeek/OpenAI adapters and the controlled live-acceptance path. The implementation is complete, but issue #405 remains open because implementation/CI evidence does not substitute for the required real 3×2 paid-provider acceptance and retained evidence.

The live path freezes the canonical assignments/providers/approval, enforces DeepSeek off-peak execution, persists every successful provider cell before the next paid call, supports encrypted checkpoint/resume, rejects ambiguous in-flight replay, and now requires the dispatched `GITHUB_SHA` to equal an explicitly authorized `expected_commit_sha`.

### Durable AI Knowledge Job

ADK-07 turns governed Assignment/provider cells into durable production jobs. The queue provides deterministic execution identity, atomic claim semantics, retry boundaries, stale-claim recovery, credential blocking, terminal failures, `BLOCKED_RECOVERY` quarantine for uncertain work, compare-and-set recovery and operator recovery commands.

PR #427 hardens the queue so provider timeout/network failures are treated as delivery-uncertain rather than automatically replayable, ungoverned adapter exceptions fail closed, and worker transitions use compare-and-set persistence so stale workers cannot overwrite recovery/operator state.

Provider success followed by Artifact persistence uncertainty is never treated as safely replayable provider work. Raw provider response and Markdown lineage remain the durable completion evidence.

### Assignment Library

`AiAssignmentLibraryV1` is an immutable, versioned proposition library over already-persisted KnowledgeAssignments. It organizes reusable questions by jurisdiction, domain and workflow without storing provider answers or changing Assignment identity.

ADK-08 introduced durable library persistence and the initial `kal_us_trademark_core@1` library backed by `kis_us_trademark_research_core@1`, with twelve US Trademark workflows: Filing, Examination, Office Action, Section 8, Section 9, Section 15, Section 71, Specimen, Assignment, Opposition, Cancellation and TTAB.

ADK-10 extends this model with separate Australia and Canada libraries rather than pretending one US library is jurisdiction-neutral:

- US: `kal_us_trademark_core@1` / 12 workflows;
- AU: `kal_au_trademark_core@1` / 10 workflows;
- CA: `kal_ca_trademark_core@1` / 10 workflows.

Each jurisdiction owns a distinct InstructionSet, KnowledgeAssignment identities and library identity. The catalog supports `US`, `AU`, `CA` and deterministic `ALL` bootstrap. `ALL` installs the exact jurisdiction seeds sequentially; it does not create one cross-jurisdiction library object.

Library revisions are sequential and immutable. Entries foreign-key to durable Assignments, reject jurisdiction/domain scope drift, and never grant execution authority.

## Provider runtime

ADK-01 introduced the provider-neutral `AiKnowledgeProviderAdapter` and DeepSeek production adapter. The DeepSeek adapter uses only the canonical HTTPS API endpoint, reads `DEEPSEEK_API_KEY` only from runtime environment, preserves exact returned JSON bytes, extracts non-empty assistant content as Markdown, bounds runtime/response size, enforces the frozen Beijing-time off-peak policy for paid execution, classifies governed provider failures, and never marks legal truth as verified.

The OpenAI production adapter uses the canonical Responses API endpoint, reads `OPENAI_API_KEY` only at runtime, preserves exact returned JSON bytes and emits the same governed submission/artifact identities and legal-truth boundary.

A live provider request remains credential-gated. Generic CI validates deterministic transport and evidence boundaries without pretending a production credential was used. Issue #405 is the explicit real-provider acceptance gate.

## Current implementation boundary

ADK-00 through ADK-10 now establish:

- authority contracts;
- provider-neutral DeepSeek and OpenAI production runtimes;
- durable KnowledgeAssignments and immutable InstructionSet revisions;
- raw provider response and Markdown derivative RawArtifact lineage;
- immutable, versioned Assignment Graph persistence;
- evidence-backed Assignment Candidate proposals with no automatic activation authority;
- governed candidate promotion receipts and exact graph/library revision transitions;
- governed production-pilot control surface and receipts;
- durable production queue execution with ambiguous-delivery quarantine and CAS recovery/worker safety;
- immutable US/AU/CA Trademark Assignment Libraries and deterministic catalog bootstrap.

The implementation intentionally still does **not** provide:

- automatic candidate approval or recursive follow-up execution;
- model comparison or answer scoring;
- legal-truth verification;
- Brain validation or Core user-facing conclusions;
- execution authority from Assignment Library membership;
- a claim that ADK-06 real-provider acceptance is complete before issue #405 has successful 6/6 evidence;
- a claim that AI answers are source-grounded merely because an Assignment asks the model to cite official sources.

## Sequence status

1. **ADK-00 — implemented** — architecture and authority contract.
2. **ADK-01 — implemented** — provider-neutral runtime + DeepSeek adapter.
3. **ADK-02 — implemented** — durable KnowledgeAssignment and immutable InstructionSet revisions.
4. **ADK-03 — implemented** — raw provider response + Markdown derivative integration with existing RawArtifact boundaries.
5. **ADK-04 — implemented** — immutable, versioned Assignment Graph.
6. **ADK-05 — implemented** — evidence-backed Assignment Candidate growth.
7. **ADK-06 — implementation complete; live acceptance pending** — governed multi-provider control surface, DeepSeek/OpenAI live harness, exact-SHA authorization and encrypted resumable evidence; issue #405 remains the real 3×2 acceptance gate.
8. **ADK-07 — implemented and safety-hardened** — durable production queue, worker, failure safety, ambiguous-delivery quarantine, CAS transitions and operator recovery.
9. **ADK-08 — implemented** — governed Assignment Library contract, persistence, bootstrap and initial twelve-workflow US seed.
10. **ADK-09 — implemented** — governed candidate promotion receipt and exact next Assignment/Graph/Library revision workflow, without auto-approval or execution.
11. **ADK-10 — implemented** — separate Australia and Canada trademark libraries plus the US/AU/CA catalog.

The canonical current handoff checkpoint is `docs/project/CURRENT_STATE.md`.
