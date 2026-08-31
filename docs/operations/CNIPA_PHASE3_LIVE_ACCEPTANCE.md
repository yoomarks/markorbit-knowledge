# CNIPA Phase 3 manual authenticated live acceptance

Status: operator-only acceptance harness. The Playwright-authenticated live path is currently blocked by an observed CNIPA access-control gate; do not execute or bypass it. Use the ordinary-Chrome NetLog evidence workflow for currently available transport evidence.

Parent issue: #573  
Implementation issue: #576

## Safety boundary

The Phase 3 harness exists only to collect controlled authenticated evidence needed to verify the currently `OPERATOR_SUPPLIED_UNVERIFIED` CNIPA candidate mappings.

It does **not** solve CAPTCHA, automate SSO, forge/extract tokens, add stealth/evasion behavior, rotate proxies, bypass backend limits, attach automation to an ordinary logged-in browser, copy/replay cookies or bearer tokens, or create a public scraping endpoint.

The harness must never be invoked by normal PR CI or converted into an automatic scheduled/live workflow. Both probe plans and evidence output directories must be absolute paths outside the repository working tree.

## Current authentication gate

A/B testing on 2026-09-01 established the current operational boundary:

- ordinary Chrome can use the current CNIPA public login entry;
- the same entry is blocked when Chrome is launched through the Playwright persistent-session path;
- therefore the remaining failure is treated as an external access-control/anti-automation gate, not a local browser executable/profile/path defect.

Do **not** respond by changing browser fingerprints/UA, adding stealth behavior, exporting or copying cookies/tokens, attaching automation to the ordinary logged-in browser, rotating proxies, or otherwise circumventing CNIPA access controls.

While this gate remains, use `docs/operations/CNIPA_OFFLINE_NETLOG_EVIDENCE.md` and ordinary Chrome `chrome://net-export/` for bounded transport evidence. The authenticated live harness below remains implemented for a future site-permitted session path, but it is not currently an executable acceptance route.

## Observed transport boundary

Sanitized ordinary-Chrome NetLog evidence has established the transport host/path/method surface only:

- host: `pub.sbj.cnipa.gov.cn`;
- full API prefix: `/toas-pub-prod/pub-prod-api/pubnotice/portal`;
- list requests for all three judgment libraries use `POST`;
- detail requests for all three judgment libraries also use `POST`;
- the detail request URL includes query parameter key `id`.

The sanitizer intentionally outputs only allowlisted query parameter names. Observing `id` therefore does **not** prove that no other query parameter names were present in the original URL.

These observations do **not** verify request payload fields, response envelope/schema, list-to-detail identity semantics, party-role semantics, pagination limits, coverage completeness, or authenticated application behavior. Those remain Phase 3 validation work.

## 1. Future authenticated browser-session preparation

Only if CNIPA later permits the supported headed Playwright session path, configure the same CNIPA runtime environment used by the Phase 2 Worker:

- `MARKORBIT_CNIPA_BASE_URL`
- `MARKORBIT_CNIPA_SESSION_ENTRY_URL`
- `MARKORBIT_CNIPA_USER_DATA_DIR`
- `MARKORBIT_CNIPA_BROWSER_EXECUTABLE_PATH`
- optional `MARKORBIT_CNIPA_BEARER_STORAGE` lookup metadata when required by the observed browser application

The operator entry point is:

```text
pnpm.cmd --filter @markorbit/worker cnipa:session:login
```

Complete SSO/CAPTCHA/security verification manually only when the site permits the session. If the browser is blocked by CNIPA access control, stop; do not attempt to evade the block.

## 2. External probe-plan shape

The harness retains an external-plan format for a future authorized live run. Store plans outside the repository and use only fields established by evidence.

```json
{
  "version": 1,
  "probes": [
    {
      "id": "registration-examination-page-1",
      "documentKind": "REGISTRATION_EXAMINATION",
      "surface": "LIST",
      "method": "POST",
      "path": "/toas-pub-prod/pub-prod-api/pubnotice/portal/tmscJudgment/queryPageList",
      "jsonBody": {
        "pageIndex": 1,
        "pageSize": 10,
        "regNo": "<real-registration-number>"
      }
    }
  ]
}
```

The harness accepts only the three frozen observed list/detail endpoint paths already recorded in `CNIPA_CANDIDATE_ENDPOINTS` and enforces `POST` for both list and detail probes.

Detail probes require the observed `id` query key. Additional non-credential query keys may be included only after their exact names are established by a separate permitted evidence source; the current allowlisted NetLog summary does not prove their absence. Do not invent parameter names.

Likewise, party-name/date-range parameter names remain unverified. Add them only after their exact names and semantics are established through a permitted evidence source such as official static application code or separately reviewed sanitized evidence.

## 3. Local plan validation

When a future probe plan is prepared, validate it without network access first:

```text
pnpm.cmd --filter @markorbit/worker cnipa:acceptance:live -- --plan "D:\markorbit-private\cnipa\probe-plan.json"
```

This performs only local plan validation. It does not launch a browser and does not make a CNIPA request. Output explicitly reports `liveRequestPerformed: false`.

## 4. Future authorized live execution

Do not execute this while the current Playwright access-control gate remains.

If a supported CNIPA session path later becomes legitimately usable, the bounded live command is:

```text
pnpm.cmd --filter @markorbit/worker cnipa:acceptance:live -- `
  --plan "D:\markorbit-private\cnipa\probe-plan.json" `
  --output "D:\markorbit-private\cnipa\evidence\<run-folder>" `
  --execute-live-cnipa
```

The explicit `--execute-live-cnipa` switch and external `--output` directory are mandatory. The existing executor applies bounded request count, minimum request interval, response-size limit, same-run cache and fail-closed session handling.

## 5. Evidence format

For an authorized future live run, each non-empty source response is written byte-for-byte to the external evidence directory. `manifest.json` records:

- probe id, document kind, surface, method and frozen path;
- request SHA-256;
- query/body **field names only** (not their values);
- response file name, SHA-256 and byte count;
- status/security state;
- resolved source URI, observed timestamp and content type;
- whether a JSON response parsed as valid UTF-8 JSON.

The manifest does not duplicate registration numbers, party-name values or other request payload values. The external probe plan remains the controlled mapping between a probe id and its authorized case input.

Do not upload the browser profile, storage state, plan, raw NetLog or live response evidence to a public issue/PR or commit them to Git.

The harness itself does not decide verification; evidence must be reviewed before changing #573 or promoting the schema status.

## 6. Remaining Phase 3 acceptance facts

The following still require evidence before schema/coverage promotion:

1. one real registration-number result across all three document libraries;
2. actual list response envelope and source-record id field;
3. list -> detail request/response identity mapping;
4. real party-name request field names and party-role semantics, including opposition roles;
5. page 11 / >100 business-result behavior;
6. date-window behavior if the source exposes a date query;
7. authenticated 403 semantics when a supported authenticated execution path exists;
8. resulting coverage classification.

Ordinary-Chrome Default-mode NetLog can support transport/status observations but cannot establish the business/schema facts above. Until separate permitted evidence supports them, keep schema status `OPERATOR_SUPPLIED_UNVERIFIED` and coverage `UNKNOWN` or `PARTIAL` as applicable.
