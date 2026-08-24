# ADK-06 GitHub Live Provider Acceptance

Status: operational path for issue #405. A successful manual run is real external-provider evidence; ordinary PR/CI runs are not.

## Purpose

`.github/workflows/adk-live-provider-acceptance.yml` provides a manual, fail-closed execution path for the frozen ADK-06 3×2 acceptance. It never runs on push or pull request events.

The workflow uses the canonical repository plan at `config/adk-live-pilot-us-trademark-3x2.json` and does not generate or mutate a plan at dispatch time. That plan freezes:

- `kas_us_trademark_filing`
- `kas_us_trademark_section_8`
- `kas_us_trademark_ttab`
- provider order `DEEPSEEK`, `OPENAI`
- approval reference `github:yoomarks/markorbit-knowledge#405`
- `liveProviderCallsAuthorized: true`

## Required repository secrets

Configure all three GitHub Actions repository secrets before dispatching the workflow:

```text
DEEPSEEK_API_KEY
OPENAI_API_KEY
ADK_LIVE_EVIDENCE_PASSPHRASE
```

The evidence passphrase must contain at least 32 characters and must be independent from both provider credentials. Never reuse a provider API key as the evidence passphrase.

Never place any of these values in workflow inputs, issue comments, PR comments, plan JSON, artifacts, command-line arguments, RawArtifact metadata, or logs.

The workflow checks only whether the provider credentials are present and whether the evidence passphrase satisfies the minimum length. It does not print any secret value.

## Manual authorization inputs

The workflow requires:

- `approval_ref`, which must exactly equal the canonical plan approval reference `github:yoomarks/markorbit-knowledge#405`;
- `confirm_live_provider_calls=true`;
- optional `resume_run_id`, containing only the numeric Actions run id of an earlier ADK-06 live workflow whose encrypted partial runtime should be resumed.

The workflow fails unless it is dispatched from `main`. The selected exact commit SHA is preserved in the evidence metadata.

## DeepSeek execution window

The production DeepSeek adapter uses `deepseek-v4-flash` and enforces the official off-peak policy before network transport. The workflow repeats this preflight before provider secrets are exposed to a step.

The blocked peak windows are Monday-Friday, Beijing time:

- 09:00-12:00
- 14:00-18:00

All other times, including weekends, are accepted by the standard ADK-06 runtime. Source: `https://api-docs.deepseek.com/zh-cn/quick_start/pricing/`.

Dispatch during a peak window is expected to fail before any paid DeepSeek or OpenAI request is made.

## Durable per-cell checkpoint

The live runner no longer waits for all six provider calls before persisting evidence. It processes the frozen cells in assignment/provider order and, after each successful real provider call, immediately finalizes the exact provider JSON and its Markdown derivative through the authenticated RawArtifact lifecycle. Only after both artifacts are durable does it append a `DURABLE` cell to `live-checkpoint.json`.

Before each provider call the runner writes an `inFlight` marker. The marker is removed only after the provider result has either failed in a way that is known to be retryable without a successful response, or the successful acquisition has been durably persisted and checkpointed.

This creates three important recovery rules:

1. a later provider failure does not discard earlier paid provider results;
2. a resumed run verifies every checkpointed RawArtifact and receipt before skipping that provider cell;
3. a network timeout, network error, process crash, or persistence uncertainty leaves an unresolved in-flight boundary and **blocks automatic provider replay** until reconciliation, rather than risking a duplicate paid call.

A partial checkpoint never satisfies #405. It is recovery evidence only.

## Resuming a failed workflow run

A failed live execution that reached runtime creation still encrypts and uploads its partial runtime. The encrypted bundle contains the SQLite database, content-addressed RawArtifacts, `live-checkpoint.json`, and the Worker/Lease runtime secret. The runtime secret is never uploaded in plaintext; it exists only inside the AES-GCM encrypted envelope.

To resume a safely retryable partial run:

1. dispatch `ADK-06 Live Provider Acceptance` again from `main` during a DeepSeek off-peak window;
2. keep `approval_ref=github:yoomarks/markorbit-knowledge#405` and `confirm_live_provider_calls=true`;
3. set `resume_run_id` to the numeric prior workflow run id;
4. use the same `ADK_LIVE_EVIDENCE_PASSPHRASE` so the prior encrypted envelope can be authenticated and decrypted;
5. keep both provider credentials available as runtime-only repository secrets.

The workflow downloads only the named encrypted artifact from the specified run, verifies its encrypted SHA-256 against the manifest, authenticates/decrypts it, compares the restored plan byte-for-byte with the current canonical plan, rewrites only runner-local absolute paths in the restored runtime secret, and then invokes the resumable live runner.

If the restored checkpoint contains `inFlight`, the runner fails before any provider adapter is called. That is intentional: the prior delivery outcome is ambiguous and requires operator reconciliation rather than automatic replay.

## Execution sequence

For a fresh run the workflow performs these steps:

