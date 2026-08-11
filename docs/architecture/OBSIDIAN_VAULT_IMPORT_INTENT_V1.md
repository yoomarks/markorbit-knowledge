# Obsidian Vault Import Intent V1

## Purpose

R1-K09 establishes an explicit **human-reviewed import-intent boundary** on top of immutable K08 Vault inspection evidence.

K09 does not import a Vault file. It records that an operator reviewed one frozen `IMPORT_CANDIDATE` observation and authorized a future, separately implemented attempt to import that exact observed content into Staging.

## Approval flow

```text
K08 VaultInspectionRunV1
  + candidate.classification = IMPORT_CANDIDATE
  + current ACTIVE VaultBinding exactly matches inspected binding
  ↓ explicit operator approval
VaultImportIntentV1
  state = PENDING_EXECUTION
```

The approval path does not read the filesystem. It uses only persisted K08 evidence and the current persisted Vault Binding.

## Frozen evidence

Each intent freezes:

- Knowledge Workspace ID;
- inspection run ID;
- inspection root fingerprint SHA-256;
- inspection observation timestamp;
- binding ID, revision and portable relative root;
- candidate Vault-relative and Binding-relative paths;
- candidate observed SHA-256 and size;
- action `IMPORT_TO_STAGING`;
- state `PENDING_EXECUTION`;
- optional operator review note;
- review timestamp;
- stable idempotency key.

An exact repeated approval replays the original intent. The same candidate cannot be silently re-approved with different review evidence, and an idempotency key cannot be reused for different frozen evidence.

## Eligibility

K09 accepts only K08 candidates classified `IMPORT_CANDIDATE`.

It rejects:

- `CONFLICT` — this requires an explicit conflict-resolution design;
- `UNCHANGED` — already managed content does not need an import intent;
- `MISSING` — there are no observed bytes to import.

Before the first approval is persisted, the Workspace Vault Binding must still be ACTIVE and match the inspection snapshot exactly by binding ID, revision and relative root. A changed Binding requires a new K08 inspection and a new review.

Once an intent is durably persisted, exact replay is allowed from that immutable evidence even if the Binding later changes. Replay does not create a new authorization.

## No filesystem or Staging mutation

K09 intentionally has no Vault root dependency and performs no live file read. It does not:

- read, write, rename or delete Vault files;
- create directories;
- create or update Staging documents;
- create Source or ReadyPackage objects;
- call Core;
- resolve Wiki Links;
- interpret frontmatter semantically;
- poll or synchronize automatically.

This distinction prevents stale filesystem state from being confused with completed import work.

## Future execution requirement

A later execution milestone must treat `VaultImportIntentV1` as authorization evidence, not as proof that the file is still unchanged.

Before any Staging mutation it must:

1. load the exact frozen intent;
2. require the current ACTIVE Binding to match the frozen binding;
3. resolve the exact frozen path under the server-controlled Vault root with the same symlink/path protections used by K07/K08;
4. read the live file without following unsafe links;
5. require live byte size and SHA-256 to exactly equal the frozen K08 candidate evidence;
6. fail closed if the file is missing or changed and require a new inspection/review;
7. persist retry-safe execution evidence before crossing any mutation boundary.

Vault-originated Markdown also needs a dedicated Vault → Staging provenance model. It must not be disguised as `ingestGenerated` worker/conversion output because that would invent worker, conversion-run, attempt and upload-grant provenance that never occurred.

## Persistence

Migration `0025_vault_import_intents` stores immutable intent JSON plus request-digest and uniqueness evidence. There is one reviewed intent per Workspace + inspection run + Vault path, and one request binding per Workspace + idempotency key.

## Non-goals

R1-K09 does not implement:

- actual Vault → Staging ingestion;
- conflict merge/overwrite decisions;
- deletion propagation;
- automatic import;
- scheduled scanning;
- two-way synchronization;
- semantic/AI interpretation;
- MarkOrbit Core behavior.
