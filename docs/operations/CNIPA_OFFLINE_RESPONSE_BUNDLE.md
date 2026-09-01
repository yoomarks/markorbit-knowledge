# CNIPA offline authenticated response-bundle assessment

Status: permitted current Phase 3 business-response evidence path while the supported Playwright session remains blocked by CNIPA access control.

Parent issue: #573  
Implementation issue: #633

## Purpose

Ordinary Chrome is currently usable by the authorized operator, while the Playwright-launched session is blocked by the CNIPA access-control layer. NetLog evidence has already established transport facts, and official frontend static code has established request-construction/client-consumption expectations. Neither source contains authenticated business response bodies.

This workflow adds a narrower evidence channel: the operator manually saves only selected DevTools **Response** JSON bodies from an ordinary authorized Chrome session. A local offline assessor compares those saved JSON bodies with the already-frozen frontend expected-field checklist and writes a sanitized structural manifest.

The assessor performs **zero browser operations and zero CNIPA/network requests**.

## Hard safety boundary

Do not use this workflow to bypass or evade CNIPA controls.

Do **not**:

- export, copy, paste or persist `Authorization` headers, cookies, bearer tokens, session storage, local storage, browser profiles or SSO material;
- save or upload HAR files, especially HAR-with-content;
- attach automation to the ordinary logged-in Chrome session;
- replay authenticated requests outside the ordinary authorized browser;
- use stealth/fingerprint/UA changes, CAPTCHA automation, proxy rotation or other access-control circumvention;
- commit the raw response files, descriptor or assessment output to Git;
- paste raw response content into a GitHub issue or PR.

Use only a legitimate operator-authenticated ordinary Chrome session and only operations the operator is authorized to perform manually.

## External working directory

Keep every artifact outside the repository working tree. Example:

```text
D:\markorbit-private\cnipa\response-bundle-001\
  descriptor.json
  registration-list.json
  registration-detail.json
```

Use a separate new output directory for each assessment, for example:

```text
D:\markorbit-private\cnipa\assessment-001
```

The assessor rejects repository-internal paths. Response filenames in the descriptor must be simple relative filenames. The implementation also resolves real filesystem paths before reading evidence so a symlink cannot escape the response-bundle directory.

Current limits are:

- descriptor: 1 MiB maximum;
- entries: 50 maximum;
- each response file: 20 MiB maximum;
- all response files in one bundle: 100 MiB maximum.

## 1. Capture one bounded Response body

In ordinary Chrome:

1. Authenticate normally and complete any human security/CAPTCHA steps yourself.
2. Open DevTools **Network** before performing the bounded authorized CNIPA operation.
3. Clear unrelated network history where practical.
4. Perform one bounded search or open one bounded detail result.
5. Select the matching frozen CNIPA judgment request.
6. Confirm the request is the expected `POST` endpoint.
7. In the DevTools **Response** view, save/copy **only the response body** into a `.json` file in the external response-bundle directory.

Do not use **Save all as HAR with content**. Do not copy the Headers, Cookies, Payload, Authorization or browser storage panels.

For initial evidence, prefer one small successful LIST response with at least one row and its corresponding DETAIL response. Additional libraries can be captured as separate bounded entries.

## 2. Create the descriptor manually

The descriptor contains only non-secret transport metadata already established by prior evidence plus the local response filename.

