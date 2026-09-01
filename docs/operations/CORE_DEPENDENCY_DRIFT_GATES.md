# Core Dependency Drift Gates

## Purpose

Knowledge has several acceptance workflows that exercise production boundaries implemented in the `yoomarks/markorbit` monorepo. Each workflow keeps an exact **audited Core baseline SHA**. The baseline is evidence of the last relevant Core boundary that was explicitly reviewed; it is not automatically advanced by scheduled CI.

A monorepo-wide `current main == baseline` check is unnecessarily coarse: unrelated lanes or services can advance Core main without changing the dependency closure exercised by a particular Knowledge acceptance. The drift gate therefore distinguishes proven isolated changes from changes that may affect the tested boundary.

## States

`NO_DRIFT`
: Core main is exactly the audited baseline.

`IRRELEVANT_DRIFT`
: Core main advanced, the baseline is still an ancestor, the complete path diff was obtained, and every changed path is inside an explicitly reviewed isolated prefix for that profile. The acceptance workflow proceeds against the **current Core main**, while leaving the audited baseline unchanged.

`RELEVANT_DRIFT`
: At least one changed path is not explicitly proven isolated for that profile. The workflow fails closed. The affected Core boundary must be audited, the baseline updated deliberately, and the existing real acceptance rerun.

`UNKNOWN_DRIFT`
: The comparison cannot be proven complete or trustworthy, including missing baseline history, non-ancestor history, invalid commit identity, or Git comparison failure. The workflow fails closed.

## Conservative default

The classifier is intentionally default-relevant. It does not attempt to maintain a fragile exhaustive list of all shared dependencies. A path is isolated only after exact file-level review plus acceptance/build-closure evidence establishes that the profile does not consume it.

The common lane/UI-isolated prefixes established during #643/#645 and #649 are:

- `apps/lite-web/**`;
- `apps/markreg-web/**`;
- `services/mgsn/**`.

One exact root integration-test file is also isolated after direct review:

- `tests/e2e/order-journey-real-runtime.spec.ts`.

`apps/markreg-web/**` is isolated only because the Knowledge acceptance profiles exercise service/contract/runtime boundaries and none builds or imports the MarkReg Web application. The evidence that established this rule was Core `bb26e9c5abc73d05e886001df3b2a8e53606e63f -> da756b292bfe46458fef141857179f7bdc4e7069`, whose complete diff contained only five MarkReg Web files and no MarkReg service, shared-contract, persistence, migration, Core receiver, Capability Engine, or Knowledge Case producer changes.

The exact root E2E file was reviewed separately at Core `e1aa6decced4033f9005f327f88f32c22a8bcd67`: its only change updated the rendered Formal Matter heading assertion from `formal-matter` to `Trademark Matter`. It is not built or executed by any of the Knowledge cross-repository acceptance workflows. This does **not** isolate the `tests/e2e/**` directory generally.

Additional profile-specific isolation is intentionally narrow:

| Profile                 | Additional proven isolated service prefixes            |
| ----------------------- | ------------------------------------------------------ |
| `core-intake`           | `services/capability-engine/**`, `services/markreg/**` |
| `managed-ai`            | `services/markreg/**`                                  |
| `managed-communication` | `services/markreg/**`                                  |
| `markreg-contract`      | `services/capability-engine/**`                        |
| `k-case-008`            | `services/capability-engine/**`                        |

Why:

- Core Intake builds and exercises the Core receiver/PostgreSQL intake closure; it does not build Capability Engine or MarkReg.
- Managed AI builds and exercises `@markorbit/capability-engine...`; Capability Engine therefore remains relevant, while MarkReg is outside that closure.
- Managed Communication starts the real Capability Engine production entrypoint, runs its PostgreSQL Managed Communication bootstrap, and consumes the live thread/exact-evidence HTTP boundary from Knowledge. Capability Engine, shared contracts, persistence, migrations, lockfiles, and build/workspace configuration therefore remain relevant; MarkReg is outside that closure.
- MarkReg Contract inspects the MarkReg Formal Matter/contract boundary; Capability Engine is outside that closure.
- K-CASE builds and exercises the MarkReg producer/PostgreSQL closure; Capability Engine is outside that closure.
- MarkReg Web is a presentation application outside these acceptance closures; `services/markreg/**` remains relevant for the MarkReg/K-CASE profiles even though `apps/markreg-web/**` is isolated.

Shared contracts, persistence, migrations, lockfiles, workspace/package-manager/build configuration and every unlisted or unknown path remain relevant by default. A commit title is never sufficient evidence for isolation.

## Profiles

The shared helper exposes five named profiles:

- `core-intake`;
- `managed-ai`;
- `managed-communication`;
- `markreg-contract`;
- `k-case-008`.

Their isolated sets differ only where the real build/test closures justify that difference. A service that is isolated for one profile may remain relevant for another.

## Runtime behavior

Each freshness job:

1. checks out Knowledge;
2. checks out full Core `main` history with blob filtering;
3. refreshes `origin/main`;
4. runs `scripts/core-drift-gate.mjs` with the workflow's audited baseline and profile;
5. exports the resolved current Core SHA as `core_ref_to_test` only after the classification is known;
6. fails on `RELEVANT_DRIFT` or `UNKNOWN_DRIFT`;
7. runs the existing real acceptance against `core_ref_to_test` for `NO_DRIFT` or `IRRELEVANT_DRIFT`.

The real Core Intake PostgreSQL receiver E2E, Managed AI/Capability V2 HTTP E2E, Managed Communication production-bootstrap PostgreSQL/Expert-import E2E, MarkReg invariant audit, and K-CASE PostgreSQL acceptance remain the compatibility evidence. Path classification is only a conservative freshness precondition; it is never a substitute for those tests and never authorizes a relevant Core change.

## Baseline updates

When a relevant Core path changes:

1. inspect the exact baseline-to-current diff;
2. determine which Knowledge profile(s) actually consume the changed surface;
3. update only the affected audited baseline(s);
4. rerun the corresponding real acceptance at the exact PR head against current Core;
5. record the Core and Knowledge SHAs in the issue/PR audit trail.

If the changed service is proven outside another profile's build/test closure, that profile may classify the same commit as `IRRELEVANT_DRIFT`; its real acceptance still runs against current Core.

Scheduled workflows must never mutate baselines automatically.
