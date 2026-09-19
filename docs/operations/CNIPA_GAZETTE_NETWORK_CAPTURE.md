# CNIPA Trademark Gazette acquisition with MO CNIPA Network Capture

Status: implementation contract for #833.

## Source model

The China Trademark Gazette is a periodical source, not a fourth judgment-document library.

The historical acquisition unit is **announcement issue number**.

Operator-supplied planning baseline:

- issue 73: 1983-07-15;
- current known issue 1999: 2026-09-13;
- early cadence was generally semi-monthly, commonly 2 issues/month with some 3-issue months;
- current expected publication days are the 6th, 13th, 20th and 27th.

These calendar facts are scheduling/planning evidence only. Do not synthesize old issue dates.

## Capture mechanism

Do not use manual DevTools response export as the primary Gazette evidence path.

Extend the existing Chrome extension **MO CNIPA Network Capture**, already used for the three CNIPA judgment libraries.

The extension uses the normal authorized Chrome session and CDP through `chrome.debugger`:

- `Network.enable`
- response/request observation
- `Network.getResponseBody`

It does not require DevTools to be open.

Existing v0.7/v0.8 behavior to reuse:

- capture the most recent successful LIST POST body;
- replay only bounded pageIndex/pageSize changes;
- pageSize=100;
- transient `-102/-107` retry;
- HTTP transient retry;
- repeated-page / no-new-data diagnostics;
- deterministic dataset export.
- replay the captured POST body against the canonical Gazette LIST path only; never replay captured `FECU` or other query-string values from `sourceUrl`.

## Gazette LIST endpoint

`POST /toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg`

For a historical issue capture:

1. open the official `brandNotice` page normally;
2. enter the target announcement issue;
3. set announcement type to **全部**;
4. perform one normal query;
5. Network Capture observes the successful POST body;
6. verify that the captured body contains:
   - non-empty `anncIssue`;
   - `anncType: ""` (the official frontend value for 全部);
7. sweep pages by preserving the captured body and changing only:
   - `pageIndex`;
   - `pageSize: 100`.

The official frontend page-size selector exposes 10/20/50/100.

## Gazette verification datasets

The browser extension is a **verification tool**, not the production historical-backfill runtime.

Use bounded sibling schemas rather than the judgment-specific `mo-cnipa-query-dataset-v2` contract:

- `mo-cnipa-gazette-verification-v1` for first/last boundary samples;
- `mo-cnipa-gazette-small-complete-v1` for a complete small historical issue.

Verified live issue-1999 evidence shows that a current issue may contain hundreds of thousands of rows, so a browser popup must not be treated as the durable whole-history acquisition engine.

The official LIST row `id` is the source row identity. Observed live rows also expose `searchId`, with `searchId == id`. A canonical full-row SHA-256 remains useful for integrity/replay comparison, not as the primary event identity.

## Verified live source rows

Issue-1999 live capture confirms these source fields on Gazette LIST rows:

- `id`
- `searchId`
- `anncIssue`
- `anncDate`
- `anncType`
- `anncTypeName`
- `regNo`
- `registerCnName`
- `registerCnAddress`
- `registerEnName`
- `registerEnAddress`
- `agentName`
- `tmName`
- `intlCls`
- `applyDate`
- `pageNo`
- `fileId`
- `imgDir`
- `anncPageNum`

The LIST itself therefore contains the PDF/detail asset locator material. A per-row `searchEsTmggFile` call is not required merely to discover the asset path.

Multiple trademark rows may share the same `fileId/imgDir`, so Knowledge detail candidates should be deduplicated at Gazette-page/asset level rather than one candidate per trademark row.

Issue-75 live evidence additionally proves historical compatibility requirements:

- issue 75 = 1983-08-15;
- source total = 576;
- at pageSize=100 the source reports 6 pages;
- historical `id/searchId` values may be 32-character hexadecimal strings rather than modern decimal ids;
- `registerCnName`, `registerCnAddress`, `tmName`, `intlCls`, `applyDate`, and related descriptive fields may legitimately be null;
- historical detail assets may be `.jpg`, while modern issues also expose `.pdf` assets.

