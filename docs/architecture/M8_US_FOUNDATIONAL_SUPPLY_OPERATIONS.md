# M8 — US Foundational Source Supply Operations

## Purpose

M8 moves the curated US FOUNDATIONAL coverage set from registration-only readiness into safe, repeatable acquisition readiness.

The goal is operational and intentionally narrow:

```text
Source Coverage target
→ registered SourceDefinition
→ ACTIVE MANUAL CollectionPlan
→ optional explicitly selected CollectionRun
→ RawArtifact evidence
→ existing normalization / retrieval pipeline
→ Source Supply Health
```

M8 does not add scheduling, legal interpretation, knowledge extraction, deadline calculation or answer generation.

## Default bootstrap behavior

`pnpm --filter @markorbit/worker bootstrap:coverage` now performs two safe preparation steps:

1. ensure all active `US / FOUNDATIONAL` coverage targets are registered as SourceDefinitions;
2. ensure each registered target has an ACTIVE, MANUAL foundational supply CollectionPlan.

No collection run is created by default.

Use `--sources-only` when only SourceDefinitions should be prepared.

## Explicit dispatch

A real run is created only when a target is explicitly named:

```bash
pnpm --filter @markorbit/worker bootstrap:coverage -- \
  --dispatch-target=us-uspto-trademark-fees
```

Multiple `--dispatch-target=<target-id>` flags may be supplied. Each creates only the selected target's MANUAL run through the existing control-plane execution contract.

The legacy `--dispatch-representative` smoke path remains available and separate from the new full supply plans.

## Plan profiles

Plans remain bounded and conservative.

| Family | Max depth | Max items | Intent |
| --- | ---: | ---: | --- |
| `EXAMINATION_MANUAL` | 2 | 120 | acquire a useful current manual corpus without an unbounded crawl |
| `TTAB_PROCEDURE` | 2 | 120 | acquire a useful current procedure-manual corpus |
| `PORTAL` | 1 | 40 | capture the curated trademark portal and first-level official pages |
| `MAINTENANCE` | 1 | 40 | capture the maintenance page and first-level official guidance |
| other families | 0 | 10 | seed-page acquisition only until a family-specific strategy is justified |

All plans:

- remain `schedule.mode = MANUAL`;
- respect robots.txt;
- use a bounded 12 requests/minute rate;
- use one execution attempt by default;
- inherit the target's JavaScript hint;
- preserve explicit source/target provenance through existing RawArtifact ingestion.

## Attachment evidence

Every supply plan requests page `HTML` and `MARKDOWN` evidence.

When a curated target explicitly sets `fetchAttachmentsHint = true`, M8 also authorizes only the expected attachment kinds supported by the Crawl4AI evidence runtime:

- PDF;
- DOCX;
- XLSX;
- CSV;
- JSON;
- XML;
- EMAIL;
- IMAGE;
- TEXT.

Attachment fetching remains disabled for all other targets.

The runtime's same-host, public-DNS, redirect, egress-proxy and byte-limit controls continue to apply.

## Known structured-data gap

Some dynamic USPTO targets declare JSON as an expected source artifact while not exposing it as a normal linked attachment. The current Crawl4AI runtime captures rendered page evidence but does not intercept arbitrary browser XHR/fetch traffic.

M8 therefore reports these targets as:

`STRUCTURED_ENDPOINT_NOT_CAPTURED`

This is a deliberate gap marker, not a synthesized success state. A future dedicated structured-data/API acquisition path may close it after the endpoint and authorization boundary are explicitly defined.

## Verification

`pnpm --filter @markorbit/worker verify:coverage` now verifies, by default:

- every active US FOUNDATIONAL target is registered;
- every registered target has an ACTIVE MANUAL foundational supply plan;
- any supplied live run IDs complete successfully;
- live runs retain governed USPTO RawArtifact evidence with SHA-256 provenance;
- live page runs include HTML and Markdown evidence.

Set `MARKORBIT_COVERAGE_REQUIRE_SUPPLY_PLANS=0` only when intentionally verifying an older source-registration-only environment.

## Hard boundary

M8 does not:

- create recurring schedules;
- automatically dispatch all targets;
- infer collection authorization from source importance;
- fetch non-public destinations;
- infer authority from domains;
- interpret trademark law;
- generate Rule / Requirement / Deadline / Procedure objects;
- calculate legal deadlines;
- create MarkOrbit Core knowledge or answers.

Collection remains an explicit operator action. M8 makes the curated foundational set runnable; it does not make collection autonomous.
