# Production Validation Wave 1

Wave 1 moves Knowledge from isolated capability proof toward repeatable production validation across a representative set of official trademark systems.

## Scope

The source inventory lives in `config/production-validation-wave-1.json`. Source expansion is data-driven: adding a jurisdiction to this wave is a manifest change, not a new source-specific code path.

The initial wave intentionally spans international, regional, and national offices. Every target begins as `PENDING_REAL_RUN`. The manifest is an inventory and validation plan only; it is not evidence that a source has been collected successfully.

## Governance boundaries

- Discovery does not activate a Source.
- Collection requires explicit authorization.
- The manifest never creates automatic production schedules.
- Production scorecards record only real observations from actual runs.
- A failed source is evidence for a generic capability gap first. Add a source-specific adapter only when the failure cannot be solved safely and generically.

## Scorecard contract

Each real-run result should record the full path rather than a single success flag:

- discovery
- onboarding
- collection
- HTTP behavior, including status/failure class and validator behavior
- RawArtifact creation
- conversion
- Knowledge visibility
- second-run/change-detection behavior
- latency, bytes, and retry counts
- manual intervention requirement
- adapter requirement

`config/production-validation-scorecard-template.json` remains the legacy manual v1.0 envelope. The live control-plane API emits the current v1.2 scorecard from durable registry facts; the manifest's `PENDING_REAL_RUN` values remain inventory state and are not rewritten as evidence arrives.

### Durable snapshots

`GET /api/discovery/production-validation-wave?workspaceId=...` returns the current derived scorecard plus the 20 latest immutable `scorecardSnapshots` for that workspace and wave. Capture an operator checkpoint explicitly:

```bash
curl -X POST "$MARKORBIT_CONTROL_PLANE_URL/api/discovery/production-validation-wave" \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: wave-1-2026-08-23T0900Z' \
  --data '{"action":"CAPTURE_SCORECARD","workspaceId":"default"}'
```

Each snapshot stores the complete v1.2 scorecard, capture time, idempotency key and SHA-256 content digest in the registry database. Replaying the same key returns the original immutable snapshot. These records therefore follow the same durable database backup and retention policy as the rest of the registry; CI artifacts are diagnostic copies, not the system of record.

## Static gate

Run:

```bash
pnpm check:production-validation:wave1
```

This checks the manifest for unique IDs and URIs, official-only scope, HTTPS entry points, supported priorities/states, and the hard governance boundaries.

When a populated scorecard exists, validate it against the same manifest:

```bash
node scripts/production-validation-wave-check.mjs --report path/to/scorecard.json
```

The report gate accepts the legacy manual v1.0 envelope and the current derived v1.2 contract. Both reject unknown or duplicate targets; v1.2 additionally verifies lifecycle states, outcome booleans, compatibility telemetry, and the non-authorizing remediation boundary.

## Acceptance for the next production slice

The next runner should consume this manifest, onboard targets through the existing governed Source lifecycle, perform explicitly authorized bounded collection, and emit the scorecard without weakening Source or CollectionPlan governance. Real failures then become the prioritized input for generic runtime improvements.
