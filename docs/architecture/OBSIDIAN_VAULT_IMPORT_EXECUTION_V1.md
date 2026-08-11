# Obsidian Vault Import Execution V1

## Purpose

R1-K10 is the first explicit mutation boundary from a reviewed Vault candidate into Knowledge staging storage.

It executes only a durable K09 `VaultImportIntentV1` whose state is `PENDING_EXECUTION`. K10 never treats an approval as proof that the Vault file is still unchanged: the live file is re-opened at execution time and its byte size and SHA-256 must exactly equal the frozen K08/K09 evidence before any Staging mutation is allowed.

## Flow

```text
K09 VaultImportIntentV1 / PENDING_EXECUTION
  ↓ explicit operator execution
validate current ACTIVE Binding + frozen root fingerprint
  ↓
persist VaultImportExecutionV1 / PENDING
  ↓
safe live path traversal + live byte read
  ↓ exact size + SHA-256 match
VaultOriginStagingDocumentV1 / IMPORTED_UNVERIFIED
  ↓ persist Staging receipt
VaultImportExecutionV1 / SUCCEEDED
```

If the reviewed file is missing or its bytes changed, the execution becomes terminal `REJECTED`. A new K08 inspection and K09 review are required before another import can be authorized.

## Execution states

- `PENDING`: execution identity and all frozen review evidence are durable; no terminal result is claimed.
- `SUCCEEDED`: the Vault-origin Staging document is durable and the exact Staging receipt has been persisted as the execution result.
- `REJECTED`: the reviewed live source was deterministically missing or changed before Staging mutation.

Rejection codes in V1 are:

- `VAULT_IMPORT_SOURCE_MISSING`
- `VAULT_IMPORT_SOURCE_CHANGED`

Unsafe path, symlink, Binding, root-configuration or storage-integrity failures do not fabricate a semantic rejection. The execution remains recoverable `PENDING` until an operator retries after the operational problem is corrected.

## Frozen-before-read boundary

For new work K10 requires:

- the K09 intent is durable and still `PENDING_EXECUTION`;
- the current Workspace Vault Binding is `ACTIVE`;
- Binding ID, revision and relative root exactly match the reviewed snapshot;
- `MARKORBIT_OBSIDIAN_VAULT_ROOT` is an existing absolute directory;
- the SHA-256 fingerprint of the resolved root path exactly matches the K08/K09 frozen root fingerprint.

After those configuration checks, `VaultImportExecutionV1` is persisted as `PENDING` **before the reviewed candidate file is read**.

The execution freezes:

- Workspace ID;
- import intent ID;
- root fingerprint;
- Binding ID, revision and relative root;
- Vault-relative and Binding-relative paths;
- reviewed SHA-256;
- reviewed byte size;
- preparation/update timestamps.

A later request for the same import intent cannot silently bind different frozen evidence.

## Safe live read

Every Binding and candidate directory segment is resolved below the previously validated parent directory and checked with `lstat`. Symbolic links and non-directory path segments are rejected. The final candidate must remain a regular non-symlink file.

The live bytes must satisfy both:

```text
live size   == reviewed size
live SHA256 == reviewed SHA256
```

No file content is sent to Staging if either check fails.

## Dedicated Vault-origin Staging provenance

Vault-originated Markdown does not pass through the Worker / RawArtifact / ConversionRun pipeline, so K10 does not reuse `StagingDocumentDescriptor` or `ingestGenerated` and does not invent:

- Worker identity;
- ConversionRun identity;
- conversion attempt;
- upload grant;
- RawArtifact provenance.

Instead K10 persists `VaultOriginStagingDocumentV1` with explicit provenance:

- import intent ID;
- inspection run ID;
- frozen Binding snapshot;
- Vault paths;
- content SHA-256 and byte size;
- content-addressed reference;
- media type `text/markdown`;
- UTF-8 encoding;
- status `IMPORTED_UNVERIFIED`;
- import timestamp.

`IMPORTED_UNVERIFIED` is deliberate. K10 does not silently promote Vault-origin content into the existing conversion-generated READY Staging or make it ReadyPackage-eligible.

## Shared physical CAS, separate metadata truth

K10 reuses the existing Staging content-addressed storage root:

```text
MARKORBIT_STAGING_STORE_PATH
```

If it is not configured, the existing repository default `.data/staging` is used.

Vault-origin Markdown uses the same physical SHA-256 layout:

```text
sha256/<first-two-hash-chars>/<sha256>.md
```

This allows byte-level deduplication while keeping metadata provenance separate. K10 stores Vault-origin metadata in dedicated tables and does not add false Conversion foreign keys to existing Staging rows.

Migration `0026_vault_import_execution` creates:

- `vault_origin_staging_content_objects`
- `vault_origin_staging_documents`
- `vault_import_executions`

The implementation verifies existing CAS bytes before reuse and checks both Vault-origin and normal Staging content-object references before deleting an uncommitted newly created CAS object after failure.

## Retry and crash recovery

K10 preserves explicit recovery boundaries:

### Terminal replay

If an execution is already `SUCCEEDED` or `REJECTED`, retry returns the durable result before consulting current Vault root configuration or Binding state.

### Receipt-finalization recovery

If Vault-origin Staging and its execution receipt are durable but the process crashes before terminal finalization, retry finalizes `SUCCEEDED` locally from the persisted receipt. Vault filesystem access is not required.

### Staging-commit / receipt-crash recovery

If Vault-origin Staging commits but the process crashes before the execution receipt is persisted:

1. the execution remains `PENDING`;
2. retry revalidates the frozen live source because no receipt yet proves the mutation handoff complete;
3. Staging ingestion is idempotent by import intent;
4. the already durable Vault-origin Staging document is replayed rather than duplicated;
5. the receipt is persisted and execution finalizes.

### Concurrent staging replay

One import intent may bind only one immutable Vault-origin Staging evidence set. Concurrent replay must match inspection, path, hash and size exactly; otherwise it conflicts. Persisted-document parsing returns the exact contract shape and does not add runtime-only fields.

## Non-goals

R1-K10 does not implement:

- automatic Vault scanning or import;
- periodic synchronization;
- two-way synchronization;
- conflict merge or overwrite;
- deletion propagation;
- semantic interpretation or AI processing;
- promotion of Vault-origin Staging to verified/READY state;
- ReadyPackage creation from Vault-origin Staging;
- MarkOrbit Core behavior.

A later milestone may introduce an explicit Vault-origin verification/finalization path. It must preserve the dedicated provenance introduced here and must not reinterpret `IMPORTED_UNVERIFIED` as verified content without new durable evidence.
