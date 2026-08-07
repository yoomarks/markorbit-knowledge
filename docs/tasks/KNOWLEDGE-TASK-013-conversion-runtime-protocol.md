# KNOWLEDGE-TASK-013 — Conversion Runtime Authorization & Lease Protocol v1

## Objective

Define Conversion Runtime identity, capability, claim, exclusive lease, attempt, lifecycle report authorization, RawArtifact input grants, staging output grants and lease-loss semantics as contracts, guards, helpers, fixtures/tests and documentation only.

## Baseline

Local accepted baseline is `/workspace/MarkOrbit-Knowledge` at `5ba0bd16a18ff7f2a8f10a21450115b5cc25399a`, the Merge PR #41 baseline for `whalemarks/MarkOrbit-Knowledge`. External Validate and UI Preview checks for PR #41 were confirmed successful by the requester.

## Scope

Add `@markorbit/contracts` Conversion Runtime Protocol v1 constants, types, strict guards, exact converter helpers, lease/report/grant authorization helpers, fixtures/tests, architecture document, ADR and README status/index updates.

## Protocol objects

- `ConversionWorkerCapability`
- `ConversionLease`
- `ConversionAttempt`
- `ConversionClaimRequest`
- `ConversionClaimResult`
- lifecycle reports and lease renewal/release/loss messages
- `RawArtifactReadGrant`
- `StagingOutputUploadGrant`

## Authorization

Workers reuse existing Worker identity and credentials but need separate conversion capability. Claims require exact converter version, artifact kind, MIME and output compatibility. Reports must bind Worker, credential, Run, Attempt, Lease, generation, token and expected status. Worker `COMPLETED` authority is explicitly excluded.

## Lease-loss semantics

Lost before STARTED is reclaimable only with reconciliation evidence. Lost after STARTED requires structured failure `LEASE_EXPIRED_DURING_CONVERSION` and no automatic retry. During VERIFYING, verifier-owned continuation may proceed for already-bound output while Worker reports are rejected.

## Tests

Contract tests cover valid/invalid capability, lease, claim, reports, read grants, upload grants, lease-loss classification, idempotency replay/conflict and verifier-only completion helpers.

## Acceptance criteria

- Strict guards reject unknown fields, secret/executable/content-bearing fields, wildcard converter versions and invalid grants.
- Exact converter binding is enforced.
- One active lease per Run is modeled.
- Runtime reports are lease-token-bound.
- Input/output access uses grants only.
- README links the locked protocol and states converter execution is not implemented.

## Non-goals

No persistence, migrations, claim API, runtime report API, converter execution, fixture converter execution, Markdown/YAML generation, RawArtifact download runtime, staging upload runtime, staging CAS/registry, scheduler, retry, Obsidian, Ready Package or MarkOrbit Core semantics.

## TASK-013A audit matrix

The review hardening pass audited all protocol roots and helpers: `ConversionWorkerCapability`, `ConversionLease`, `ConversionAttempt`, `ConversionClaimRequest`, `ConversionClaimResult`, all runtime reports, lease renewal/release/loss messages, `RawArtifactReadGrant`, `StagingOutputUploadGrant`, exact converter matching, lease/report authorization, grant scope, lease-loss, idempotency and verifier completion helpers.

Audit conclusions:

- Root and nested unknown fields are rejected by strict object key allowlists.
- Arrays and `null` cannot masquerade as objects because object guards require non-array records.
- Typed IDs are validated for Workspace, Worker, ConversionRun, ConversionAttempt, ConversionLease, RawArtifact and grant prefixes.
- RFC3339 timestamps and lease ordering are checked; lease close timestamps must match terminal lease states.
- Free strings, arrays, metadata keys, metadata values, converter lists, versions, MIME patterns, output formats, references and payloads have bounded limits in contract constants.
- Secret, credential, executable, command, shell, script, argv, environment and content-bearing fields are recursively rejected.
- Markdown, YAML, HTML, body, content, binary and Base64 evidence cannot be embedded in canonical lease/report/grant payloads.
- Canonical lease and grant evidence contains only `tokenReference` plus `tokenDigest`; plaintext `token`, bearer, access-token, credential and secret fields are rejected.
- Converter versions must be exact semantic versions; wildcard, latest, any, ranges, caret, tilde, comparison and duplicates are rejected.
- Worker identity is reused, but Conversion capability, lease, attempt and runtime reports remain separate from Collection Job lease semantics.
- Worker reports output metadata only; verifier completion requires READY descriptor evidence and verifier identity.
- Lease loss before STARTED is reclaimable with evidence; after STARTED fails the run; VERIFYING continuation belongs to the verifier; no automatic retry is introduced.
