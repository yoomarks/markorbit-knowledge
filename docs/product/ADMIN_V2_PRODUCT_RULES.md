# MarkOrbit Knowledge Admin V2 — Product Rules

Status: product direction locked for implementation

## 1. Product boundary

MarkOrbit Knowledge is the acquisition, preservation, provenance and delivery layer.

Knowledge owns:

- source discovery and source lifecycle orchestration;
- acquisition/import execution;
- immutable raw evidence;
- versioning and provenance;
- preparation and ReadyPackage delivery;
- operational state, progress and reminders derived from those facts.

Knowledge does not own reusable semantic intelligence. Generic capabilities such as valuable-page screening, summarization, page classification, related-source recommendation and change-significance analysis must be consumed through shared Capability interfaces rather than reimplemented as Knowledge-specific intelligence.

## 2. Five primary operator surfaces

The daily Workbench is intentionally limited to:

1. **Overview** — what changed, what needs attention, progress and recommended next actions.
2. **Discovery** — start/batch discovery and observe discovery progress; discovery does not become a second approval system.
3. **Sources** — the single lifecycle center for candidate review, approval, activation, reassessment, rescan and source health.
4. **Knowledge** — browse/search the information assets actually acquired from Sources, with provenance and versions.
5. **Packages** — inspect validated packages and delivery state for downstream consumers.

The business flow is:

`Discovery → Sources → Knowledge → Packages`

Overview summarizes and routes work into that flow.

## 3. Navigation rules

- Placeholder-only pages must not appear in navigation.
- Real engineering pages remain available under a collapsed **System / Advanced** section.
- Advanced pages must never become required steps in normal operator workflows.
- Sidebar scrolling may remain functional, but the native scrollbar is hidden.
- Admin must support Chinese and English through a shared i18n layer; Chinese is the preferred default for the current operator experience.

## 4. Discovery rules

Discovery is an intake/discovery surface, not the final review destination.

Required direction:

- single and batch source input;
- URL/CSV/Excel batch import;
- deterministic structural discovery (links, sitemap, RSS, redirects, etc.);
- related-source expansion under bounded governance;
- generic Capability calls may enrich candidates with title, summary, page type, value points and ranking;
- Discovery results that need a decision move to **Sources → Pending Review**;
- structural discovery and Capability output never auto-authorize unlimited acquisition.

## 5. Sources is the single source-management center

All source entry paths converge on one Source Registry and one lifecycle:

- Discovery candidates;
- manually entered websites;
- batch imports;
- manual files;
- API/RSS/GitHub/email/local-folder inputs.

There may be multiple intake mechanisms, but there must not be multiple competing source-management systems.

Expected lifecycle:

`Pending Review → Active → Paused → Rejected/Archived`

Sources must retain rejection decisions and support restoration/reassessment.

## 6. Approval should complete the normal setup

Normal source approval must minimize operator steps.

For an approved candidate, one business action should be able to complete:

- SourceDefinition creation/update;
- first assessment results;
- default CollectionPlan creation;
- acquisition scope/settings;
- update/rescan policy;
- activation/initial acquisition when allowed.

The operator should not be forced to visit Collection Plans, Runs, Workers or Connectors to finish ordinary source onboarding.

Batch approve/reject must be supported.

## 7. Source assessment boundaries

Two concepts remain separate:

- **Source Value / semantic usefulness**: provided by a shared reusable Capability.
- **Evidence Maturity / acquisition-provenance state**: computed from Knowledge's own factual state.

Legacy Knowledge-specific semantic scoring must not expand into a product-specific AI brain.

## 8. Country/resource completeness

Foundational readiness is not a primary business page.

Its underlying checks remain useful but should be internalized as:

- source/country completeness state;
- progress;
- warnings;
- stale/failed source reminders;
- country knowledge summary and gaps.

Sources should support country/resource views and a **country knowledge overview** action. Human-readable completeness analysis may call a shared Capability using Knowledge's factual source/coverage state.

## 9. Source Intelligence decomposition

The standalone Source Intelligence primary navigation entry should disappear from the daily Workbench.

Its useful capabilities move to the correct surfaces:

- source value/evidence maturity → Sources;
- pending review/ownership/SLA → Sources and Overview;
- backlog/health reminders → Overview;
- audit query/history/policy replay/comparison → System / Advanced diagnostics.

Underlying append-only audit and historical replay capabilities are preserved.

## 10. Manual file import and RawArtifact boundary

**Raw Artifacts is evidence storage/inspection, not a second Source creation workflow.**

A RawArtifact is an immutable piece of evidence acquired/imported from a Source.

Manual file import must move to a Source-centered flow:

- create a new source from the uploaded material; or
- associate/import material through a governed source relationship where supported.

The current shared business-visible `Manual Uploads` bucket is a legacy implementation detail and must not be the long-term operator model.

Advanced Raw Artifacts remains for provenance/debugging only.

## 11. Knowledge surface

Knowledge should become the visible outcome of acquisition, not a Staging engineering page.

Expected browsing/search dimensions include:

- jurisdiction/country;
- source;
- document/content type;
- rules/guidance/fees/news/cases/decisions/publications;
- original document;
- acquisition time;
- source/provenance;
- versions and meaningful changes.

## 12. Packages surface

Packages presents business delivery state rather than protocol terminology.

Expected operator states include:

- preparing;
- ready;
- pending delivery;
- delivered;
- failed/needs attention.

Protocol and transport diagnostics remain available only when needed.

## 13. Interaction principle

The operator sees **business objects, state and next actions**.

Engineering objects such as CollectionPlan, CollectionRun, Worker, ConnectorManifest, ConversionRun and RawArtifact remain real and auditable, but they are supporting implementation details for normal operations.

**The product surface should get simpler as the underlying system gets more capable.**
