# MarkOrbit Knowledge — Next Tasks
**Baseline:** `yoomarks/markorbit-knowledge@5e68862f3e9b7a6522ab0e22aeccd1a426b9cebc`  
**Generated:** 2026-08-23 09:11 (UTC+8)

## P0-1 — Correct Knowledge/Core V2 factual documentation drift

Current #396 can be misread as requiring a new Core V2 receiver.

Correct state:
- Core PR #91 already implemented WP01/02 baseline.
- Core current main still returns durable `RECEIVED`.
- Required work is WP03–05 consumer completion.

Knowledge-side fix:
- amend README / task wording;
- preserve frozen contracts;
- record Core #91 / migration 0048 / existing endpoint;
- use `MarkOrbit_Core_Knowledge_Formal_Integration_Task_2026-08-23.md` as the corrected formal baseline.

## P0-2 — Send formal task to Core Agent

Deliver:
- `MarkOrbit_Core_Knowledge_Formal_Integration_Task_2026-08-23.md`

Core must build on:
`yoomarks/markorbit@a8035efff46a2e71a4613abd1927b18dadff086b`

Required outcome:
- full Content Export V2 / Vault provenance validation;
- durable `ACCEPTED`;
- no second endpoint / ledger;
- new migration only if needed; never rewrite 0048;
- 8 real cross-repo E2E;
- final completion receipt.

## P0-3 — Audit Core return

Require:
- PR URL;
- final head SHA;
- merge SHA;
- migration ID;
- final endpoint;
- CI URLs;
- E2E-01..08 run evidence;
- V1 regression;
- fixture request/content hashes.

No verbal acceptance.

## P0-4 — Explicit non-production Knowledge→Core acceptance

After Core completion:
- fixed commits;
- real HTTP;
- real Core PostgreSQL;
- Knowledge SQLite restart;
- persisted `ACCEPTED`;
- Knowledge finalize;
- durable evidence.

No production activation in this task.

## P0-5 — Continue remaining Wave 1 authorities

Use real governed runs and durable v1.2 scorecard snapshots.

For failures:
- evidence first;
- classify;
- generic capability fix only when justified;
- rerun;
- never count manifest membership as validation.

## P1 — Acquisition Intelligence follow-up only from real evidence

Phase 1 is complete.

Do not add new profiles / statistical rankers unless real acquisition evidence proves a limitation.

## Deferred

- provider breadth expansion;
- UI polish;
- semantic/legal reasoning;
- production V2 activation;
- Knowledge-side meaning/recommendation generation.
