# KNOWLEDGE-TASK-030 — Retry-safe Vault Import Execution

## Goal

Execute a human-reviewed K09 Vault import intent without turning filesystem state into implicit truth and without fabricating Worker / Conversion provenance.

## Delivered boundary

- execute only a durable `PENDING_EXECUTION` Vault import intent;
- require current ACTIVE Binding and frozen root fingerprint before new filesystem work;
- persist execution `PENDING` before reading the reviewed candidate file;
- traverse the approved Binding/path without following symbolic links;
- require live byte size and SHA-256 to equal frozen K08/K09 evidence;
- terminally reject reviewed files that are missing or changed;
- persist dedicated `VaultOriginStagingDocumentV1` provenance with status `IMPORTED_UNVERIFIED`;
- reuse `MARKORBIT_STAGING_STORE_PATH` physical CAS without adding false Conversion foreign keys;
- persist the Staging receipt before execution finalization;
- recover from Staging-commit/receipt and receipt/finalization crash windows;
- replay terminal results without current filesystem/root/Binding dependencies;
- expose an explicit admin execution API and control.

## Reliability invariants

1. K09 review authorization is immutable.
2. `PENDING` is durable before the candidate read.
3. No Staging mutation occurs unless live size/hash exactly match reviewed evidence.
4. One import intent maps to one immutable Vault-origin Staging document.
5. A durable Staging receipt is required before `SUCCEEDED`.
6. A persisted receipt can finalize locally after restart.
7. `SUCCEEDED` and `REJECTED` replay locally without new filesystem work.
8. Concurrent/repeated Staging ingestion must match inspection/path/hash/size exactly.

## Explicit non-goals

- no automatic import or synchronization;
- no conflict merge/overwrite/delete propagation;
- no AI or semantic interpretation;
- no conversion-generated READY Staging fabrication;
- no ReadyPackage eligibility for Vault-origin content yet;
- no Core changes.

## Follow-up gate

A later milestone may add explicit verification/finalization for `VaultOriginStagingDocumentV1`. It must preserve Vault-origin provenance and create new durable verification evidence before any promotion toward READY / ReadyPackage workflows.
