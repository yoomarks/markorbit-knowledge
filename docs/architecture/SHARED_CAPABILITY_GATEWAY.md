# Shared Capability Gateway

Status: Admin V2 implementation boundary

MarkOrbit Knowledge may call reusable intelligence capabilities, but it must not implement a Knowledge-specific semantic brain.

## Page Value Screening v1

The first generic capability is `page-value-screening`.

Knowledge supplies only candidate facts and structural discovery signals. The external/shared capability may return a ranked subset with:

- title;
- concise summary;
- page type;
- concrete value points;
- normalized 0-100 score;
- HIGH / MEDIUM / LOW / SKIP priority.

The same contract is intentionally domain-neutral and can be used by other MarkOrbit products or non-IP workflows.

Knowledge validates and persists the returned result as capability evidence. The result does not mutate SourceDefinition v1, does not establish legal truth, and does not automatically approve a Source.

## HTTP provider contract

Configure the Admin runtime with:

```text
MARKORBIT_CAPABILITY_BASE_URL=https://capabilities.example.internal
MARKORBIT_CAPABILITY_API_KEY=<optional bearer token>
MARKORBIT_CAPABILITY_TIMEOUT_MS=45000
```

Knowledge calls:

```text
POST {MARKORBIT_CAPABILITY_BASE_URL}/v1/capabilities/page-value-screening
```

The payload and response use `PageValueScreeningRequestV1` and `PageValueScreeningResponseV1` from `@markorbit/contracts`.

The provider can inspect up to 500 candidates and return the best 100. Knowledge preserves the latest screening batch for the operator and keeps the append-only historical result rows.

## Product flow

```text
Discovery structural candidates
        ↓
Shared Page Value Capability
        ↓
Top-value candidate title / summary / value points / ranking
        ↓
Sources human review
        ↓
Approve → Source + default plan + first collection
Reject  → retained decision + optional rescan
```

The capability is advisory. Sources remains the approval authority.

## Compatibility

Existing `CoreDiscoveryProposalV1` remains supported for backward compatibility and source-expansion proposals. New page-value screening is not named after Core or Mo Brain and does not require a specific model vendor.
