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

The workflow requires both:

- `approval_ref`, which must exactly equal the canonical plan approval reference `github:yoomarks/markorbit-knowledge#405`;
- `confirm_live_provider_calls=true`.

The workflow fails unless it is dispatched from `main`. The selected exact commit SHA is preserved in the acceptance metadata.

## DeepSeek execution window

The production DeepSeek adapter uses `deepseek-v4-flash` and enforces the official off-peak policy before network transport. The workflow repeats this preflight before provider secrets are exposed to a step.

The blocked peak windows are Monday-Friday, Beijing time:

- 09:00-12:00
- 14:00-18:00

All other times, including weekends, are accepted by the standard ADK-06 runtime. Source: `https://api-docs.deepseek.com/zh-cn/quick_start/pricing/`.

Dispatch during a peak window is expected to fail before any paid DeepSeek or OpenAI request is made.

## Execution sequence

The workflow performs these steps in order:

1. checks out the exact `main` commit with persisted checkout credentials disabled;
2. installs the frozen workspace;
3. verifies the dispatch approval reference against the canonical plan and rechecks the frozen 3×2 assignment/provider authority;
4. performs the DeepSeek off-peak preflight before provider secrets are exposed;
5. fails closed unless both provider credentials and the independent evidence passphrase are configured;
6. copies the canonical plan byte-for-byte into a fresh runtime directory;
7. runs `adk:pilot:prepare` to create the authenticated SQLite/RawArtifact runtime and private Worker/Lease secret file;
8. runs `adk:pilot:live` with the real `deepseek-v4-flash` and OpenAI adapters;
9. requires all six cells to be `EXECUTED`;
10. requires six RawArtifact lineage records and twelve unique finalized RawArtifact receipts;
11. requires the authenticated execution attempt to complete;
12. creates a gzip-compressed evidence bundle containing the plan, receipts, metadata, SQLite database, and content-addressed RawArtifacts;
13. encrypts that bundle using AES-256-GCM with a key derived by `scrypt` from `ADK_LIVE_EVIDENCE_PASSPHRASE`;
14. immediately decrypts the encrypted envelope in memory and verifies its SHA-256 against the plaintext bundle before cleanup;
15. removes all plaintext runtime data, the plaintext archive, and transient Worker/Lease secret material;
16. uploads only the encrypted evidence envelope and a non-secret integrity manifest.

## Why the evidence is encrypted

`markorbit-knowledge` is a public repository. GitHub documents that workflow artifacts can be downloaded by users with repository read access. Therefore raw provider responses and the durable SQLite/RawArtifact evidence must not be uploaded as plaintext Actions artifacts.

Only these files are uploaded:

```text
adk-06-live-evidence.aesgcm
evidence-manifest.json
```

The manifest contains only repository/run identifiers, cipher/KDF metadata, encrypted byte size, and the encrypted file SHA-256. It does not contain provider responses, distilled Markdown, provider keys, Worker credentials, lease tokens, or the evidence passphrase.

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

## Acceptance boundary

Do not close issue #405 unless the actual manual workflow run succeeds and the decrypted evidence confirms:

- exactly six `EXECUTED` provider cells;
- exactly six acquisition/lineage records;
- exactly twelve finalized RawArtifact receipts;
- authenticated execution state `COMPLETED`;
- exact canonical pilot/approval/assignment/provider identities;
- no provider ranking;
- no legal-truth verification;
- no candidate auto-activation.

If a required secret is absent or invalid, execution is attempted during a blocked DeepSeek pricing window, any provider request fails, evidence is incomplete, encryption verification fails, or the authenticated artifact-backed execution cannot complete, the workflow must fail and issue #405 remains open.
