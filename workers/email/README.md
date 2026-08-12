# Email Worker

`workers/email/email_worker.py` is the production read-only IMAP acquisition Worker for MarkOrbit Knowledge.

It uses the existing Worker Protocol and never opens the Knowledge SQLite database. Mail transport is evidence acquisition only: the Worker does not send mail, delete messages, move messages, mark messages read, change flags, or expunge a mailbox.

## Governed path

```text
EMAIL SourceDefinition
-> CollectionPlan
-> CollectionRun + EMAIL_IMPORT Job
-> Worker heartbeat + lease claim
-> read-only IMAP select + UID search
-> BODY.PEEK[] RFC822 fetch
-> controlled execution START / UPLOADING
-> ArtifactIngestionSession per message
-> SHA-256/size verification + CAS
-> immutable EMAIL RawArtifact
-> VERIFYING / artifact-backed execution receipt / COMPLETE
-> local operational UID cursor advances only after COMPLETE
```

## Account binding

Credentials are Worker-host configuration, not SourceDefinition data. Configure account metadata with an environment-variable indirection for the password:

```bash
export MARKORBIT_EMAIL_ACCOUNTS_JSON='{
  "legal-inbox": {
    "host": "imap.example.com",
    "port": 993,
    "username": "legal@example.com",
    "passwordEnv": "IMAP_LEGAL_PASSWORD"
  }
}'
export IMAP_LEGAL_PASSWORD='...'
```

Inline `password` fields are rejected. TLS certificate verification is mandatory through Python's default SSL context; an optional `caFile` may point to an additional trusted CA bundle on the Worker host.

A governed source references only the binding ID and mailbox:

```json
{
  "sourceType": "EMAIL",
  "connector": { "connectorId": "imap-email", "version": "1.0.0" },
  "connectorConfig": {
    "accountBindingId": "legal-inbox",
    "mailbox": "INBOX",
    "initialUid": 1
  }
}
```

## Read-only boundary

The Worker always selects with `readonly=True` and fetches message bytes with `BODY.PEEK[]`. There is no implementation for `STORE`, message flag mutation, `COPY`, `MOVE`, `DELETE`, `APPEND`, or `EXPUNGE`.

Each RawArtifact gets a provenance identity of the form:

```text
imap-message://<binding-id>/<mailbox>/<UIDVALIDITY>/<UID>
```

The real host, username and password are not written to RawArtifact provenance.

## Incremental cursor

The Worker stores an operational cursor per `(Source, account binding, mailbox)` in its private state file. The cursor records only `UIDVALIDITY` and the highest UID that was durably completed.

The cursor advances **after** the Knowledge execution `COMPLETE` response succeeds. If upload/finalization/completion fails, the cursor does not advance. An IMAP `UIDVALIDITY` change fails closed and requires operator review/reset instead of assuming old UIDs still identify the same messages.

A first run begins at `initialUid` (default `1`). A run with no messages leaves the prior cursor unchanged so a non-default `initialUid` is preserved on later retries.

## Restart / replay

Before starting controlled execution, the Worker persists a private `0600` state checkpoint containing:

- exact Job/lease evidence;
- lease token;
- binding ID + mailbox + UIDVALIDITY;
- each selected UID's SHA-256 and size;
- finalized ArtifactIngestionReceipt IDs.

On restart it re-fetches each checkpointed UID with `BODY.PEEK[]` and requires the exact SHA-256/size to match. It then reuses deterministic execution and ArtifactIngestionSession idempotency keys. A finalized session is replayed without uploading RFC822 bytes again. Changed content or UIDVALIDITY fails closed.

## Bounds

- hard maximum: 50 messages per Job;
- hard maximum: 25 MiB per RFC822 message;
- CollectionPlan `maxItems` may lower the batch size;
- an oversized selected message fails the Job before the cursor advances rather than silently skipping evidence.

## Worker registration

Register `imap-email@1.0.0` through the existing Connector Registry and provision a normal Worker Definition with:

```text
supportedJobTypes: EMAIL_IMPORT
connector binding: imap-email@1.0.0 / COLLECT
```

Required runtime environment:

```bash
export MARKORBIT_KNOWLEDGE_URL='http://127.0.0.1:3000'
export MARKORBIT_WORKER_ID='wrk_...'
export MARKORBIT_WORKER_CREDENTIAL='mwk_...'
export MARKORBIT_EMAIL_ACCOUNTS_JSON='...'
export IMAP_LEGAL_PASSWORD='...'
```

Optional:

```bash
export MARKORBIT_EMAIL_STATE_PATH='/var/lib/markorbit/email-worker-state.json'
export MARKORBIT_EMAIL_MAX_MESSAGE_BYTES='26214400'
```

Run one claim:

```bash
python workers/email/email_worker.py --once
```

Continuous polling:

```bash
python workers/email/email_worker.py --poll-seconds 10
```
