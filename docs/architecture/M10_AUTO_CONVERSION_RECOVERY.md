# M10 — Automatic Conversion Recovery

## Purpose

M9 connected successful RawArtifact finalization to automatic conversion. M10 makes that handoff self-healing when the control-plane process, network, or request fails after immutable evidence has already been committed.

The acquisition boundary remains unchanged: collection is still explicitly started by an operator. M10 only recovers derived processing that was already authorized by an ACTIVE `autoConvert: true` Conversion Profile.

## Failure windows covered

A finalized artifact can be left without an `AUTO_PROFILE` ConversionRun in two important states:

1. `REGISTERED` / `DUPLICATE_CHECKED` — finalization succeeded, but automatic authorization or dispatch did not complete.
2. `READY_FOR_CONVERSION` — immutable-byte authorization succeeded, but ConversionRun dispatch did not complete.

M10 detects both states and safely replays the existing M9 handoff.

## Recovery trigger

Every authenticated production Conversion Worker claim performs a bounded recovery scan before claiming queued work:

```text
worker claim
  → verify Worker credential/workspace
  → scan up to 25 recoverable RawArtifacts
  → idempotently dispatch missing AUTO_PROFILE ConversionRuns
  → claim normal Conversion Runtime work
```

The recovery scan is best-effort. If the scan itself fails, the Worker is still allowed to claim ConversionRuns that are already queued.

A manual control-plane endpoint is also available:

```text
POST /api/conversion-runs/reconcile-auto
{
  "workspaceId": "wsp_...",
  "limit": 25
}
```

`limit` is optional and bounded to 1–100.

## Candidate rules

A RawArtifact is a recovery candidate only when all of the following are true:

- workspace matches;
- status is `REGISTERED`, `DUPLICATE_CHECKED`, or `READY_FOR_CONVERSION`;
- no `AUTO_PROFILE` ConversionRun already exists for the artifact;
- an ACTIVE `autoConvert: true` Conversion Profile applies to its source, artifact kind, and MIME type;
- the selected Converter Manifest is ACTIVE and produces Markdown.

For `READY_FOR_CONVERSION`, recovery is stricter: the profile already recorded in `x-conversion-profile-id` must itself still be ACTIVE and automatic. This preserves the authorization decision that was made against the immutable bytes.

## Sticky authorization

M10 does not allow a partially completed handoff to drift to a newly higher-precedence profile.

```text
REGISTERED
  → choose current best automatic profile
  → authorize immutable bytes
  → READY_FOR_CONVERSION + x-conversion-profile-id

READY_FOR_CONVERSION recovery
  → reuse exactly x-conversion-profile-id
  → dispatch missing ConversionRun
```

If the already-authorized profile is no longer automatic/active/compatible, recovery fails closed and requires operator action.

## Idempotency and concurrency

Automatic dispatch continues to use the deterministic M9 key:

```text
auto-profile:{artifactId}:{profileId}
```

This means multiple Worker claims may discover the same artifact concurrently without creating duplicate ConversionRuns. Existing automatic runs are excluded from the recovery scan, and any dispatch race is resolved by the ConversionRun ledger's existing idempotency guarantee.

## Representation policy preserved

M8 may retain both HTML and MARKDOWN for a fetched web page. M9 intentionally canonicalizes the MARKDOWN representation while retaining HTML as raw evidence. M10 uses profile artifact-kind/MIME matching when selecting recovery candidates, so HTML evidence is not accidentally promoted into a duplicate canonical document.

## Boundary

M10 does not:

- schedule or authorize collection;
- retry failed ConversionRun execution;
- silently switch a previously authorized profile;
- silently route scanned PDF to OCR;
- infer legal meaning;
- create Rule/Requirement/Deadline/Procedure knowledge objects;
- generate answers or recommendations.

Failed ConversionRun execution remains a separate operational concern from a missing post-acquisition handoff.
