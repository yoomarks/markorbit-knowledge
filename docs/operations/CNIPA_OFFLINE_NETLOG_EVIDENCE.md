# CNIPA ordinary-Chrome NetLog evidence workflow

Status: operator-only, offline evidence path for issue #573.

Use this path when the authorized CNIPA portal is usable in an ordinary Chrome session but the Playwright-launched browser is blocked by the site's access-control layer. This workflow does not automate CNIPA login or authenticated requests.

## Safety boundary

- Capture is performed manually in ordinary Chrome through `chrome://net-export/`.
- Use the normal `Default` capture mode. Do not enable sensitive/raw-byte capture merely to obtain request or response bodies.
- The raw NetLog can contain sensitive browser/network activity even in Default mode. Keep it outside the repository and do not upload it to GitHub, online viewers, issues or PRs.
- The sanitizer performs zero CNIPA network requests.
- It never exports request/response headers, cookies, Authorization values, URL query values, fragments or response bodies.
- Endpoint output is limited to fixed CNIPA allowlisted API paths.
- Static application output is limited to exact host `pub.sbj.cnipa.gov.cn`, the current `/toas-pub-prod/portalui-pub-prod/` application prefix, and `.js`, `.mjs`, or `.css` pathnames only.

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

If an existing completed Default-mode NetLog already contains the needed portal interaction, it may be sanitized again to a **new** output path. A new login or capture is not required merely to obtain the static-asset manifest added in issue #617.

## 2. Sanitize locally

From the Knowledge repository on Windows PowerShell:

```powershell
pnpm.cmd --filter @markorbit/worker cnipa:evidence:sanitize-netlog -- `
  --input "D:\markorbit-private\cnipa\netlog\cnipa-phase3.json" `
  --output "D:\markorbit-private\cnipa\evidence\summary-with-assets.json"
```

Both paths must be absolute and outside the repository working tree. The output path must not already exist.

The command prints only a small completion receipt. It reports the static-asset path count and whether the bounded asset list was truncated, but it does not print asset paths or raw URLs. The shareable artifact is the sanitized JSON summary after local inspection.

## 3. What the sanitized summary can establish

The sanitizer can preserve these bounded facts when they exist in Chrome NetLog:

- CNIPA host counts;
- fixed allowlisted endpoint path;
- observed HTTP method when attached to the NetLog URL event;
- detail query-key name `id` only, never its value;
- HTTP numeric status codes correlated through the same NetLog source id;
- original NetLog SHA-256, byte size, capture mode and event counts;
- unique official portal UI `.js`, `.mjs`, and `.css` request pathnames under `/toas-pub-prod/portalui-pub-prod/`, sorted and bounded to 200 entries.

The currently observed judgment surface is under:

```text
https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/
```

with `tmscJudgment`, `tmyyJudgment`, and `tmpsJudgment` list/detail paths.

An observed static application path establishes only that ordinary Chrome requested a resource at that pathname during the capture. It does not establish the resource contents, whether the resource can be fetched without authentication, whether it is current or authoritative for business semantics, or whether it proves authenticated API behavior.

If a static asset is later inspected through a permitted public or operator-controlled path, any field names or call construction learned from that content must be recorded separately as static-application-code evidence. Static-code observation is not a substitute for authenticated request/response evidence.

## 4. What NetLog does not establish

Default-mode NetLog evidence does **not** establish:

- request JSON payload field names or values;
- response envelope or response schema;
- business success merely from HTTP 200;
- list -> detail identity semantics;
- party-role semantics;
- whether a particular operator-entered registration number or party name produced a given request;
- page-11 / >100 business-result semantics;
- exhaustive coverage or completeness;
- static asset contents merely because an asset pathname was observed.

The summary therefore records `request_payload_fields` and `response_envelope` as `NOT_OBSERVED`. Do not promote #573 schema, identity, party-role, pagination or coverage acceptance solely from this evidence.

## 5. Static asset manifest handling

The sanitizer stores:

- `static_application_asset_path_count`: total unique matching pathnames observed in the raw NetLog;
- `static_application_asset_paths`: the first 200 unique matching pathnames in deterministic sorted order;
- `static_application_asset_paths_truncated`: whether more than 200 unique matching pathnames were observed.

Query strings and fragments are discarded before output. Requests to sibling CNIPA hosts, API paths outside the portal UI prefix, navigation pages, images, fonts and other extensions are not included in this manifest.

The manifest is intended only to identify candidate official application resources for a separate static-code evidence step. Do not automatically fetch authenticated resources, replay browser credentials, attach automation to the ordinary browser, or infer API semantics from filenames alone.

## 6. Evidence handling

Safe to review/share inside the engineering workflow after local inspection:

```text
D:\markorbit-private\cnipa\evidence\summary-with-assets.json
```

Keep private/local:

```text
D:\markorbit-private\cnipa\netlog\cnipa-phase3.json
```

`Default` capture mode reduces exposure but is not a guarantee that the raw log contains no secrets. The raw NetLog remains local evidence only.
