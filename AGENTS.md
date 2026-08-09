# Repository instructions for coding agents

This file is the single authoritative engineering instruction source for Codex and other coding agents working in this repository. Apply it to all feature work, bug fixes, refactors, PRs, CI fixes, and agent-assisted development.

## Project boundaries and non-negotiable invariants

1. Read `docs/product/MarkOrbit_Knowledge_PRD_v1.0.md`, `docs/architecture/SYSTEM_BOUNDARIES.md`, `docs/architecture/SYSTEM_ARCHITECTURE_V1.md` and `docs/architecture/SCHEMA_V1.md` before changing code.
2. Never move MarkOrbit Core information understanding, distillation, knowledge, capability, value-scoring or recommendation logic into this repository.
3. Schema v1 is locked. Any incompatible contract change requires an ADR, a new major schema directory and explicit migration planning. Database models must conform to the schema rather than redefine it.
4. Central services may issue declarative tasks only. Arbitrary remote worker code execution is forbidden.
5. Preserve RawArtifact immutability, hashes, provenance and version chains.
6. Never place credentials in SourceDefinition, ConnectorManifest, RawArtifact, logs, fixtures or Vault content. Use secret references only.
7. Keep connectors, converters, storage providers and execution providers replaceable behind MarkOrbit contracts.
8. Unknown top-level contract fields are prohibited. Optional provider metadata must use `extensions` with `x-` namespaced keys.
9. Fixture/demo data must be clearly labeled and must never be represented as a real acquisition result.
10. Run `pnpm check` before opening or updating a pull request. Run additional Docker, database, migration, or integration validation when the changed path requires it.
11. Use a feature branch and Draft PR. Do not commit directly to `main` and do not self-merge unless the user explicitly instructs it.

## Default engineering behavior

Core rule:

**Root cause + Minimum change + Reuse + Verification + Scope discipline.**

Use the smallest, most direct, verifiable change that solves the real problem. Do not add code, abstractions, files, dependencies, or architecture merely to make an implementation look more sophisticated.

### 1. Understand the real execution path before editing

For a bug or failure:

1. Read the actual error, failing test, CI log, or observed behavior.
2. Trace the real runtime call path, SQL, configuration, workflow, or data path involved.
3. Confirm the root cause.
4. Modify only the code required to fix that cause.

Do not make broad changes before the root cause is known.

### 2. Fix causes, not symptoms

Preferred order:

**root-cause fix > narrow compatibility handling > temporary workaround**

Never make a test pass by swallowing exceptions, skipping required logic, deleting tests, weakening error conditions, bypassing integrity checks, or hard-coding around the actual failure.

### 3. Keep changes minimal

If a three-line fix solves the verified problem, do not turn it into a thirty-line redesign.

Unless the current issue is directly caused by an architectural defect, do not opportunistically:

- perform broad refactors;
- reorganize directories;
- rewrite modules;
- introduce a framework or abstraction layer;
- rename unrelated code;
- format the entire repository;
- clean unrelated technical debt.

Record unrelated debt if useful, but keep it outside the current task.

### 4. Reuse before building

Use this order when implementing a fix or feature:

1. existing repository implementation;
2. existing repository functions, modules, tools, or infrastructure;
3. standard library or native platform capability;
4. already-installed dependencies;
5. new dependency or new subsystem only when the above cannot solve the verified need.

Do not duplicate an existing capability.

### 5. Control new code and abstractions

Every new file, helper, wrapper, abstraction, dependency, and configuration surface must have a current, concrete purpose.

Avoid one-off abstraction layers, speculative plugin systems, premature generalization, premature modularization, or infrastructure for imagined future requirements.

**Solve today's verified problem, not tomorrow's imagined problem.**

### 6. Minimum change must not reduce engineering quality

Do not weaken or remove required:

- data integrity;
- security checks;
- authorization controls;
- error handling;
- transaction consistency;
- idempotency;
- backward compatibility;
- necessary logging;
- tests;
- migration safety;
- API contracts;
- user-data protection.

"Minimum change" removes unnecessary complexity, not quality safeguards.

### 7. Verify after every meaningful change

Code that merely looks correct is not complete.

Run the checks applicable to the changed path, including as relevant:

- unit and integration tests;
- lint;
- typecheck;
- build;
- Docker validation;
- database validation;
- migration validation;
- GitHub Actions / CI.

For bug fixes, reproduce the failure before the fix when practical, then prove the same case passes after the fix.

### 8. Treat CI failures as implementation work

When CI fails:

1. read the current failing log;
2. identify the first real root cause;
3. modify the code or configuration causing it;
4. validate the fix in the closest available environment;
5. rerun CI;
6. continue until the required checks pass.

Do not stop at explaining a failure, and do not use one failing check as an excuse to refactor unrelated code.

### 9. Enforce scope discipline

Start each task with one explicit objective.

If another issue appears:

- fix it only if it blocks the current task;
- otherwise record it and leave it outside the current diff.

Aim for one clear PR objective with only the necessary changes.

### 10. Git and PR discipline

Before submitting, inspect the diff and confirm:

- every changed file is required for the current objective;
- no debug or temporary files remain;
- no unrelated formatting or renames slipped in;
- no dependency or lockfile change exists without a real need;
- the implementation cannot be simplified further without losing correctness or safety.

PR descriptions should focus on:

- the problem or objective;
- the root cause when applicable;
- what changed;
- how it was verified.

Avoid process-heavy or ceremonial PR prose.

### 11. Agent execution behavior

Default to direct execution when the task is clear and permissions are available.

Information that can be confirmed from the repository, logs, tests, CI, or project documentation should be read directly rather than repeatedly requested from the user.

Preferred loop:

**read → locate → modify → test → fix → retest → complete**

Avoid long speculative discussion that produces no code change.

### 12. Reporting behavior

Keep progress reporting sparse. Unless a real user decision is required, complete a meaningful stage before reporting.

Final reports should state only what matters:

- what was completed;
- the key files or behavior changed;
- validation / CI status;
- blockers, if any;
- the next concrete step.

Do not narrate every search, command, or internal reasoning step.

### 13. Complexity review before submission

Before every commit or PR update, ask:

> Is this implementation more complex than the verified problem requires?

If yes, simplify it before submission.

Specifically check for unnecessary abstractions, files, dependencies, duplicated capability, unrelated edits, speculative future work, and any more direct implementation that preserves correctness and safety.
