# CNIPA ordinary-Chrome NetLog evidence workflow

Status: operator-only, offline evidence path for issue #573.

Use this path when the authorized CNIPA portal is usable in an ordinary Chrome session but the Playwright-launched browser is blocked by the site's access-control layer. This workflow does not automate CNIPA login or authenticated requests.

## Safety boundary

- Capture is performed manually in ordinary Chrome through `chrome://net-export/`.
- Use the normal `Default` capture mode. Do not enable sensitive/raw-byte capture merely to obtain request or response bodies.
- The raw NetLog can contain sensitive browser/network activity even in Default mode. Keep it outside the repository and do not upload it to GitHub, online viewers, issues or PRs.
- The sanitizer performs zero CNIPA network requests.
- It never exports request/response headers, cookies, Authorization values, URL query values, fragments or response bodies.
- Only fixed CNIPA allowlisted paths can appear in the sanitized summary.

## 1. Capture with ordinary Chrome

1. Open `chrome://net-export/` in the same ordinary Chrome installation used for the authorized CNIPA portal.
2. Leave capture mode at **Default**.
3. Start logging to a file outside the repository, for example:

```text
D:\markorbit-private\cnipa\netlog\cnipa-phase3.json
```

4. In another ordinary Chrome tab, perform only the authorized CNIPA interactions needed for the current evidence step.
5. Return to `chrome://net-export/`, choose **Stop Logging**, and wait for the file to finish writing.

Do not upload the raw file.

## 2. Sanitize locally

From the Knowledge repository on Windows PowerShell:

```powershell
pnpm.cmd --filter @markorbit/worker cnipa:evidence:sanitize-netlog -- `
  --input "D:\markorbit-private\cnipa\netlog\cnipa-phase3.json" `
  --output "D:\markorbit-private\cnipa\evidence\summary.json"
```

Both paths must be absolute and outside the repository working tree. The output path must not already exist.

The command prints only a small completion receipt. The shareable artifact is the sanitized `summary.json`.

## 3. What the sanitized summary can establish

The sanitizer can preserve these bounded facts when they exist in Chrome NetLog:

- CNIPA host counts;
- fixed allowlisted endpoint path;
- observed HTTP method when attached to the NetLog URL event;
- detail query-key name `id` only, never its value;
- HTTP numeric status codes correlated through the same NetLog source id;
- original NetLog SHA-256, byte size, capture mode and event counts.

The currently observed judgment surface is under:

```text
https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/
```

with `tmscJudgment`, `tmyyJudgment`, and `tmpsJudgment` list/detail paths.

## 4. What NetLog does not establish

Default-mode NetLog evidence does **not** establish:

- request JSON payload field names or values;
- response envelope or response schema;
- business success merely from HTTP 200;
- list -> detail identity semantics;
- party-role semantics;
- whether a particular operator-entered registration number or party name produced a given request;
- page-11 / >100 business-result semantics;
- exhaustive coverage or completeness.

The summary therefore records `request_payload_fields` and `response_envelope` as `NOT_OBSERVED`. Do not promote #573 schema, identity, party-role, pagination or coverage acceptance solely from this evidence.

## 5. Evidence handling

Safe to review/share inside the engineering workflow after local inspection:

```text
D:\markorbit-private\cnipa\evidence\summary.json
```

Keep private/local:

```text
D:\markorbit-private\cnipa\netlog\cnipa-phase3.json
```

`Default` capture mode reduces exposure but is not a guarantee that the raw log contains no secrets. The raw NetLog remains local evidence only.
