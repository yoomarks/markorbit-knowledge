# K-EXT-C — Email Worker production ingestion

> **Historical task status — SUPERSEDED FOR NEW EMAIL TRANSPORT DEVELOPMENT (2026-08-25).**
>
> The implementation/history below remains valuable evidence for read-only mailbox safety, UID/UIDVALIDITY, cursor, restart, hash verification, and RawArtifact ingestion. However, **new generic email send/receive/sync/thread/attachment transport must be developed in the shared `yoomarks/markorbit` Communication Capability**, not expanded as a Knowledge-owned mail platform.
>
> Knowledge will use that shared Capability for Expert Q&A and will own Expert question/source semantics and Knowledge provenance. See:
> - `docs/product/KNOWLEDGE_LONG_TERM_STRATEGY.md`
> - `docs/architecture/KNOWLEDGE_CAPABILITY_SOURCE_BOUNDARIES.md`
> - `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`

- **Direction:** horizontal Knowledge ingestion extension
- **Base:** `c7f47999d65814b46a7c7ebb4318fc1a48b33c40` (merged K-EXT-B)
- **Status:** `HISTORICAL / SUPERSEDED FOR FUTURE TRANSPORT OWNERSHIP`
- **Owner:** historical Knowledge Worker / existing control plane

## Objective

Add a production `EMAIL` acquisition Worker without adding mailbox mutation authority or a second ingestion architecture.

## Runtime path

```text
Worker-host IMAP account binding
-> EMAIL SourceDefinition
-> existing CollectionPlan
-> existing CollectionRun / EMAIL_IMPORT Job
-> existing Worker heartbeat + lease
-> read-only IMAP UID discovery / BODY.PEEK[]
-> existing controlled execution
-> existing ArtifactIngestionSession
-> existing hash/size verification + CAS
-> immutable EMAIL RawArtifact
-> existing downstream derivation boundary
-> existing execution receipt
-> operational UID cursor advances only after COMPLETE
```

## Authority and safety

- account passwords remain Worker-host secrets referenced through environment-variable names;
- SourceDefinition carries an account binding ID, never a password;
- TLS certificate verification is mandatory;
- mailbox select is read-only;
- message fetch uses `BODY.PEEK[]`;
- no send, append, store/flag mutation, copy/move, delete or expunge implementation exists;
- RawArtifact provenance contains binding/mailbox/UIDVALIDITY/UID but not host username/password;
- UIDVALIDITY changes fail closed;
- oversized selected messages fail before cursor advancement;
- Worker performs no direct SQLite/Staging/Vault/retrieval/change-feed writes;
- immutable RawArtifact finalization remains the acquisition evidence boundary.

## Incremental / restart model

A private Worker-host state file stores the operational cursor and one inflight execution checkpoint. The cursor is scoped to Source + account binding + mailbox and moves only after the controlled execution completes. Inflight replay re-fetches exact UIDs and verifies SHA-256/size before reusing deterministic protocol idempotency keys.

## Required verification

- inline password rejection and password-env indirection;
- TLS/read-only select and `BODY.PEEK[]` behavior;
- no mailbox mutation command in the transport path;
- provenance secrecy;
- incremental UID cursor and CollectionPlan maxItems;
- UIDVALIDITY fail-closed;
- oversized message fail-before-cursor;
- private checkpoint mode;
- completion cursor advancement;
- finalized-session restart replay without duplicate RFC822 upload;
- same-UID changed-content restart rejection;
- Python compile/test gate plus full repository format/lint/typecheck/test/build.

## Non-goals

- outbound email;
- email flag/read-state synchronization;
- mailbox move/delete/archive automation;
- attachment fan-out in this work package;
- scheduler redesign;
- new RawArtifact storage architecture;
- automatic Staging/Vault publication;
- ReadyPackage changes;
- main-repository V2 consumer work.

## Next

Do not extend this historical Knowledge-owned transport path as the strategic email platform. Reuse its proven safety lessons in `K-CAP-COMM` and build new Expert Q&A over the shared Communication Capability.