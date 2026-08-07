# Controlled Fixture Text-to-Markdown Runtime

## Scope

TASK-016 introduces the first executable Conversion fixture: `builtin-text-markdown@1.0.0`.

It is intentionally narrow. The fixture accepts only grant-bound UTF-8 `text/plain`, produces deterministic `text/markdown`, uploads only through a `StagingOutputUploadGrant`, and reports lifecycle evidence through the authenticated Conversion Runtime boundary created by TASK-015.

## Security boundary

The fixture uses fixed in-process code. It has:

- no network access;
- no browser;
- no shell or child process;
- no dynamic code loading;
- no arbitrary plugins;
- no environment injection;
- no direct Vault write;
- no OCR, PDF or DOCX parsing;
- no MarkOrbit Core invocation.

The runtime receives content only through `FixtureRawArtifactReader` using a scoped `RawArtifactReadGrant`. It emits content only through `FixtureStagingUploader` using a scoped `StagingOutputUploadGrant`.

## Exact Converter binding

Execution is authorized only when the Context, Lease and frozen Run all resolve to:

```text
builtin-text-markdown@1.0.0
```

Wildcard, range and alternative Converter identities are rejected.

## Input validation

The fixture validates before conversion:

- Workspace, Worker, Run and Attempt grant scope;
- ACTIVE lease;
- `text/plain` MIME;
- expected input byte count;
- expected SHA-256;
- bounded input size;
- valid UTF-8.

CRLF and lone CR line endings are normalized to LF. A UTF-8 BOM is removed.

## Deterministic output

The output contains stable YAML-compatible frontmatter with frozen provenance:

- Workspace;
- Source;
- RawArtifact;
- ConversionRun;
- ConversionAttempt;
- exact Converter ID/version;
- input SHA-256.

The body is the normalized source text. The output always ends with one newline. No wall-clock timestamp or random value is included, so the same frozen Context and bytes produce the same Markdown and SHA-256.

## Runtime lifecycle

The executor emits:

1. STARTED;
2. bounded progress at input read;
3. bounded progress before upload;
4. output-ready evidence bound to the upload grant.

It does not emit COMPLETED. Verification and completion remain control-plane responsibilities. A later Staging verifier must match the uploaded digest, size, path and frozen provenance before completing the ConversionRun.

A controlled failure produces a structured non-retryable failed report. TASK-016 does not create automatic retry.

## Deferred work

Deferred: production RawArtifact delivery, production Staging CAS/upload service, generalized Converter plugins, scheduling, automatic claim loops, retry/dead-letter, Obsidian adapter, Ready Package and MarkOrbit Core semantics.
