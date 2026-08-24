# ADK-11 Source-Grounded Assignments

## Objective

Introduce the first contract boundary for source-grounded AI research without changing the existing Knowledge authority model or authorizing provider execution.

ADK-11 starts from a narrow invariant: an AI research answer is not source-grounded merely because its prompt asks the model to cite official sources. The exact source evidence available to the model must be separately identified, content-addressed and bound to the governed KnowledgeAssignment.

## Contract surface

`AiSourcePackV1` is an immutable revisioned set of official source snapshots for one jurisdiction/domain/topic scope. Every source entry binds:

- the existing Knowledge `sourceId`;
- a finalized RawArtifact `artifactId`;
- canonical URI and publisher;
- jurisdiction;
- official authority class and source role;
- capture timestamp;
- exact SHA-256 content identity;
- optional publication/effective timestamps.

V1 is intentionally `OFFICIAL_ONLY`. It does not mix professional, industry or synthetic-AI material into a pack that claims strict official grounding.

`AiAssignmentSourceBindingV1` binds an existing `AiKnowledgeAssignmentV1` and immutable InstructionSet revision to one exact SourcePack revision. The binding permanently freezes:

- `groundingPolicy = STRICT_OFFICIAL_SOURCE_PACK`;
- `requireCitations = true`;
- `allowExternalSources = false`;
- `allowUncitedFactualClaims = false`;
- `legalTruthVerified = false`;
- `executionAuthorityGranted = false`.

The context validator rejects assignment identity drift, InstructionSet revision drift, SourcePack revision drift and jurisdiction/domain scope mismatch.

## Why this is separate from Assignment identity

Existing KnowledgeAssignment identities remain immutable and provider-neutral. A SourcePack may be refreshed as official materials change without mutating the historical Assignment object. The explicit binding records which exact source snapshot revision was authorized for one grounded research execution.

This also prevents a prompt-only illusion of grounding: the Assignment can request official sources, but the binding is the machine-verifiable evidence that a concrete source pack was selected.

## Current boundary

This first ADK-11 slice is contract-only. It does **not** yet:

- resolve RawArtifact bytes into provider input;
- call DeepSeek, OpenAI or another provider;
- add web-search tools to provider adapters;
- validate citations returned by a model;
- score source quality or provider quality;
- verify legal truth;
- enqueue ADK-07 jobs;
- activate candidates;
- authorize protected actions or client filings.

The next slice should add a deterministic source-pack resolver/renderer that loads the bound finalized RawArtifacts and constructs the exact provider input while preserving source IDs for citation provenance. Real paid-provider execution remains gated by issue #405 and repository governance issue #429.
