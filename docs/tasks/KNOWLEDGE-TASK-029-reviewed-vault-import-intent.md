# KNOWLEDGE-TASK-029 — Reviewed Vault Import Intent

## Goal

Add an explicit human approval boundary between K08 read-only Vault inspection evidence and any future Vault → Knowledge mutation.

## Delivered boundary

- introduce `VaultImportIntentV1`;
- allow approval only from a persisted K08 `IMPORT_CANDIDATE`;
- freeze inspection, Binding, path, SHA-256 and byte-size evidence;
- require current ACTIVE Binding to match the inspection before first approval;
- persist one immutable pending intent per inspected candidate;
- make exact approval replay idempotent and conflicting review evidence fail closed;
- expose explicit admin API/UI for approval.

## Explicit non-goals

- no filesystem read during approval;
- no Vault mutation;
- no Staging/Source/ReadyPackage/Core mutation;
- no conflict resolution;
- no automatic import or synchronization;
- no AI/semantic interpretation.

## Follow-up gate

Any execution milestone must re-read the exact live Vault path and verify live SHA-256/size against the frozen intent before creating dedicated Vault-originated Staging provenance. Existing worker-generated Staging ingestion must not be repurposed to invent conversion provenance.