Therefore row identity and detail-asset handling must remain string/media-type agnostic across eras.

## Data ownership

### Data Engine: Gazette issue catalog

Persist objective issue facts:

- announcement issue;
- announcement date;
- record count;
- collected at;
- exact source provenance/fingerprint.

### Data Engine: Gazette announcement entries

Persist only the minimal objective announcement event:

- official source row identity;
- registration number;
- announcement issue;
- announcement type;
- announcement detail/source locator references;
- collection/provenance fields.

Do **not** duplicate applicant, trademark name, class, application date, address, agent or other trademark-entity attributes in the Gazette announcement table. Resolve those through the existing Data Engine trademark entity by registration number.

### Knowledge: detail acquisition candidate

An official PDF/image/detail URL is registered as a **pending acquisition candidate**.

Do not bulk-download every detail by default.

### Brain / Capability

Brain/value methods may determine whether a detail candidate has research/value relevance.
A governed Capability/Knowledge execution path may then acquire the selected PDF/image.

Publication existence alone is not a legal conclusion and does not authorize a business action.

## Governed production runtime wiring

Production execution is split into three least-privilege Worker providers. None of these providers plans or starts the historical replay by itself.

- `cnipa-gazette`: authenticated CNIPA checkpoint acquisition only. Requires the operator-managed CNIPA browser-session environment. A checkpoint is bounded to at most 100 pages and defaults to 25 pages.
- `cnipa-gazette-publisher`: reads an already-durable Knowledge fact-admission request under the active Worker lease, verifies canonical URI/SHA/size, and posts only to the Data Engine fact-admission endpoints. Requires `MARKORBIT_DATA_ENGINE_URL` plus the dedicated `MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY`; the key must satisfy the Data Engine minimum 32-character admission-key rule. It does not receive a CNIPA browser session.
- `cnipa-gazette-finalize`: reads the durable dataset identity plus durable CHUNK admission receipts from Knowledge, with receipt reads bounded to 8 concurrent requests. It emits a durable FINALIZE request only after contiguous page coverage is proven. It receives neither CNIPA credentials nor Data Engine write credentials.

Durable Knowledge artifact reads are available only through the lease-scoped Worker endpoint and only for RawArtifact ids explicitly referenced by the immutable Gazette publisher/finalize Job snapshot. The endpoint also enforces workspace ownership and stored SHA/size integrity before streaming bytes.

The production lineage is therefore:

`official page -> durable raw/projection/checkpoint/dataset identity -> durable CHUNK request -> Data Engine CHUNK receipt -> durable FINALIZE request -> Data Engine FINALIZE receipt`.

Data Engine mutation never occurs before the corresponding request artifact is durable in Knowledge.

## Historical backfill

Historical floor is issue 73.

For each issue:

1. capture issue + 全部;
2. page at 100 rows/page;
3. verify terminal/repeat behavior;
4. write/update issue catalog metadata;
5. project announcement rows to Data Engine;
6. register detail URLs in Knowledge as candidates only.

Do not run the full historical replay without separate production authorization.

## Incremental

The current 6/13/20/27 calendar is a scheduling hint.

The durable trigger is the official observed max/current issue:

- if source max issue > last completed issue, enqueue each missing issue number;
- do not infer that an issue is absent solely because a calendar date passed.

## Promotion gate

The validation gate is intentionally bounded.

Required evidence is:

1. **one large issue boundary validation**
   - first 3 pages at pageSize=100;
   - last 3 pages at pageSize=100;
   - stable `total/pages` across the sampled pages;
   - official `id/searchId` consistency;
   - final-page length matching `total % 100` (or 100 when evenly divisible);
2. **one small historical issue complete validation**
   - page 1 through final page;
   - collected row count equals source total;
   - unique official row ids equal source total;
   - final-page length matches the expected remainder.

This is sufficient to freeze schema, pagination and completeness semantics. A large current issue does not need to be fully downloaded in the browser merely for validation.

Production replay from issue 73 onward belongs to a separate checkpointed runtime with separate authorization.
