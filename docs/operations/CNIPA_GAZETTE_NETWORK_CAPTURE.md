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

Production mutation is split into least-privilege stages, but Gazette source acquisition must respect the source's browser-access boundary.

- The former `cnipa-gazette` Playwright provider is **disabled**. The official Gazette site rejects that browser-launch path; it must not be used as a production acquisition fallback.
- Gazette source acquisition begins in a **normally opened, operator-authorized Chrome tab** with **MO CNIPA Network Capture** attached through `chrome.debugger`. The extension observes the successful official request and replays only bounded page changes inside that already-authorized page context.
- `cnipa-gazette-publisher`: reads an already-durable Knowledge fact-admission request under the active Worker lease, verifies canonical URI/SHA/size, and posts only to the Data Engine fact-admission endpoints. Requires `MARKORBIT_DATA_ENGINE_URL` plus the dedicated `MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY`; the key must satisfy the Data Engine minimum 32-character admission-key rule. It receives no CNIPA browser credentials.
- `cnipa-gazette-finalize`: reads the durable dataset identity plus durable CHUNK admission receipts from Knowledge, with receipt reads bounded to 8 concurrent requests. It emits a durable FINALIZE request only after contiguous page coverage is proven. It receives neither CNIPA credentials nor Data Engine write credentials.

The bounded #860 acceptance imports a complete v0.9.4 capture offline. A separately governed streaming/browser-extension bridge is still required before any historical production replay can be enabled.

Durable Knowledge artifact reads are available only through the lease-scoped Worker endpoint and only for RawArtifact ids explicitly referenced by the immutable Gazette publisher/finalize Job snapshot. The endpoint also enforces workspace ownership and stored SHA/size integrity before streaming bytes.

The production lineage is therefore:

`normal official browser session -> durable v0.9.4 capture root -> durable raw/projection/checkpoint/dataset identity -> durable CHUNK request -> Data Engine CHUNK receipt -> durable FINALIZE request -> Data Engine FINALIZE receipt`.

Data Engine mutation never occurs before the corresponding request artifact is durable in Knowledge.

Cross-Source RawArtifact lineage is fail-closed. The default rule remains same-workspace **and same-Source**. A multi-stage Gazette Job may reference a parent from another Source only when the immutable Job snapshot explicitly grants that exact RawArtifact id through `x-markorbit-cross-source-parent-artifact-ids`; the grant never permits a cross-workspace parent.

## Bounded production acceptance (#860)

Production promotion uses one separately authorized, full-chain acceptance plan. It is intentionally narrower than the general Gazette runtime:

- issue: **75** only;
- date: **1983-08-15**;
- announcement type: **ALL** with `anncType: ""`;
- expected total: **576**;
- pageSize: **100**;
- pages: **1..6**;
- expected page row counts: **100, 100, 100, 100, 100, 76**;
- one CHUNK covering pages 1..6;
- no neighboring issue;
- no detail-image/PDF bulk acquisition;
- no issue 73 -> current replay.

The frozen plan is SHA-bound and apply requires an exact `GO #860 CNIPA-GAZETTE ... FULL_CHAIN <sha256>` token. Plan validation alone performs no CNIPA request, Knowledge mutation, or Data Engine write.

The acceptance chain is four one-shot Worker stages:

1. `IMPORT_CAPTURE`: imports a complete **MO CNIPA Network Capture v0.9.4** issue-75 export. The immutable Job binds the external file SHA-256, byte size, filename, issue/range and captured query. The original export becomes the durable lineage root; the existing Gazette artifact builder then reconstructs pages 1..6 offline and persists raw pages, projections, checkpoint, dataset identity and CHUNK request.
2. `PUBLISH_CHUNK`: reads only the exact durable CHUNK request granted by its immutable Job and persists the Data Engine CHUNK receipt.
3. `BUILD_FINALIZE`: reads only the exact dataset identity plus CHUNK receipt from the prior frozen acceptance stages and persists the FINALIZE request.
4. `PUBLISH_FINALIZE`: reads only the exact durable FINALIZE request and persists the Data Engine FINALIZE receipt.

The accepted client is pinned to **MO CNIPA Network Capture v0.9.4** and the frozen bundle SHA-256 `5b1e4a788c261b2662827f6789bba7f10fa56d0c5699bcd6bd9fa373fe0afa2a`. The acceptance input schema is `mo-cnipa-gazette-small-complete-v1`. The verifier keeps the successful normal request's effective headers only in extension memory for same-session replay; authentication headers are never written into capture exports. Old v0.9.1/v0.9.3 raw captures and incomplete exports are not acceptable substitutes.

Before any GO authorization, the runner may validate `--plan` plus `--capture` locally. This verifies issue 75, date 1983-08-15, 576 rows, 6 pages, pageSize 100, terminal-page length 76, unique official ids, `searchId == id`, official source URL and captured ALL query. That validation performs no CNIPA network request, Knowledge mutation or Data Engine write.

Acceptance references are not merely same-workspace references: the Admin acceptance boundary also proves that each referenced RawArtifact came from the expected prior stage of the **same frozen acceptance plan**. Each reconstructed raw page must also descend from the durable v0.9.4 capture root.

The governed one-shot runner starts a clean Data Engine API from the merged #762 code on a separate loopback port with an ephemeral in-memory admission bearer key. It does not rewrite the existing Data Engine `.env`, restart the existing API service, or persist that key. The final manifest records only plan SHA, capture SHA/size/durable artifact id, run/job/worker ids, artifact ids/hashes/sizes, completeness assertions, and admission outcomes; credentials are excluded.

The operator opens the official `brandNotice` page **normally** in Chrome, starts MO CNIPA Network Capture v0.9.4, runs one normal issue-75 + 全部 query, then uses **完整验证小期**. The extension performs bounded replay in that already-working page context and exports the complete JSON file. Cookies, SSO state, CAPTCHA state and browser tokens never enter the Job snapshot or acceptance manifest.

Historical replay remains a separate authorization even after this bounded acceptance passes.

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
