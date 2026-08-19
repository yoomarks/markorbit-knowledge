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

Use `config/production-validation-scorecard-template.json` as the empty report envelope. Individual result rows are added by the production-validation runner as real observations become available.

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

The report gate rejects unknown/duplicate targets and requires structured observations for discovery, onboarding, collection, artifact, conversion, Knowledge visibility, second-run behavior, HTTP metrics, runtime metrics, manual intervention, and adapter need.

## Acceptance for the next production slice

The next runner should consume this manifest, onboard targets through the existing governed Source lifecycle, perform explicitly authorized bounded collection, and emit the scorecard without weakening Source or CollectionPlan governance. Real failures then become the prioritized input for generic runtime improvements.
