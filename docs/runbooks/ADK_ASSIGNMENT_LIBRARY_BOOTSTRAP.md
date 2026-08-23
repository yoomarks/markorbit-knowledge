# ADK Assignment Library Bootstrap

## Purpose

Bootstrap the governed ADK-08 Assignment Library into a Knowledge SQLite registry. The command writes only InstructionSets, immutable KnowledgeAssignments and the Assignment Library index. It does not enqueue ADK-07 jobs, call an AI provider, activate candidates, verify legal truth or authorize any protected action.

## Initial library

The first production-shaped seed is `kal_us_trademark_core@1`, backed by `kis_us_trademark_research_core@1` and twelve US trademark workflows:

- Filing
- Examination
- Office Action
- Section 8
- Section 9
- Section 15
- Section 71
- Specimen
- Assignment
- Opposition
- Cancellation
- TTAB

## Command

Set the target registry path and run:

```bash
MARKORBIT_ADK_LIBRARY_DB_PATH=/absolute/path/to/knowledge.sqlite \
  pnpm --filter @markorbit/worker adk:library:bootstrap
```

The command opens the target SQLite database with foreign keys enabled, installs the deterministic US Trademark library and emits non-secret JSON evidence containing the library id, revision, scope, workflow list, assignment ids and authority boundaries.

## Replay behavior

The bootstrap is idempotent only when every frozen object is byte-for-byte equivalent to the existing durable object. Re-running the same seed returns the same library. Any same-identity mutation fails closed through the existing immutable InstructionSet, Assignment or Assignment Library registries.

## Expansion

Australia and Canada must be added as separate jurisdiction-specific governed libraries. Do not repurpose US assignment identities or mutate `kal_us_trademark_core@1`. Library growth caused by new evidence must create new immutable Assignments and a later library revision; Assignment Candidate activation remains a separate governance action.
