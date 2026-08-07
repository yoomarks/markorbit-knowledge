# Conversion Runtime Protocol v1

## 1. Context

Conversion Execution Protocol v1 locks `ConversionRun`, `ConversionExecutionEvent` and verified `StagingDocumentDescriptor` metadata, but it intentionally does not define who may execute a run, how work is exclusively claimed, or how input and output access is authorized. Conversion Runtime Protocol v1 fills that gap with protocol objects, guards and pure helpers only. It does not implement a runtime, API, persistence, scheduler, converter invocation or Markdown generation.

## 2. Existing ConversionRun baseline

A `ConversionRun` is the business-level conversion intent: it freezes workspace, source, raw artifact, input evidence, converter manifest/profile snapshots, exact converter version and requested output. It is not a Collection Job and must not be inserted into the Collection Job table or Job lease lifecycle.

## 3. Worker identity reuse decision

The protocol reuses the existing Worker identity, credential identity, heartbeat, health and desired-state model. It does not create a second Worker Registry. A Worker that wants conversion work publishes a separate `ConversionWorkerCapability` bound to the same `wrk_` identity.

## 4. Why Conversion leases remain separate from Job leases

Collection `JobLease` objects bind connector execution semantics. Conversion execution has different matching inputs, converter exact-version constraints, RawArtifact read grants, staging upload grants, attempts and verification handoff. Therefore `ConversionLease` and `ConversionAttempt` are independent objects while borrowing only generic lease concepts: exclusive ownership, token binding, generation, expiry, renewal window and reconciliation.

## 5. Capability model

`ConversionWorkerCapability` declares `converterId` plus exact semantic versions. Wildcards, `latest`, `any` and ranges are rejected unless a future protocol expands them into a verified exact-version list before registration. Capability matching also requires artifact kind, MIME pattern and requested output format compatibility. Capability metadata is bounded under `extensions` and cannot contain commands, scripts, shells, argv, executable paths, credentials, secrets, content bodies or arbitrary environment variables.

## 6. Claim model

Only an active Worker with a matching conversion capability may claim a PENDING `ConversionRun`. A `ConversionClaimRequest` includes Worker identity, credential identity, workspace, capability revision, supported exact converters, max accepted work, idempotency key and requested lease duration. A `ConversionClaimResult` is either `NO_COMPATIBLE_WORK` or exactly one `ConversionLease` with immutable execution summary, exact converter summary, bounded RawArtifact evidence and read/upload grant references. It never returns Source credentials, raw provider config, converter code, commands, RawArtifact bytes, Markdown, YAML or HTML.

## 7. Lease and Attempt relationship

A non-terminal `ConversionRun` may have at most one effective `ACTIVE` `ConversionLease`. The lease binds workspace, run, worker, attempt, exact converter, generation, issued/expiry/renewable timestamps and an opaque tokenReference/tokenDigest. Lease statuses are limited to `ACTIVE`, `RELEASED`, `EXPIRED` and `SUPERSEDED`; execution state remains on `ConversionRun` and `ConversionAttempt`. `ConversionAttempt` records one worker execution try with ordinal, started/ended timestamps, outcome, structured failure evidence and reconciliation evidence.

## 8. Token binding

Every lifecycle report binds Worker ID, Worker credential identity, ConversionRun ID, ConversionAttempt ID, ConversionLease ID, lease generation, lease tokenReference/tokenDigest, idempotency key and expected current run status. The control plane must reject reports for the wrong Worker, Attempt, lease, generation, tokenReference/tokenDigest, converter version, workspace, terminal run or stale expected status.

## 9. Runtime report authorization

