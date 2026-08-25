# K-CASE-000 — MarkReg Boundary Audit — 2026-08-25

Status: **BLOCKED ON REAL SYSTEM DISCOVERY — DO NOT INVENT PRODUCER CONTRACT**

## Audit scope

The takeover re-checked the currently connected GitHub account and all repositories exposed for owner `yoomarks`.

Accessible repositories at this checkpoint are:

- `yoomarks/markorbit`
- `yoomarks/markorbit-knowledge`
- `yoomarks/markorbit-data-engine`
- `yoomarks/MOKI-Illustration-Skill`

No repository named MarkReg is exposed. Repository search for `MarkReg` returned no repository, and code search across the accessible `yoomarks` installation returned no `MarkReg` hit. A direct search for `matterId` in `yoomarks/markorbit` also returned no result.

This confirms the earlier strategic audit: the real MarkReg execution boundary is not discoverable from the currently connected GitHub installation.

## Facts that remain unknown

The following K-CASE-000 acceptance facts are still unresolved and must not be guessed:

- actual MarkReg runtime location;
- repository or service name, if any;
- owning team/runtime;
- canonical matter ID;
- matter version/snapshot semantics;
- API, event, webhook, export, database, or other integration surface;
- authorization model;
- document storage/reference model;
- email/correspondence model;
- status/event history model;
- fee/payment evidence model;
- source availability/retry semantics.

## Frozen product boundary despite the blocker

The missing implementation location does **not** reopen the product decision.

The boundary remains:

```text
real MarkReg matter (system of record)
-> operator selects "Send to Knowledge Case"
-> idempotent Case Candidate
-> Knowledge receives/pulls authorized source evidence
-> objective Case Dossier assembly
-> privacy/redaction/review/versioning
```

Knowledge must not create a replacement matter-management system or ask operators to re-enter complete cases manually.

## What may proceed before MarkReg is located

Allowed:

- Expert contracts/persistence/retrieval work;
- shared AI/Communication migration work;
- Case Dossier schema work that is source-system-neutral and based on the already approved architecture;
- generic evidence/reference primitives that reuse existing RawArtifact/provenance semantics.

Blocked:

- K-CASE-001 producer-specific identity finalization if it requires facts not known above;
- K-CASE-002 one-click MarkReg UX;
- production Case Candidate intake assumptions about auth/export/version fields;
- first real end-to-end MarkReg Case Dossier acceptance.

## Required discovery receipt

K-CASE-000 may be marked complete only when a future engineering pass records, from the real running system or its authoritative repository/documentation:

```text
system_name:
repository_or_service:
owner:
canonical_matter_id:
matter_version_or_snapshot:
integration_surface:
auth_model:
document_reference_model:
correspondence_model:
status_event_model:
fee_payment_model:
example_completed_matter_ref:
verified_at:
verified_by:
```

A chat description alone is not sufficient final evidence; the facts must be recorded in a durable repository document/ADR or linked authoritative system documentation.
