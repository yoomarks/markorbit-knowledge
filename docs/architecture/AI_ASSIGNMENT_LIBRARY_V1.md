# AI Assignment Library V1

Status: **ADK-08 US Trademark initial library implemented**

## Purpose

The Assignment Library is a governed proposition library, not an answer library. It organizes durable `AiKnowledgeAssignmentV1` objects into immutable, versioned libraries that can be discovered by jurisdiction, domain and workflow without changing Assignment identity.

The library stores references to governed questions. Provider answers remain Research Submissions and RawArtifact / Markdown lineage under the existing AI Distilled Knowledge pipeline.

## Authority boundary

Every `AiAssignmentLibraryV1` permanently carries:

```text
answerContentStored = false
executionAuthorityGranted = false
legalTruthVerified = false
candidateAutoActivation = false
```

A library entry therefore does not:

- contain a provider answer;
- authorize ADK-07 queue execution;
- activate an Assignment Candidate;
- verify legal truth;
- rank providers;
- create a Brain/Core conclusion or protected filing action.

ADK-07 remains the separate governed execution lane. ADK-08 only makes durable Assignments reusable and discoverable.

## Persistence model

`AiAssignmentLibraryV1` is immutable per `libraryId + revision`. Revisions are sequential. Each entry references an already-persisted `AiKnowledgeAssignmentV1` through a foreign key and carries only library classification metadata:

- sequence;
- workflow;
- assignment id;
- tags.

Assignment identity and sequence are unique inside a library revision, but workflow is deliberately not unique. A workflow is a classification lane and may contain multiple distinct propositions as the Assignment system grows from new evidence. The repository rejects missing Assignments and jurisdiction/domain scope drift and can resolve all durable Assignments within a workflow in sequence order.

## Initial US Trademark library

Library: `kal_us_trademark_core@1`

Instruction set: `kis_us_trademark_research_core@1`

The first governed library contains twelve workflows:

1. Filing
2. Examination
3. Office Action
4. Section 8
5. Section 9
6. Section 15
7. Section 71
8. Specimen
9. Assignment
10. Opposition
11. Cancellation
12. TTAB

Each workflow is backed by a real immutable Knowledge Assignment with a research prompt designed to request current official sources, distinguish mandatory rules from options, expose uncertainty and preserve the boundary that AI output is not verified legal truth.

## Bootstrap semantics

`seedUsTrademarkAssignmentLibrary()` deterministically persists:

1. the governed US Trademark research InstructionSet;
2. the twelve immutable KnowledgeAssignments;
3. the immutable Assignment Library revision referencing those Assignments.

Repeated bootstrap is idempotent when the content is identical and fails closed on immutable drift.

## Expansion boundary

Australia and Canada are the next jurisdiction expansions. They should reuse the same library contract and persistence model while introducing jurisdiction-specific InstructionSets and Assignments. They must not be represented as implemented until their concrete governed libraries and tests exist.