| Transition            | Authorized actor            | Preconditions                                                   |
| --------------------- | --------------------------- | --------------------------------------------------------------- |
| PENDING → RUNNING     | leased Conversion Worker    | valid active lease, correct Worker, Attempt and exact Converter |
| RUNNING → RUNNING     | same Worker and Attempt     | valid lease, bounded progress                                   |
| RUNNING → VERIFYING   | same Worker and Attempt     | uploaded output metadata exists and is bound to grant           |
| RUNNING → FAILED      | same Worker or reconciler   | structured runtime failure                                      |
| VERIFYING → COMPLETED | control-plane verifier      | matching READY StagingDocumentDescriptor                        |
| VERIFYING → FAILED    | verifier or reconciler      | structured verification failure                                 |
| PENDING → CANCELLED   | administrator/control plane | no started Attempt                                              |

Rejected cases include wrong Worker, wrong Attempt, wrong lease, wrong generation, expired lease, superseded lease, wrong converter version, terminal Run, stale expected status and duplicate idempotency key with a different payload. Same idempotency key with identical payload is replay; different payload is conflict. Workers never receive authority to mark `COMPLETED`.

## 10. Input read grant

`RawArtifactReadGrant` authorizes one Worker/Attempt to read one RawArtifact for one ConversionRun in one workspace. It carries expected SHA-256, bytes, MIME, access reference, issuance/expiry, maximum reads, usage policy and tokenReference/tokenDigest. It cannot cross workspaces, browse arbitrary artifacts, read other artifacts or store bearer token values in events. Digest, size and MIME must match frozen run input evidence.

## 11. Output upload grant

`StagingOutputUploadGrant` authorizes one Worker/Attempt to upload one `text/markdown` object to one normalized relative `.md` target path. It includes max bytes, digest algorithm, upload session reference, expiry, tokenReference/tokenDigest, content count and provenance policy. Absolute paths, traversal, Vault-root paths and non-`.md` paths are rejected. The Worker cannot write the Obsidian Vault, cannot create a READY StagingDocument and cannot mark verification passed. Upload success is only evidence for control-plane verification.

## 12. Verification authority

Final `COMPLETED` belongs to a control-plane verifier that validates READY `StagingDocumentDescriptor` evidence: digest, size, normalized path, frontmatter schema, provenance, converter identity and Attempt/Run binding. An expired Worker lease does not block verifier-owned continuation after a fully bound output has entered `VERIFYING`, but it does block new Worker reports.

## 13. Lease-loss semantics

Before STARTED, a lost lease may abandon/expire the Attempt and keep or return the Run to PENDING only with reconciliation evidence. After STARTED, a lost lease must fail the Run with structured code `LEASE_EXPIRED_DURING_CONVERSION`; it must not silently return to PENDING, auto-claim, auto-retry or delete Attempt evidence. Superseded leases classify separately. During VERIFYING, authority has moved to the verifier for already-bound output.

## 14. Fixture runtime boundary

A future `builtin-text-markdown@1.0.0` fixture converter may be added only as fixed built-in code with no network, browser, shell, child process, dynamic code loading, arbitrary plugins or Core invocation. It may read only through `RawArtifactReadGrant`, accept limited text/plain input, produce deterministic bounded output with reproducible SHA-256, upload only through `StagingOutputUploadGrant`, and follow the same lease/Attempt/report protocol. This protocol does not implement that converter.

## 15. Security boundary

Lease, Attempt, heartbeat, grants and reports are metadata-only. They must not embed RawArtifact bytes, Markdown, YAML, HTML body, base64, binary, cookies, credentials, secret values, shell, commands, scripts, executables, argv or arbitrary environment variables. Unknown top-level and nested fields are rejected; provider metadata uses bounded `extensions` with `x-` namespaced keys.

## 16. Deferred implementation

Deferred: persistence, migrations, claim APIs, report APIs, runtime execution, fixture converter execution, RawArtifact download service, staging upload service, staging CAS/registry, scheduler, retry/dead-letter, OCR, PDF/DOCX parsing, browser/Crawl4AI, Obsidian integration, Ready Package and MarkOrbit Core semantics.

## 17. Non-goals

This protocol does not modify Conversion Execution Protocol v1, Collection Job leases, Worker heartbeat behavior, ConversionRun ledger behavior or any database migration. It defines types, guards, fixtures, tests and documentation only.
