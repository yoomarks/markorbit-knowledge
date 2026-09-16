# Current Governed Knowledge

## Purpose

Knowledge has one canonical consumer-readiness model. ReadyPackage versions, Brain projections and retrieval channels are adapters over that model; none of them owns Knowledge currentness.

The canonical invariant is:

`CURRENT != VERIFIED != CONSUMER_ADMISSIBLE != DELIVERED`

- **CURRENT**: this is the selected current Knowledge version for the document.
- **VERIFIED**: durable verification evidence is acceptable (`PASS` or `PASS_WITH_WARNINGS`).
- **CONSUMER_ADMISSIBLE**: the content is current, verified, inside the consumer-visible corpus, and not blocked by Workspace or Source lifecycle state.
- **DELIVERED**: durable downstream handoff evidence exists. Delivery never makes content current.

`CurrentGovernedKnowledgeV1` in `packages/contracts/src/current-governed-knowledge-v1.ts` is the contract. `projectCurrentGovernedKnowledge` in persistence projects the state from durable Knowledge facts.

## State machine

The normal path is:

`Raw evidence -> Staging / normalized document -> verification -> retrieval current selection -> governed-current projection -> consumer adapter`

A consumer may use content only after the governed projection reports `consumerAdmissible=true`. The projection fails closed with bounded reason codes such as:

- `CONTENT_NOT_INDEXED` / `CONTENT_NOT_CURRENT`;
- `WORKSPACE_INACTIVE`;
- `SOURCE_ARCHIVED`;
- `VERIFICATION_MISSING` / `VERIFICATION_NOT_ACCEPTABLE`;
- `CORPUS_NOT_VISIBLE`;
- `CHANNEL_GLOBAL_OVERLAY_UNSUPPORTED`.

A downstream acceptance, handoff or successful transport may set delivery evidence, but it must not change the Knowledge version selected as CURRENT.

## ReadyPackage V1 and V2

ReadyPackage V1 remains the legacy staging/retrieval compatibility adapter. Existing V1 records remain readable and may support established Core intake/content delivery paths, but new architecture must not treat V1 status as currentness authority.

ReadyPackage V2 is the preferred canonical downstream delivery adapter from `CanonicalDownstreamDocument`. It likewise does not own currentness.

Migration policy:

1. keep V1 readable for existing staging/retrieval and frozen delivery evidence;
2. prefer V2 for new canonical downstream delivery work;
3. do not rewrite historical V1 records into V2 in place;
4. move consumers to the governed-current projection before retiring V1-specific readiness checks;
5. remove V1 delivery authority only in a separately reviewed migration after all production consumers use the canonical seam.

## Retrieval corpus capabilities

Corpus membership is explicit per channel:

- **LEXICAL**: `WORKSPACE_PLUS_GLOBAL`; a private Workspace may overlay Global Public Knowledge.
- **GRAPH**: `EXACT_WORKSPACE`; Global overlay is not supported.
- **VECTOR**: `EXACT_WORKSPACE`; Global overlay is not supported.

Graph or vector consumers must not silently widen or narrow their corpus to imitate lexical retrieval. The result contract advertises the capability on every channel. A request that would require an unsupported global overlay must expose `CHANNEL_GLOBAL_OVERLAY_UNSUPPORTED` rather than treating Global content as local.

Global Public Knowledge is platform-owned. It is available only through the explicit corpus rule; it is never a fallback for a missing or ambiguous Core-to-Knowledge Workspace binding.

## Consumer adapters

Brain-ready export and Core content export are consumer adapters. They must project or consume `CurrentGovernedKnowledgeV1` and fail closed when the projection is not consumer-admissible.

Brain may interpret admissible evidence after export, but Brain acceptance does not alter Knowledge currentness. Core intake/content delivery may record handoff or delivery evidence, but Core acceptance likewise does not alter Knowledge currentness.

The bounded reason code is part of the failure contract. Adapters must not collapse stale, archived, inactive, unverified or invisible conditions into an opaque `false`.

## Authority and non-goals

Knowledge owns objective evidence lifecycle, version selection, verification state, Source/Workspace availability and corpus visibility. It does not own downstream semantic interpretation.

No consumer may:

- promote delivered content to CURRENT;
- treat ReadyPackage status as the sole readiness authority;
- make Brain or Core acceptance authoritative for Knowledge visibility;
- infer legal truth from `VERIFIED`;
- hide a retrieval corpus limitation by changing corpus membership silently.

This model is an Evidence Plane control seam. It does not add research strategy, prompt meaning, synthesis, distillation, recommendation or action authority to Knowledge.

## Verification

Contract tests freeze the four independent states, V1/V2 compatibility roles and retrieval channel capabilities. Persistence tests verify reason-code projection from durable facts. Admin tests verify Brain/Core export gates and private-plus-Global lexical behavior, including lifecycle revocation.