1. checks out the exact `main` commit with persisted checkout credentials disabled;
2. installs the frozen workspace;
3. verifies the dispatch approval reference against the canonical plan and rechecks the frozen 3×2 assignment/provider authority;
4. performs the DeepSeek off-peak preflight before provider secrets are exposed;
5. fails closed unless both provider credentials and the independent evidence passphrase are configured;
6. copies the canonical plan byte-for-byte into a fresh runtime directory;
7. runs `adk:pilot:prepare` to create the authenticated SQLite/RawArtifact runtime and private Worker/Lease secret file;
8. runs `adk:pilot:live`; each successful cell is persisted and checkpointed before another paid provider call begins;
9. requires all six cells to be durably `EXECUTED`;
10. requires six RawArtifact lineage records and twelve unique finalized RawArtifact receipts;
11. requires the authenticated execution attempt to complete;
12. records success or partial checkpoint metadata;
13. creates a gzip-compressed evidence bundle containing the plan, checkpoint, receipts when present, runtime secret, metadata, SQLite database, and content-addressed RawArtifacts;
14. encrypts that bundle using AES-256-GCM with a key derived by `scrypt` from `ADK_LIVE_EVIDENCE_PASSPHRASE`;
15. immediately decrypts the encrypted envelope in memory and verifies its SHA-256 against the plaintext bundle before cleanup;
16. removes all plaintext runtime data and plaintext archives;
17. uploads only the encrypted evidence envelope and a non-secret integrity manifest, on both successful and resumable failed runs.

A resume follows the same authority and off-peak checks, but decrypts the selected prior run instead of creating a new runtime and then skips only cells whose durable evidence verifies successfully.

## Why the evidence is encrypted

`markorbit-knowledge` is a public repository. Raw provider responses, the durable SQLite/RawArtifact evidence, and the resumable Worker/Lease secret must not be uploaded as plaintext Actions artifacts.

Only these files are uploaded:

```text
adk-06-live-evidence.aesgcm
evidence-manifest.json
```

The manifest contains only repository/run identifiers, resumability state, cipher/KDF metadata, encrypted byte size, and the encrypted file SHA-256. It does not contain provider responses, distilled Markdown, provider keys, Worker credentials, lease tokens, or the evidence passphrase.

## Encrypted envelope format

`adk-06-live-evidence.aesgcm` uses this binary layout:

```text
8 bytes   ASCII magic: MOADKAE1
16 bytes  random scrypt salt
12 bytes  random AES-GCM IV
16 bytes  AES-GCM authentication tag
remaining AES-256-GCM ciphertext of the tar.gz evidence bundle
```

The AES key is `scrypt(passphrase, salt, 32 bytes)` using Node.js defaults. The passphrase is never written to the envelope or manifest.

## Decryption

Download both artifact files in an authorized operator environment and expose the same repository secret value only as a local runtime environment variable:

```text
ADK_LIVE_EVIDENCE_PASSPHRASE
```

Then decrypt with Node.js without putting the passphrase on the command line:

```bash
INPUT_PATH=adk-06-live-evidence.aesgcm \
OUTPUT_PATH=adk-06-live-evidence.tar.gz \
node <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");

const passphrase = process.env.ADK_LIVE_EVIDENCE_PASSPHRASE;
if (!passphrase) throw new Error("ADK_LIVE_EVIDENCE_PASSPHRASE is required");
const envelope = fs.readFileSync(process.env.INPUT_PATH);
if (envelope.subarray(0, 8).toString("utf8") !== "MOADKAE1") {
  throw new Error("invalid ADK evidence envelope");
}
const salt = envelope.subarray(8, 24);
const iv = envelope.subarray(24, 36);
const tag = envelope.subarray(36, 52);
const ciphertext = envelope.subarray(52);
const key = crypto.scryptSync(passphrase, salt, 32);
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);
const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
fs.writeFileSync(process.env.OUTPUT_PATH, plaintext, { flag: "wx", mode: 0o600 });
NODE
```

Before decrypting, compare the encrypted file SHA-256 with `evidence-manifest.json`. A wrong passphrase or modified ciphertext fails AES-GCM authentication.

Because a resumable bundle contains the Worker/Lease runtime secret inside the ciphertext, treat decrypted output as sensitive operational material and remove it after reconciliation or acceptance.

## Acceptance boundary

Do not close issue #405 unless the actual manual workflow run succeeds and the decrypted evidence confirms:

- exactly six durable `EXECUTED` provider cells;
- exactly six acquisition/lineage records;
- exactly twelve finalized RawArtifact receipts;
- no unresolved `inFlight` cell;
- authenticated execution state `COMPLETED`;
- exact canonical pilot/approval/assignment/provider identities;
- no provider ranking;
- no legal-truth verification;
- no candidate auto-activation.

If a required secret is absent or invalid, execution is attempted during a blocked DeepSeek pricing window, evidence is incomplete, encryption verification fails, the authenticated artifact-backed execution cannot complete, or a provider/persistence outcome is ambiguous, the workflow must fail and issue #405 remains open.
