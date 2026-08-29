# CNIPA Phase 3 manual authenticated live acceptance

Status: operator-only acceptance harness. This command is never invoked by normal PR CI and must not be converted into an automatic scheduled/live workflow.

Parent issue: #573  
Implementation issue: #576

## Safety boundary

The Phase 3 harness exists only to collect controlled authenticated evidence needed to verify the currently `OPERATOR_SUPPLIED_UNVERIFIED` CNIPA candidate mappings.

It does **not** solve CAPTCHA, automate SSO, forge/extract tokens, add stealth/evasion behavior, rotate proxies, bypass backend limits, or create a public scraping endpoint.

The persistent browser profile remains the authentication boundary. Cookies, browser storage values and Authorization headers stay inside the existing Playwright executor. Probe plans cannot contain headers, cookies, token-like fields, secrets or credentials.

Both the probe plan and the evidence output directory must be absolute paths outside the repository working tree.

## 1. Prepare the browser session

Configure the same CNIPA runtime environment used by the Phase 2 Worker:

- `MARKORBIT_CNIPA_BASE_URL`
- `MARKORBIT_CNIPA_SESSION_ENTRY_URL`
- `MARKORBIT_CNIPA_USER_DATA_DIR`
- `MARKORBIT_CNIPA_BROWSER_EXECUTABLE_PATH`
- optional `MARKORBIT_CNIPA_BEARER_STORAGE` lookup metadata when required by the observed browser application

Then open the headed operator login session:

```text
pnpm --filter @markorbit/worker cnipa:session:login
```

Complete CNIPA SSO/CAPTCHA/security verification manually, confirm the authenticated portal is usable, then press Ctrl+C to persist/close the browser profile.

## 2. Create an external probe plan

Example plan shape (store it outside the repository; replace placeholders only during an authorized live acceptance run):

```json
{
  "version": 1,
  "probes": [
    {
      "id": "registration-examination-page-1",
      "documentKind": "REGISTRATION_EXAMINATION",
      "surface": "LIST",
      "method": "POST",
      "path": "/pubnotice/portal/tmscJudgment/queryPageList",
      "jsonBody": {
        "pageIndex": 1,
        "pageSize": 10,
        "regNo": "<real-registration-number>"
      }
    },
    {
      "id": "registration-examination-page-11",
      "documentKind": "REGISTRATION_EXAMINATION",
      "surface": "LIST",
      "method": "POST",
      "path": "/pubnotice/portal/tmscJudgment/queryPageList",
      "jsonBody": {
        "pageIndex": 11,
        "pageSize": 10,
        "regNo": "<query-known-to-have-enough-results>"
      }
    }
  ]
}
```

The harness accepts only the three frozen candidate list/detail endpoint paths already recorded in `CNIPA_CANDIDATE_ENDPOINTS` and enforces `POST` for list probes and `GET` for detail probes. Detail probes require exactly one `id` query parameter.

Party-name/date-range parameter names are **not** supplied by the repository. If an authorized operator observes their exact request body in the authenticated browser, that observed body may be represented in the external probe plan for validation. Do not invent parameter names.

## 3. Validate the plan without network access

First run the command without the live switch:

```text
pnpm --filter @markorbit/worker cnipa:acceptance:live -- --plan "D:\markorbit-private\cnipa\probe-plan.json"
```

This performs only local plan validation. It does not launch a browser and does not make a CNIPA request. Output explicitly reports `liveRequestPerformed: false`.

## 4. Execute an authorized live probe

Only after the plan has been reviewed and the persistent browser session is authenticated:

```text
pnpm --filter @markorbit/worker cnipa:acceptance:live -- \
  --plan "D:\markorbit-private\cnipa\probe-plan.json" \
  --output "D:\markorbit-private\cnipa\evidence\2026-08-29" \
  --execute-live-cnipa
```

The explicit `--execute-live-cnipa` switch is mandatory. `--output` is also mandatory for live execution.

The existing Playwright executor still applies its bounded request count, minimum request interval, response-size limit, same-run cache and fail-closed session handling.

## 5. Evidence format

Each non-empty source response is written byte-for-byte to the external evidence directory. `manifest.json` records:

- probe id, document kind, surface, method and frozen path;
- request SHA-256;
- query/body **field names only** (not their values);
- response file name, SHA-256 and byte count;
- status/security state;
- resolved source URI, observed timestamp and content type;
- whether a JSON response parsed as valid UTF-8 JSON.

The manifest does not duplicate registration numbers, party-name values or other request payload values. The external probe plan remains the controlled mapping between a probe id and its authorized case input.

Do not upload the browser profile, storage state, plan or live response evidence to a public issue/PR or commit them to Git.

## 6. Phase 3 acceptance sequence

Use separate reviewed probe plans/evidence to establish, in order:

1. one real registration number across all three document libraries;
2. actual list envelope and source-record id field;
3. one list id -> detail request and identity match per relevant library;
4. one real party-name query after its request parameters are observed, including opposition party-role semantics;
5. page 11 / >100 behavior using a legitimate query that can exercise the boundary;
6. date-window partition behavior if the source exposes an observed date query;
7. authenticated 403 semantics (reauthentication challenge vs permanent access denial).

Only after evidence supports these facts may production constants/schema revision be promoted from `OPERATOR_SUPPLIED_UNVERIFIED`. Until then coverage remains `UNKNOWN` or `PARTIAL` as applicable.
