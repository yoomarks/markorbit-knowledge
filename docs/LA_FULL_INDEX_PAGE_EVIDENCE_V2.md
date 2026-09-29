# LA full-index page V2 — durable evidence mapping

The pure Knowledge mapper in
`packages/worker-runtime/src/laos-wopublish-full-baseline-artifacts.ts`
consumes one previously verified `LaosIndexPage` from the single-session
WoPublish source stream and emits four existing `AcquiredCollectionArtifact`
descriptors: redacted official page (HTML first page, XML thereafter),
ID projection, non-authoritative page checkpoint and a prepared
Data Engine V2 fact-admission request. Its output remains in Knowledge's
existing RawArtifact system; it does not create a second store, invoke Data
Engine, start browser acquisition, or establish a legal current register.

The V2 payload is strictly `FULL_INDEX_PAGE`, the true official source
record IDs, one-based page index, official `source_total`, and exact source
response / sanitized evidence SHA-256. Last-page size is calculated rather
than padded to 50. Application and registration numbers, normalized legal
status and other unevidenced fields remain null. A valid digest alone is
not a valid source: the upstream trusted adapter checks Wicket origins,
page coverage, 50/page, unique IDs across pages and resume drift.

Each page's checkpoint identifies that page and the **next numeric page
index**, not a reusable Wicket callback/session. It explicitly does not
claim the full 70k+ index is complete or that details/legal status are
current. Once a separately governed streaming Worker can finalize each
batch under its real Worker lease, it may persist one page before fetching
the next. The checkpoint has the exact prepared V2 request as its parent, which in
turn requires the page projection and original redacted response. Thus a
finalized checkpoint cannot exist without the page's complete prepared
admission evidence. The request cannot be published until it is a durable
RawArtifact referenced by the correct manual publisher Job, with an approved
cross-Source grant and the independent Knowledge/DE V2 enablement gates.

This implementation adds the mapper and tests only. The full streaming
executor, frozen all-page checkpoint manifest, successful pilot #903,
official source-policy/cost review, full detail/logo Work and production
enablement remain separate acceptance gates. Do not treat this mapping
merge as full collection authority or a complete LA database.
