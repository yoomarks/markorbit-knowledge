# Canonical Downstream Document V1

## Purpose

R1-K12 introduces a provenance-preserving downstream substrate for Vault-origin Markdown that has passed the explicit K08–K11 review and verification chain.

The existing ReadyPackage V1 and ReadyPackage Content Export V1 are intentionally **not** generalized in this milestone. They are conversion-origin contracts whose persistence and wire formats require Source, RawArtifact, ConversionRun and Converter identities. Creating synthetic values merely to fit Vault-origin content would destroy provenance truth.

K12 therefore creates a separate canonical downstream object that can later be consumed by a provenance-aware ReadyPackage V2 or another downstream adapter.

## Authorized source

A new `CanonicalDownstreamDocumentV1` may be created only from the same Workspace and the same immutable lineage:

```text
K08 VaultInspectionRun
  -> K09 VaultImportIntent (human reviewed)
  -> K10 VaultImportExecution = SUCCEEDED
  -> K10 VaultOriginStagingDocumentV1
  -> K11 VaultOriginStagingVerification = PASS | PASS_WITH_WARNINGS
  -> K11 VaultOriginStagingFinalization = VERIFIED
  -> K12 CanonicalDownstreamDocumentV1 = READY
```

The promotion gate requires all IDs, Binding evidence, root fingerprint, paths, byte size and SHA-256 values to agree across that chain.

## Contract

`CanonicalDownstreamDocumentV1` records:

- Workspace identity;
- explicit `origin.kind = VAULT_IMPORT`;
- inspection run ID;
- reviewed import intent ID;
- successful import execution ID;
- Vault-origin Staging document ID;
- K11 verification ID and PASS/PASS_WITH_WARNINGS outcome;
- K11 VERIFIED finalization ID;
- frozen Vault root fingerprint and Binding snapshot;
- reviewed Vault-relative and Binding-relative paths;
- observed/reviewed/imported/verified timestamps;
- immutable Markdown SHA-256, byte size and CAS reference;
- `legalTruthVerified: false`;
- promotion timestamp.

The Vault-import origin shape contains no `sourceId`, `rawArtifactId`, `conversionRunId`, Worker identity or Converter identity.

## Persistence

Migration `0028_canonical_downstream_document` adds `canonical_downstream_documents`.

The invariant is one canonical document per `(workspace_id, vault_staging_document_id)`.

Before the first insert, the promotion repository verifies:

1. every record belongs to the same Workspace;
2. every record binds the same import intent;
3. K10 execution is `SUCCEEDED` and its durable receipt exactly matches the Vault-origin Staging document;
4. K08/K09 reviewed Binding, paths, root fingerprint, SHA-256 and byte size still match K10 evidence;
5. K11 verification is `PASS` or `PASS_WITH_WARNINGS` and binds the exact bytes;
6. K11 finalization is `VERIFIED` and binds the exact verification;
7. the current immutable Staging CAS bytes still hash to the persisted SHA-256 and byte size.

A second promotion of the same Vault-origin Staging document is a local replay of the already durable canonical record. The admin service checks for that record before any new K08–K11 lookup or CAS read, so a successful promotion remains replayable even when the Staging filesystem is temporarily unavailable.

## Admin boundary

The Vault Workbench exposes an explicit promotion action for K11 VERIFIED candidates and a read-only list of canonical downstream documents.

The operator is told that K12 does not create ReadyPackage V1 and does not call Core.

## Explicit non-goals

K12 does **not**:

- modify or weaken ReadyPackage V1;
- modify ReadyPackage Content Export V1;
- fabricate Source, RawArtifact, ConversionRun, Worker or Converter provenance;
- copy Vault-origin records into conversion-generated `staging_documents`;
- automatically hand content to Core;
- perform semantic analysis, summarization, extraction or AI interpretation;
- add automatic Vault synchronization, conflict merge, overwrite or deletion propagation.

## Follow-up boundary

A later milestone may define a provenance-aware ReadyPackage V2 / Content Export V2 that consumes canonical downstream documents. Such a contract must model origin kinds explicitly. Any Core wire-contract change must be coordinated as a separate cross-repository boundary rather than silently changing the frozen V1 contract.
