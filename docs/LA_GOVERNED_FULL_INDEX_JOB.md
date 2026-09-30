# Lao WoPublish manual full-index Work — default OFF

The existing SourceAdapter remains the **only** official WoPublish crawler, and
the existing Knowledge Worker and RawArtifact ledger remain its sole acquisition
and evidence persistence path. The FULL_INDEX_BASELINE connectorConfig route
is **not activated** by merging code or enabling a global Data Engine flag.

A separately authorized Knowledge WEB_CRAWL Job must pin the exact official
LA source URL, the original Lao connector identity/version, a MANUAL
CollectionPlan with the necessary HTML/XML/JSON artifact kinds,
respectRobots=true, a 1–24 requests/minute plan, and explicit maxPages
between 3 and 2,000. The Worker must additionally have
MARKORBIT_LA_FULL_INDEX_COLLECTION_ENABLED=true under its own approved
deployment, with MARKORBIT_LA_MIN_REQUEST_INTERVAL_MS (2,500–60,000)
no faster than both 2,500 ms and the plan's requests/minute budget.
The separate V2 publisher and Data Engine owner switches remain OFF unless
independently authorized. A pilot-only Worker cannot enter full mode.

When selected after a genuine Worker claim/lease, the existing single-session
Wicket stream verifies the official total, each real 50-ID page (including
the partial last page), exact per-page IDs/response digests, cross-page
uniqueness, Wicket callback origin and total/resume drift. The claim-scoped
streaming executor commits the redacted source page, projection, prepared V2
request, per-page resume proof and page-scoped cumulative index checkpoint
(five immutable artifacts per page) before requesting the next page. The
page-scoped checkpoint URI is unique within each claim, and validates the
exact completedPage when parsed. Since the shared executor caps a single Job
at 8,000 artifacts, this first Work refuses source totals requiring more than
1,600 index pages; a larger source needs a separately reviewed shard budget.
The checkpoint's complete bit describes only the source-ID index, not all
trade mark details, logos, Data Engine admission or current legal status.
Source 403,
challenge, session expiry, 429/5xx exhaustion, schema drift, budget exhaustion
or callback mismatch fails the Job; previously finalized Knowledge artifacts
remain durable but no complete-baseline receipt is fabricated.

This first full-index route explicitly does not accept caller-supplied
resume checkpoints: they must be resolved in a later authorized Work from
actual accepted immutable Knowledge artifacts. A failed long Job may therefore
revisit the index from page 1; plan a verified resume/frozen-coverage Work
before approving any costly repeated production crawl. No details/logo work,
legal-currentness assertion, Data Engine direct SQL, source scheduling or
continuous monitoring is introduced here.

Prerequisites for production activation remain Knowledge #903 genuine
authenticated 50+50+1 source/RawArtifact/publisher readback, operator-reviewed
official access terms and budgets, genuine Core user/workspace authorization,
approved cross-Source publisher grant, and independent V2 owner schema/switch.
Current local Core test DB on isolated port 15432 has zero real users and
workspaces; do not seed fake admin identities to satisfy these gates.
