import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeCnipaNetLog, summarizeCnipaNetLog } from "./cnipa-offline-netlog-evidence";

const DETAIL_PATH = "/toas-pub-prod/pub-prod-api/pubnotice/portal/tmscJudgment/queryInfo";

function netLog() {
  return {
    constants: {
      logCaptureMode: "Default",
      logEventTypes: {
        URL_REQUEST_START_JOB: 1,
        HTTP_TRANSACTION_READ_RESPONSE_HEADERS: 2,
      },
    },
    events: [
      {
        type: 1,
        source: { id: 10 },
        params: {
          url: `https://pub.sbj.cnipa.gov.cn${DETAIL_PATH}?id=SECRET_VALUE&token=SECRET_VALUE#SECRET_VALUE`,
          method: "POST",
          headers: ["Authorization: SECRET_VALUE"],
        },
      },
      "ignored-non-object-event",
      {
        type: 2,
        source: { id: 10 },
        params: { headers: ["HTTP/1.1 200 OK", "Set-Cookie: SECRET_VALUE"] },
      },
      {
        type: 2,
        source: { id: 99 },
        params: { headers: ["HTTP/1.1 403 Forbidden"] },
      },
      {
        type: 1,
        params: { url: "https://unrelated.example/SECRET_VALUE", method: "GET" },
      },
    ],
  };
}

describe("CNIPA offline NetLog evidence", () => {
  it("keeps only allowlisted transport facts and same-source HTTP status", () => {
    const raw = Buffer.from(JSON.stringify(netLog()), "utf8");
    const result = summarizeCnipaNetLog(raw);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("SECRET_VALUE");
    expect(serialized).not.toContain("unrelated.example");
    expect(serialized).not.toContain("Set-Cookie");
    expect(serialized).not.toContain("Authorization");
    expect(result.capture_mode).toBe("Default");
    expect(result.event_count).toBe(5);
    expect(result.observed_request_start_events).toHaveLength(1);
    expect(result.observed_request_start_events[0]).toMatchObject({
      host: "pub.sbj.cnipa.gov.cn",
      path: DETAIL_PATH,
      method: "POST",
      allowlisted_query_parameter_names: ["id"],
      http_status_codes: [200],
      response_status_event_indices_zero_based: [2],
      request_payload_fields: "NOT_OBSERVED",
      response_envelope: "NOT_OBSERVED",
    });
  });

  it("does not export unknown CNIPA paths or their values", () => {
    const raw = Buffer.from(
      JSON.stringify({
        events: [
          {
            params: {
              url: "https://pub.sbj.cnipa.gov.cn/SECRET_VALUE?id=SECRET_VALUE",
              method: "POST",
            },
          },
        ],
      }),
      "utf8",
    );
    const result = summarizeCnipaNetLog(raw);
    expect(JSON.stringify(result)).not.toContain("SECRET_VALUE");
    expect(result.candidate_endpoint_url_events).toEqual([]);
  });

  it("writes only the sanitized summary outside the repository working tree", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "markorbit-cnipa-netlog-"));
    const inputPath = path.join(root, "netlog.json");
    const outputPath = path.join(root, "evidence", "summary.json");
    await writeFile(inputPath, JSON.stringify(netLog()), "utf8");

    const summary = await sanitizeCnipaNetLog({
      inputPath,
      outputPath,
      workingDirectory: path.join(root, "repo"),
    });
    const output = await readFile(outputPath, "utf8");

    expect(summary.observed_request_start_events).toHaveLength(1);
    expect(output).not.toContain("SECRET_VALUE");
    expect(output).not.toContain("Authorization");
    expect(output).not.toContain("Set-Cookie");
    expect(output).toContain('"request_payload_fields": "NOT_OBSERVED"');
  });
});
