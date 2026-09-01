# Core Dependency Drift Gates

## Purpose

Knowledge has several acceptance workflows that exercise production boundaries implemented in the `yoomarks/markorbit` monorepo. Each workflow keeps an exact **audited Core baseline SHA**. The baseline is evidence of the last Core boundary that was explicitly reviewed; it is not automatically advanced by scheduled CI.

A monorepo-wide `current main == baseline` check is unnecessarily coarse: unrelated application lanes can advance Core main without changing a Knowledge-consumed service. The drift gate therefore distinguishes a proven isolated change from a change that may affect the tested boundary.

## States

`NO_DRIFT`
: Core main is exactly the audited baseline.

`IRRELEVANT_DRIFT`
: Core main advanced, the baseline is still an ancestor, the complete path diff was obtained, and every changed path is inside an explicitly reviewed isolated prefix. The acceptance workflow proceeds against the **current Core main**, while leaving the audited baseline unchanged.

`RELEVANT_DRIFT`
: At least one changed path is not explicitly proven isolated. The workflow fails closed. The new Core boundary must be audited, the baseline updated deliberately, and the existing real acceptance rerun.

`UNKNOWN_DRIFT`
: The comparison cannot be proven complete or trustworthy, including missing baseline history, non-ancestor history, invalid commit identity, or Git comparison failure. The workflow fails closed.

## Conservative default

The classifier is intentionally default-relevant. It does not attempt to maintain a fragile exhaustive list of all shared dependencies.

The only initial isolated prefixes are paths whose independence from the current Knowledge acceptance closures was established by exact file-level audits during issue #643/#645:

- `apps/lite-web/**`;
- `services/mgsn/**`.

A change to any other path is treated as relevant, including contracts, persistence, migrations, package-manager/build configuration, Capability Engine, MarkReg, or an unknown new directory. Expanding the isolated set requires an explicit dependency review; a commit title is never enough.

## Profiles

The shared helper exposes named profiles for:

- `managed-ai`;
- `markreg-contract`;
- `k-case-008`.

They intentionally begin with the same small isolated set. Named profiles allow future divergence only when dependency evidence justifies it without duplicating workflow logic.

## Runtime behavior

Each freshness job:

1. checks out Knowledge;
2. checks out full Core `main` history with blob filtering;
3. refreshes `origin/main`;
4. runs `scripts/core-drift-gate.mjs` with the workflow's audited baseline and profile;
5. exports the resolved current Core SHA as `core_ref_to_test` only after the classification is known;
6. fails on `RELEVANT_DRIFT` or `UNKNOWN_DRIFT`;
7. runs the existing real acceptance against `core_ref_to_test` for `NO_DRIFT` or `IRRELEVANT_DRIFT`.

The real Managed AI/Capability V2 HTTP E2E, MarkReg invariant audit, and K-CASE PostgreSQL acceptance remain the compatibility evidence. Path classification is only a conservative freshness precondition; it is never a substitute for those tests and never authorizes a relevant Core change.

## Baseline updates

When a relevant Core path changes:

1. inspect the exact baseline-to-current diff;
2. determine which Knowledge boundary is affected;
3. update only the affected audited baseline(s);
4. rerun the corresponding real acceptance at the exact PR head;
5. record the Core and Knowledge SHAs in the issue/PR audit trail.

Scheduled workflows must never mutate baselines automatically.
