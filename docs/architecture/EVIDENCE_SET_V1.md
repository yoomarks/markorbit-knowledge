# Evidence Set V1

Evidence Set V1 is the immutable, workspace-scoped research context contract owned by MarkOrbit Knowledge.
It freezes exact accepted evidence identities selected explicitly by an operator so a later review or downstream execution can prove which evidence versions were consumed.

## Design rule

`RawArtifact immutability -> document/version immutability -> context immutability -> reproducible downstream execution`

An Evidence Set does not copy mutable document bodies to simulate freezing. It records exact immutable references and digests already produced by the Knowledge pipeline.

## Identity and immutability

Each set carries `schemaVersion`, `contractVersion`, stable `evidenceSetId`, immutable revision `1`, `workspaceId`, title, bounded optional note, creator principal facts, explicit member ordering, creation time, and a SHA-256 manifest digest.

The digest covers the complete frozen manifest except the digest field itself. Persisted state is revalidated and rehashed when read; silent mutation fails closed.

## Frozen member facts

Every selected member is resolved at creation through the workspace-scoped retrieval ledger and its exact RawArtifact. Creation fails if that chain cannot be proven.

A member freezes the document and Staging identities, ReadyPackage identity, RawArtifact identity, logical document identity when present, exact artifact version, SourceDefinition identity and factual source metadata, canonical/source URIs, captured/published times, Staging content SHA-256, RawArtifact binary/content SHA-256, and RawArtifact status observed at freeze time.

Selection order is `EXPLICIT`. No automatic selection, expansion, relevance ranking, sufficiency score, legal interpretation, or recommendation is part of this contract.

## Creation and replay

Creation is an Admin browser mutation and therefore uses the existing workspace principal, trusted-origin, CSRF, and role boundaries. Cross-workspace selected members fail closed.

The idempotency ledger is scoped by workspace, creator user, and explicit idempotency key. Repeating the same request replays the existing immutable set; reusing the key with different metadata or membership is rejected.

## Review Package

The Review Package is a human inspection surface over the immutable set. It summarizes set identity, counts, factual source/jurisdiction distribution, exact member versions and digests, and links each frozen member back to the canonical Evidence Workspace/Inspector.

## Objective drift

Reopening a set never rewrites its frozen manifest. A separate drift read model compares each frozen member with current durable facts and may report:

- `CURRENT`;
- `NEWER_VERSION_AVAILABLE`;
- `SOURCE_MISSING` or `SOURCE_ARCHIVED`;
- `RAW_ARTIFACT_MISSING` or `RAW_ARTIFACT_ARCHIVED`;
- `CURRENT_DOCUMENT_UNRESOLVED`.

Where a current document version is resolvable, the Review Package links both the frozen version and the current version to the existing Evidence Workspace. Drift is factual state only; it is not an assessment of significance.

## Downstream handoff

`EvidenceSetExportV1` is the stable provider-neutral read/export contract. It exposes the set id, revision, digest, ordered exact members, workspace, title, and creation time without creating a second delivery runtime.

A governed consumer can retain `evidenceSetId + revision + digest` and later resolve the identical frozen context. Provider-specific delivery remains outside Evidence Set V1 and should reuse existing ReadyPackage/Content Export machinery when transport is required.

## Boundary with Core

Knowledge owns membership facts, immutable identities, provenance, hashes, and objective drift. Core owns semantic synthesis, legal/business meaning, recommendations, relevance, and value judgments.
