# ADK-06 durable encrypted-evidence retention

Parent acceptance: #405  
Governance gate: #429  
Retention-handoff issue: #693

This runbook defines the final durable-retention handoff for a successful ADK-06 live 3×2 provider acceptance. It does not authorize a provider call and does not select a storage provider on behalf of the repository owner.

## Purpose

The live workflow already produces an encrypted evidence pair after a real run:

- `adk-06-live-evidence.aesgcm`
- `evidence-manifest.json`

GitHub Actions retains that pair for 90 days as a recovery window. That temporary artifact is not the final archive required by #405 and #429.

Final closeout requires the same encrypted object and its manifest to be copied to an owner-authorized, non-public, durable storage destination and verified there without decrypting provider evidence in public automation or issue comments.

## Source artifact contract

The authoritative source for the handoff is the artifact emitted by `.github/workflows/adk-live-provider-acceptance.yml` for the successful workflow run.

The encrypted object uses the workflow envelope identifier `MOADKAE1`, AES-256-GCM, and an scrypt-derived key. The passphrase is not part of this retention record and must remain secret.

The public-safe `evidence-manifest.json` records at minimum:

- `objectType = ADK_LIVE_PROVIDER_ENCRYPTED_EVIDENCE_MANIFEST`;
- `protocolVersion`;
- repository;
- `commitSha` and `expectedCommitSha`;
- `workflowRunId` and attempt;
- optional resumed run id;
- issue number;
- live run id;
- durable-cell count;
- whether an in-flight cell requires reconciliation;
- acceptance status;
- cipher/KDF/envelope identifiers;
- encrypted SHA-256;
- encrypted byte size;
- recorded timestamp.

Do not create a replacement manifest by hand when the workflow-generated manifest exists.

## Eligible durable destination

The repository owner must explicitly authorize the final destination. The destination must satisfy all of the following:

- non-public access by default;
- access controlled independently from the public Knowledge repository;
- intended long-term retention beyond the 90-day Actions recovery window;
- capable of preserving the encrypted object without content rewriting;
- capable of preserving the manifest as a separate exact file;
- capable of returning or re-reading the stored encrypted bytes for SHA-256 verification;
- no public anonymous link is required for #405/#429 evidence.

A public GitHub issue, PR attachment, repository commit, public release asset, or other publicly retrievable location is not an eligible final destination.

## Copy and verify procedure

After #405 has one successful accepted workflow run:

1. Identify the successful workflow run id and frozen `commitSha`.
2. Obtain the workflow artifact named `adk-06-live-acceptance-encrypted-<workflowRunId>`.
3. Keep only the encrypted evidence object and workflow-generated manifest for the durable handoff; do not publish decrypted contents.
4. Verify locally that the encrypted file SHA-256 exactly equals `evidence-manifest.json.encryptedSha256` and that byte size equals `encryptedSizeBytes`.
5. Verify `commitSha === expectedCommitSha` and that both equal the exact main SHA authorized for that run.
6. Verify `issue === 405`, `accepted === true`, `durableCells === 6`, and `inFlightRequiresReconciliation === false`.
7. Copy both exact files to the owner-authorized non-public durable destination.
8. Re-read the archived encrypted object from the durable destination and recompute SHA-256. It must still equal the manifest's `encryptedSha256`.
9. Re-read the archived manifest and verify it is byte-for-byte identical to the workflow-generated manifest.
10. Record a public-safe retention attestation on #405 and #429 using the fields below. Do not post the evidence passphrase, provider credentials, decrypted content, private signed URLs, storage credentials, or raw provider responses.

If any verification fails, do not close #405 or #429. Preserve the Actions artifact for recovery and investigate before copying or replacing evidence.

## Public-safe retention attestation

The issue comment may record only non-secret metadata sufficient to prove the handoff occurred. Use this structure conceptually; it is not a repository credential format:

```text
ADK-06 durable retention verified
workflowRunId: <run id>
workflowRunAttempt: <attempt>
commitSha: <40-char SHA>
approvalRef: github:yoomarks/markorbit-knowledge#405
runId: <live run id>
encryptedSha256: <64-char SHA-256>
encryptedSizeBytes: <integer>
durableCells: 6
accepted: true
retentionClass: OWNER_AUTHORIZED_NON_PUBLIC_DURABLE
retentionRef: <non-secret opaque reference only>
archivedAt: <ISO-8601 timestamp>
archiveReadbackVerified: true
```

`retentionRef` must be an opaque non-secret logical reference. Do not post a private signed download URL, bucket credential, access token, local filesystem secret, or anything that grants access to the archive.

## Closeout rules

### #405

#405 may close only after all live acceptance requirements are satisfied and the final successful encrypted evidence pair has passed the durable copy/readback verification above.

A successful provider workflow whose only surviving copy is the temporary Actions artifact is not final acceptance.

### #429

Repository/ruleset/workflow governance may already be satisfied independently. #429's remaining durable-retention gate is complete only when the same successful #405 encrypted evidence pair is present in the owner-authorized non-public durable destination and the public-safe retention attestation has been recorded.

## Failure and replay boundary

- Never re-run a paid cell solely because archival copying failed after a successful durable provider execution.
- If the successful workflow evidence still exists in Actions, archive that exact encrypted pair instead of executing providers again.
- If a prior run is partial or has `inFlightRequiresReconciliation=true`, do not represent it as final acceptance and do not use its durable archive as #405 closeout evidence.
- Resume only through the existing guarded ADK-06 workflow semantics after reconciliation; already durable cells must not be paid/executed again merely to simplify retention.

## Security boundary

The durable archive contains encrypted production evidence. Encryption does not make the archive public-safe. Treat the encrypted object, manifest, archive reference, evidence passphrase, and access-control configuration according to least-privilege operational policy.

This runbook never requires the evidence passphrase to be posted to GitHub, stored in the manifest, or supplied to a public verification step. Final archive verification is based on the encrypted object's SHA-256 and byte identity, so the retention handoff can be proven without decrypting provider evidence.
