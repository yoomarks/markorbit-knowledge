# M15 — Foundational Retrieval Quality Gate

## Purpose

M15 turns the M14 retrieval-quality audit into an actual FOUNDATIONAL readiness gate and removes the US-only limitation from the operator path.

A foundational source is no longer `READY` merely because a current retrieval document exists. Its current retrieval projection must also have complete M14 audit coverage and pass the structural/provenance audit.

## Readiness pipeline

```text
REGISTER
  ↓
COLLECT
  ↓
INGEST
  ↓
CONVERT
  ↓
INDEX
  ↓
QUALITY
  ↓
HEALTH
  ↓
READY
```

`QUALITY` is a blocking stage. It is entered only after acquisition, normalization, indexing and Source Supply Health have reached their normal ready condition.

## Quality gate rules

For every active FOUNDATIONAL coverage target with current retrieval documents:

- at least one current M14 audit record must exist;
- the number of current audit records must equal the Source Supply Health `currentDocumentCount`;
- every current audit record must be `READY`;
- `DEGRADED` retrieval quality remains visible and blocks FOUNDATIONAL readiness;
- `BLOCKED` retrieval quality blocks FOUNDATIONAL readiness;
- missing audit coverage blocks FOUNDATIONAL readiness.

Operational gap signals introduced by the gate:

- `RETRIEVAL_AUDIT_MISSING`
- `RETRIEVAL_AUDIT_COVERAGE_MISMATCH`

M14 gap codes remain unchanged and are propagated into the target's `retrievalAuditGaps`.

## Jurisdiction-general operator

The FOUNDATIONAL operator now accepts a jurisdiction rather than being hard-coded to the United States.

Review US supply:

```bash
pnpm --filter @markorbit/worker operate:foundational -- --jurisdiction=US
```

Review WIPO/Madrid supply:

```bash
pnpm --filter @markorbit/worker operate:foundational -- --jurisdiction=WO
```

Explicitly dispatch selected WIPO targets:

```bash
pnpm --filter @markorbit/worker operate:foundational -- \
  --jurisdiction=WO \
  --dispatch-target=<target-id> \
  --approve-dispatch
```

The default jurisdiction remains `US` for CLI compatibility. The legacy US-only CLI remains available as `operate:foundational:us`.

## Authorization boundary

M15 does not change collection authorization.

- review mode dispatches nothing;
- selected targets require `--approve-dispatch`;
- `--dispatch-all` requires the same explicit approval;
- plans remain MANUAL;
- no scheduler is introduced;
- no source scope is broadened automatically.

## Data boundary

The quality gate is read-only with respect to evidence and retrieval content. It does not:

- mutate RawArtifact evidence;
- rewrite canonical Markdown;
- repair retrieval rows automatically;
- delete duplicate content;
- infer legal rules or deadlines;
- score substantive legal correctness;
- generate final legal answers.

Remediation remains an explicit operator action through the existing collection, conversion/recovery and indexing paths.

## Relationship to earlier milestones

- M12 introduced the US 11/11 FOUNDATIONAL readiness operator.
- M13 generalized foundational source supply and added WIPO coverage.
- M14 introduced read-only retrieval quality auditing.
- M15 combines those pieces: the operator is jurisdiction-general and retrieval quality is now part of the READY decision.