Synthetic example:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "registration-list-1",
      "documentKind": "REGISTRATION_EXAMINATION",
      "surface": "LIST",
      "method": "POST",
      "path": "/toas-pub-prod/pub-prod-api/pubnotice/portal/tmscJudgment/queryPageList",
      "responseFile": "registration-list.json",
      "status": 200,
      "contentType": "application/json"
    },
    {
      "id": "registration-detail-1",
      "documentKind": "REGISTRATION_EXAMINATION",
      "surface": "DETAIL",
      "method": "POST",
      "path": "/toas-pub-prod/pub-prod-api/pubnotice/portal/tmscJudgment/queryInfo",
      "responseFile": "registration-detail.json",
      "status": 200,
      "contentType": "application/json"
    }
  ]
}
```

Allowed document kinds are:

- `REGISTRATION_EXAMINATION`;
- `OPPOSITION_DECISION`;
- `REVIEW_ADJUDICATION`.

The assessor requires `POST` and the exact frozen LIST/DETAIL path from `CNIPA_CANDIDATE_ENDPOINTS`. Unknown descriptor keys are rejected. Credential-like keys such as cookie/token/authorization/password/secret fields are rejected rather than ignored.

Do not put registration numbers, trademark names, party names, request payloads, query values, cookies or tokens into the descriptor.

## 3. Run the offline assessment

From the Knowledge repository on Windows PowerShell, use `pnpm.cmd`:

```text
pnpm.cmd --filter @markorbit/worker cnipa:evidence:assess-response-bundle -- `
  --descriptor "D:\markorbit-private\cnipa\response-bundle-001\descriptor.json" `
  --output "D:\markorbit-private\cnipa\assessment-001"
```

The output directory must not already exist. This is intentional: assessment output is create-once evidence and must not silently overwrite an earlier run.

The command performs no live request. Standard output contains only sanitized counts and safety-state booleans. Failure output does not echo raw response content, descriptor values or local paths.

## 4. Assessment output

The assessor writes only:

```text
<external-output-directory>\manifest.json
```

Raw response bodies stay in the original external response-bundle directory and are not copied into the assessment output.

For each entry, the manifest records only structural evidence such as:

- document kind, LIST/DETAIL surface, frozen method/path and HTTP status;
- response SHA-256 and byte count;
- valid/invalid UTF-8 JSON;
- expected `data.list` / `data.total` or detail `data` structural presence;
- list length, total value **type**, object/non-object row counts;
- already-known frontend expected field **names** that are present/missing;
- shared detail expected field **names** that are present/missing.

It intentionally does not copy response field values, unknown response field names, descriptor ids, response filenames, request values, headers, cookies, credentials or browser/session data into the manifest.

The top-level manifest explicitly records:

- `networkRequestPerformed: false`;
- `requestHeadersRead: false`;
- `cookiesRead: false`;
- `credentialValuesPersisted: false`;
- `responseValuesPersistedInManifest: false`;
- `verificationPromotionPerformed: false`.

## 5. Assessment statuses

`CONFORMS_STATIC_EXPECTED_SHAPE` means only that the saved JSON body structurally contains the frontend-consumed shape/field names already established from official static application code.

`MISMATCH_STATIC_EXPECTED_SHAPE` means the saved body is valid JSON but does not contain the expected structural shape or required expected fields.

`INSUFFICIENT_EMPTY_LIST` means the LIST response is structurally recognizable but contains no row, so row-field conformance cannot be observed.

`INVALID_JSON` means the saved body is not valid UTF-8 JSON.

None of these statuses automatically changes production CNIPA decoding, `CNIPA_JUDGMENT_SCHEMA_STATUS`, normalized field semantics or coverage classification.

## Evidence boundary

A conforming assessment can support only the statement that the operator-saved authenticated response body conformed to the already-observed frontend expected shape at that observation.

It does **not** by itself prove:

- which request input produced the saved response;
- real LIST -> DETAIL identity consistency;
- party-role or normalized field semantics;
- backend pagination/page-size/result caps;
- backend date-window limits;
- authenticated 403 meaning;
- completeness or exhaustive coverage;
- current/future CNIPA service stability.

Promotion decisions remain manual evidence review under #573. Do not mark the candidate schema verified or coverage complete from this manifest alone.

## Initial Phase 3 evidence sequence

After #633 is merged, collect the minimum business-response evidence in small independent captures rather than one broad export:

1. one non-empty registration-examination LIST response;
2. its manually opened DETAIL response;
3. one non-empty opposition LIST response and selected DETAIL response;
4. one non-empty review LIST response and selected DETAIL response.

Assess each bounded bundle locally. Review the sanitized manifest first. Only if additional semantics are still required should a separately sanitized, minimal business-response sample be prepared for engineering review.
