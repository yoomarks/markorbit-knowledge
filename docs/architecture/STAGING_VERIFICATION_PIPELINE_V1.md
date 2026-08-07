# Staging Verification Pipeline v1

## Scope

TASK-018 adds a deterministic, control-plane-owned verification step for immutable Markdown already registered by TASK-017.

The verifier reads bytes through the Staging Content Registry, checks immutable CAS evidence, parses a bounded frontmatter subset, compares provenance with persisted control-plane records, stores append-only verification evidence and changes a Staging document from `GENERATED` to either `READY` or `BLOCKED`.

It does not complete the ConversionRun, execute a Converter, schedule work, retry failures, write an Obsidian Vault, publish a Ready Package or perform semantic/AI analysis.

The v1 implementation is intentionally limited to deterministic structural and provenance verification.

## Verifier identity

The only v1 verifier is:

```text
builtin-staging-verifier@1.0.0
```

The verifier is a control-plane component. Worker identity, Worker credentials and Conversion lease tokens do not authorize verification decisions.

## Migration 0013

Migration `0013_staging_verification_pipeline` adds:

- `staging_document_verifications`, one append-only terminal decision per Staging document;
- `staging_verification_idempotency`, scoped by Workspace, document, verifier identity/version and idempotency key;
- an index for Workspace verification history.

The verification evidence insert and Staging descriptor update occur in one SQLite transaction.

## Parser subset and limits

The parser accepts only a bounded YAML-like subset:

- STRING;
- NUMBER;
- BOOLEAN;
- DATE;
- STRING_LIST;
- NULL;
- one bounded nested map level needed by the built-in fixture `markorbit` metadata.

The parser rejects duplicate keys, aliases, anchors, tags, merge keys, malformed delimiters, unsupported structures and excessive input.

Limits include:

- frontmatter bytes: 32 KiB;
- fields: 64;
- nesting depth: 2;
- key length: 80 characters;
- scalar length: 2,000 characters;
- list items: 32.

No YAML tags are executed, no objects are instantiated and no filesystem, shell or network access is available to parsing.

## Checks

Stable checks include:

- `STAGING_CAS_INTEGRITY`;
- `MARKDOWN_UTF8_VALID`;
- `FRONTMATTER_PRESENT`;
- `FRONTMATTER_DELIMITERS_VALID`;
- `FRONTMATTER_PARSE_VALID`;
- `FRONTMATTER_LIMITS_VALID`;
- `FRONTMATTER_KEYS_UNIQUE`;
- `MARKORBIT_METADATA_PRESENT`;
- `WORKSPACE_BINDING_VALID`;
- `SOURCE_BINDING_VALID`;
- `RAW_ARTIFACT_BINDING_VALID`;
- `CONVERSION_RUN_BINDING_VALID`;
- `CONVERTER_BINDING_VALID`;
- `INPUT_HASH_BINDING_VALID`;
- `MARKDOWN_BODY_PRESENT`;
- `FRONTMATTER_EXTRA_FIELDS` when bounded non-MarkOrbit fields are present.

Persisted control-plane records are authoritative. Frontmatter is evidence to verify, not a source of identity.

## Outcome rules

- any `FAIL` produces outcome `FAIL` and status `BLOCKED`;
- no `FAIL` and at least one `WARN` produces `PASS_WITH_WARNINGS` and status `READY`;
- all checks passing produces `PASS` and status `READY`.

Warnings never block a document.

Malformed or untrusted document content is a normal verification result and is persisted as `BLOCKED`. Infrastructure failures, including missing CAS files, CAS integrity mismatch, unreadable storage and transaction failures, remain operational errors and are not converted into validation outcomes.

## Immutable evidence

Verification never rewrites Markdown bytes or creates another CAS object. The descriptor retains its original identity, Workspace, Source, RawArtifact, ConversionRun, target path, content hash, size, content-addressed reference, converter and generation timestamp.

Only `frontmatterSummary`, `validation`, `status` and the registry update timestamp change.

## Idempotency and terminal decisions

The same idempotency key with the same canonical request evidence returns the original result. Reuse with different evidence returns `STAGING_VERIFICATION_IDEMPOTENCY_CONFLICT`.

A `READY` document cannot later become `BLOCKED`, and a `BLOCKED` document cannot later become `READY`. A second non-replay decision returns `STAGING_VERIFICATION_ALREADY_DECIDED`.

## ConversionRun boundary

A verified descriptor remains attached to a ConversionRun whose status is still `VERIFYING`. TASK-018 intentionally does not perform `VERIFYING → COMPLETED`.

A later control-plane finalization task may use a matching `READY` descriptor to complete the ConversionRun.
