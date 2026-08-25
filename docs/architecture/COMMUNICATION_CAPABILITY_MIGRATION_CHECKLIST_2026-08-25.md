# Communication Capability Migration Checklist — 2026-08-25

Status: **K-CAP-COMM-002 complete on Knowledge side**

Source audited: legacy production read-only IMAP worker in `workers/email/email_worker.py` and its production-ingestion documentation.

The goal is not to copy the old worker into Core. The goal is to preserve the safety properties that have already been proven while moving generic email transport ownership to a shared Communication Capability.

## Proven safety properties to retain

### Transport and authentication

- [x] TLS via the platform default trust store; optional explicit CA file only.
- [x] Credentials are worker/runtime secrets, not SourceDefinition data.
- [x] Account configuration stores a `passwordEnv` indirection instead of the secret value.
- [x] Inline/unknown credential fields are rejected.
- [x] Provider host/username/password are not written into Knowledge RawArtifact provenance.

### Read-only inbound semantics

- [x] IMAP mailbox is selected with `readonly=True`.
- [x] Message retrieval uses `BODY.PEEK[]` so fetch does not mark a message read.
- [x] No `STORE`, flag mutation, `COPY`, `MOVE`, `DELETE`, `APPEND`, or `EXPUNGE` authority exists in the legacy inbound path.

The shared Communication Capability may later own explicitly authorized outbound send operations, but inbound synchronization must not accidentally inherit mailbox-mutation authority.

### Stable mailbox identity

- [x] Cursor identity is scoped to source + account binding + mailbox.
- [x] IMAP UID is never trusted without UIDVALIDITY.
- [x] UIDVALIDITY changes fail closed and require operator review/reset.
- [x] First-run `initialUid` is explicit and restart behavior preserves it.

### Cursor durability

- [x] Cursor advances only after downstream controlled execution reaches `COMPLETE`.
- [x] Oversized or malformed selected messages fail before cursor advancement.
- [x] Empty polls do not create a false successful advancement.

For the shared capability, the equivalent rule is: a sync cursor must not advance past a message until the capability has durably emitted/reused the canonical message identity required by its consumer contract.

### Restart and idempotency

- [x] Private inflight checkpoint is written before processing continues.
- [x] Checkpoint file is written atomically and permissioned `0600`.
- [x] Exact UID, SHA-256 and byte size are captured for replay.
- [x] Restart re-fetches the exact UID and requires the same hash/size.
- [x] Same UID with changed bytes fails closed.
- [x] Deterministic idempotency keys are reused on replay.
- [x] Already-finalized artifact sessions are reused instead of uploading RFC822 bytes twice.

Shared Communication V1 must preserve the same behavior at the message/correlation layer: repeated sync or process restart must not emit duplicate canonical messages or duplicate outbound sends.

### Evidence boundary

- [x] Full RFC822 bytes are treated as immutable source evidence.
- [x] SHA-256 and byte size are verified before finalization.
- [x] A stable provenance URI includes binding/mailbox/UIDVALIDITY/UID without exposing host credentials.
- [x] Evidence is handed into the existing immutable RawArtifact/CAS path rather than a second persistence architecture.

## Gaps in the legacy worker that the shared capability must add

The old worker intentionally does **not** solve these shared Communication requirements:

- [ ] outbound send request and stable send-request id;
- [ ] duplicate-send prevention after timeout/restart;
- [ ] provider-native message id;
- [ ] stable thread/correlation id;
- [ ] RFC `Message-ID`, `In-Reply-To`, and `References` correlation where applicable;
- [ ] inbound/outbound direction;
- [ ] sender/recipient/subject/body normalized envelope while retaining original evidence;
- [ ] attachment identity and durable attachment references;
- [ ] reply-to-sent-message correlation;
- [ ] delivery/sent/failed/uncertain state;
- [ ] provider sync cursor separate from Knowledge ingestion cursor;
- [ ] explicit account binding contract reusable by Core/MarkReg/Knowledge;
- [ ] provider-specific metadata kept opaque outside the Capability boundary.

Legacy K-EXT-C explicitly deferred outbound email and attachment fan-out; those omissions must not be mistaken for an implemented shared mail platform.

## Minimum shared Communication V1 acceptance checklist

### Account binding

- [ ] consumer refers to an account binding; no consumer-owned secret value;
- [ ] provider credential stays inside shared runtime;
- [ ] account binding can support more than Knowledge without Knowledge fields.

### Outbound

- [ ] caller supplies a stable `sendRequestId`;
- [ ] repeated identical request is idempotent;
- [ ] ambiguous transport outcome is represented, not blindly replayed;
- [ ] returned provider/message/thread IDs are stored when available;
- [ ] attachments are referenced, bounded, and not silently dropped.

### Inbound

- [ ] stable canonical message identity;
- [ ] UID + UIDVALIDITY (or provider equivalent) respected;
- [ ] restart-safe cursor;
- [ ] exact original message evidence retained or referencable;
- [ ] normalized message is derivative, not replacement evidence;
- [ ] replay emits/reuses the same canonical message identity.

### Thread correlation

- [ ] replies correlate to outbound questions through provider/thread/RFC evidence;
- [ ] multiple follow-ups stay in one Knowledge Expert task when appropriate;
- [ ] correlation failure is explicit and reviewable instead of guessed.

### Attachments

- [ ] stable attachment ref;
- [ ] attachment hash/size/content type when available;
- [ ] source message relationship;
- [ ] no attachment loss between provider capture and Knowledge source record.

## Knowledge migration rule

New Expert workflows must consume shared Communication once it exists. The legacy IMAP worker remains compatibility code only; no new strategic transport behavior should be added to it.

Knowledge owns:

- `ExpertQuestionTaskV1`;
- `ExpertSourceRecordV1`;
- objective source/evidence capture;
- Knowledge-specific retrieval/provenance.

Shared Communication owns:

- account binding;
- send;
- inbound sync;
- message/thread/attachment identity;
- transport/delivery state;
- cursor/provider metadata;
- credential boundary.
