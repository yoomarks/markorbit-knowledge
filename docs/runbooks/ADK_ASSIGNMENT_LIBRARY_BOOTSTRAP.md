# ADK Assignment Library Bootstrap

## Purpose

Bootstrap governed trademark Assignment Libraries into a Knowledge SQLite registry. The command writes only InstructionSets, immutable KnowledgeAssignments and Assignment Library indexes. It does not enqueue ADK-07 jobs, call an AI provider, activate candidates, verify legal truth or authorize any protected action.

## Supported libraries

ADK-10 expands the initial US seed into three isolated jurisdiction libraries:

- `kal_us_trademark_core@1` backed by `kis_us_trademark_research_core@1` with 12 workflows: Filing, Examination, Office Action, Sections 8/9/15/71, Specimen, Assignment, Opposition, Cancellation and TTAB.
- `kal_au_trademark_core@1` backed by `kis_au_trademark_research_core@1` with 10 workflows: Filing, Examination, Adverse Report, Hearing, Acceptance, Opposition, Registration/Renewal, Non-Use Removal, Assignment and Madrid.
- `kal_ca_trademark_core@1` backed by `kis_ca_trademark_research_core@1` with 10 workflows: Filing, Examination, Examiner Report, Advertisement, Opposition, Registration, Renewal, Section 45, Assignment and Madrid.

Each jurisdiction has separate immutable Assignment identities and a jurisdiction-specific research InstructionSet. No US identity is reused for AU or CA.

## Command

Set the target registry path. `MARKORBIT_ADK_LIBRARY_JURISDICTION` accepts `US`, `AU`, `CA` or `ALL`; omission preserves the prior default of `US`.

```bash
MARKORBIT_ADK_LIBRARY_DB_PATH=/absolute/path/to/knowledge.sqlite \
MARKORBIT_ADK_LIBRARY_JURISDICTION=AU \
  pnpm --filter @markorbit/worker adk:library:bootstrap
```

To install all three libraries into one registry:

```bash
MARKORBIT_ADK_LIBRARY_DB_PATH=/absolute/path/to/knowledge.sqlite \
MARKORBIT_ADK_LIBRARY_JURISDICTION=ALL \
  pnpm --filter @markorbit/worker adk:library:bootstrap
```

The command opens the target SQLite database with foreign keys enabled, installs only the requested deterministic library scope and emits non-secret JSON evidence containing each library id, revision, jurisdiction, workflow list, assignment ids and authority boundaries.

## Replay behavior

Bootstrap is idempotent only when every frozen object is byte-for-byte equivalent to the existing durable object. Re-running the same jurisdiction seed returns the same library. `ALL` is therefore safe to replay over a registry already containing any subset of the exact seeds. Any same-identity mutation fails closed through the immutable InstructionSet, Assignment or Assignment Library registries.

## Governance boundary

These seeds are governed propositions, not legal answers. They do not store provider answers, grant provider execution authority, verify legal truth or automatically activate Assignment Candidates. Evidence-driven growth must create new immutable Assignments and later library revisions through the separate governed promotion boundary introduced in ADK-09.
