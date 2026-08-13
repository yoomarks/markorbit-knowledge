# Admin V2 Primary Surface Audit

Status: implementation follow-up

## Product boundary

The daily operator surface remains intentionally limited to:

1. Overview
2. Discovery
3. Sources
4. Knowledge
5. Packages

Knowledge is an acquisition and provenance system. Semantic analysis, legal/business reasoning, recommendations and content generation remain outside this repository's Knowledge boundary and belong to Core / Mo Brain.

## Verified primary surfaces

- Admin shell: compact five-item workbench plus collapsed Advanced control plane; Chinese/English locale switch is wired.
- Overview: business-facing operational state, action queue and package/knowledge progress; bilingual.
- Knowledge: acquired-document browser with Source and immutable RawArtifact provenance; bilingual.
- Packages: business delivery states over existing durable delivery evidence; bilingual.

## Remaining primary-surface work

### Discovery

`apps/admin/src/components/discovery/discovery-intake.tsx`

- Replace hard-coded Chinese copy with `useAdminI18n` locale-aware copy.
- Localize errors, progress, discovery depth, candidate budget, status, record timestamps and CTA labels.
- Preserve the current governance statement: robots/sitemap/budgets/provenance are acquisition controls; Discovery never approves a source or bypasses Sources.

### Sources review

`apps/admin/src/components/sources/source-smart-review.tsx`

- Localize tabs, capability state, screening/review actions, result copy, dates and empty states.
- Keep Page Value Capability explicitly external/shared. Knowledge may display persisted results for human review but must not become the semantic reasoning engine.

### File intake

`apps/admin/src/components/sources/source-file-import.tsx`

- Localize policy, field labels, validation errors, idempotency/retry messaging and success details.
- Keep one-file-one-Source behavior and immutable RawArtifact provenance.
- Continue excluding the historical shared `manual-uploads` system bucket from normal operator selection.

### Country coverage

Country/resource completeness belongs inside Sources rather than as a separate daily navigation item.

- Compare factual registered Sources against the curated structural source coverage catalog.
- Show covered/missing official resources by jurisdiction.
- Completeness must never be described as legal truth, semantic authority or content quality.

## Final regression gate

Before Admin V2 is considered complete:

- Node 22 validation: format, lint, typecheck, tests, build.
- Node 24 validation: format, lint, typecheck, tests, build.
- UI Preview screenshots.
- Verify the five primary routes and bilingual switching.
- Verify legacy engineering pages remain routable but hidden from the daily navigation.
- Verify no duplicate Manual Upload business path is exposed.
- Verify Discovery -> Sources -> Knowledge -> Packages remains the operator mental model.
