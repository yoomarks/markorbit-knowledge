# ReadyPackage V2 and Content Export V2

## Purpose

R1-K13 adds a provenance-aware ReadyPackage contract for K12 `CanonicalDownstreamDocumentV1` records.

The existing ReadyPackage V1 and ReadyPackage Content Export V1 remain frozen conversion-origin contracts. K13 does not broaden, mutate or reinterpret them.

## Why V2 exists

ReadyPackage V1 assumes conversion provenance: Source, RawArtifact, ConversionRun, Staging verification and Converter identities. Vault-origin content does not have those identities and K08–K12 deliberately avoided fabricating them.

ReadyPackage V2 therefore freezes the authoritative K12 canonical document directly.

```text
K08 inspection
  -> K09 human-reviewed import intent
  -> K10 successful import execution
  -> K11 verification + VERIFIED finalization
  -> K12 READY canonical downstream document
  -> K13 VERIFIED ReadyPackage V2
  -> K13 Content Export V2
```

## Source authority

The ReadyPackage V2 creation command accepts only:

- Workspace ID;
- canonical downstream document ID.

It does **not** accept origin, content hash, verification outcome, Binding evidence or any other provenance fields from the request body.

The persistence repository resolves the canonical document from the durable K12 ledger and freezes that authoritative record into package evidence.

## ReadyPackage V2 contract

`ReadyPackageV2` contains:

- contract version `2.0`;
- object type `READY_PACKAGE`;
- `rdp_*` package identity;
- Workspace identity;
- status `VERIFIED`;
- canonical document ID and K12 promotion timestamp;
- explicit `origin.kind = VAULT_IMPORT` provenance;
- immutable Markdown SHA-256, byte size and content-addressed reference;
- `legalTruthVerified: false`;
- deterministic SHA-256 evidence digest;
- package creation timestamp.

The V2 package contains no `sourceId`, `rawArtifactId`, `conversionRunId`, Worker identity or Converter identity.

`VERIFIED` means the package was created from an authoritative K12 `READY` canonical record. It does not mean Core accepted the package, semantic understanding occurred, or legal truth was verified.

## Persistence

Migration `0029_ready_package_v2` creates `ready_packages_v2`.

The invariant is one immutable V2 package per `(workspace_id, canonical_document_id)`.

An exact second create request returns the already durable package. The canonical document ID is the natural idempotency key for this one-to-one packaging boundary.

ReadyPackage V1 storage remains separate and unchanged.

## Content Export V2

`ReadyPackageContentExportV2` contains:

- ReadyPackage V2 identity and evidence digest;
- Knowledge Workspace identity;
- canonical document ID and K12 promotion timestamp;
- the exact Vault-import provenance snapshot;
- `legalTruthVerified: false`;
- immutable Markdown metadata;
- UTF-8 Markdown content.

Before export, Knowledge:

1. reloads the authoritative K12 canonical document;
2. requires the V2 package evidence and digest to exactly match that canonical record;
3. rereads the immutable Vault-origin Staging CAS bytes;
4. requires byte size and SHA-256 to match the frozen canonical evidence;
5. requires fatal UTF-8 decoding to succeed;
6. validates and deterministically serializes Content Export V2.

No raw Vault file is read during packaging or export. Export uses the immutable K10/K11 Staging CAS object.

## Admin boundary

The Vault Workbench exposes:

- K12 READY canonical documents that are not yet packaged;
- an explicit operator action to create ReadyPackage V2;
- read-only V2 package history;
- a read-only Content Export V2 endpoint for each package.

There is no scheduled or background packaging.

## Core boundary

K13 does **not** send V2 packages to Core.

The existing Core intake and content endpoints remain the frozen V1 consumer boundary. K13 does not change request headers, intake contracts, Core workspace binding, delivery ledgers or retry semantics.

A future milestone that delivers V2 to Core requires an explicit coordinated Core consumer contract and must preserve both V1 compatibility and V2 provenance truth.

## Explicit non-goals

K13 does not:

- modify ReadyPackage V1;
- modify Content Export V1;
- modify Core intake or content contracts;
- fabricate conversion provenance;
- automatically hand off or publish a V2 package;
- perform semantic analysis, summarization, extraction or AI interpretation;
- claim legal truth verification;
- add automatic Vault synchronization, conflict merge, overwrite or deletion propagation.
