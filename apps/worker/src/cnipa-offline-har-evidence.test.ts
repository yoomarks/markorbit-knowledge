import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  importCnipaOfflineHarEvidence,
  parseCnipaOfflineHarEvidence,
} from "./cnipa-offline-har-evidence";

const LIST_PATH =
  "/toas-pub-prod/pub-prod-api/pubnotice/portal/tmscJudgment/queryPageList";
const DETAIL_PATH = "/toas-pub-prod/pub-prod-api/pubnotice/portal/tmscJudgment/queryInfo";

type MutableListEntry = {
  request: {
    method: string;
    postData: { mimeType: string; text: string };
  };
};

function har() {
  return {
    log: {
      entries: [
        {
          request: {
            method: "POST",
            url: `https://pub.sbj.cnipa.gov.cn${LIST_PATH}`,
            headers: [
              { name: "Authorization", value: "Bearer must-not-leak" },
              { name: "Cookie", value: "session=must-not-leak" },
            ],
            cookies: [{ name: "session", value: "must-not-leak" }],
            postData: {
              mimeType: "application/json",
              text: JSON.stringify({
                pageIndex: 1,
                pageSize: 10,
                regNo: "REAL-VALUE-MUST-NOT-LEAK",
              }),
            },
          },
          response: {
            status: 200,
            headers: [{ name: "Set-Cookie", value: "must-not-leak" }],
            content: {
              mimeType: "application/json",
              text: JSON.stringify({
                records: [{ id: "public-record-1", regNo: "PUBLIC-RESPONSE" }],
              }),
            },
          },
        },
        {
          request: {
            method: "POST",
            url: `https://pub.sbj.cnipa.gov.cn${DETAIL_PATH}?id=SECRET-REQUEST-ID`,
            headers: [{ name: "Authorization", value: "Bearer must-not-leak" }],
          },
          response: {
            status: 200,
            content: {
              mimeType: "application/json",
              text: JSON.stringify({ id: "public-record-1", decision: "PUBLIC-DETAIL" }),
            },
          },
        },
        {
          request: {
            method: "GET",
            url: "https://example.com/not-cnipa",
          },
          response: { status: 200, content: { mimeType: "text/plain", text: "ignored" } },
        },
      ],
    },
  };
}

describe("CNIPA offline HAR evidence", () => {
  it("keeps only frozen CNIPA transport metadata and request field names", () => {
    const entries = parseCnipaOfflineHarEvidence(har());
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      surface: "LIST",
      method: "POST",
      path: LIST_PATH,
      queryKeys: [],
      jsonBodyKeys: ["pageIndex", "pageSize", "regNo"],
      requestBodyJsonValid: true,
      status: 200,
      responseJsonValid: true,
    });
    expect(entries[1]).toMatchObject({
      surface: "DETAIL",
      method: "POST",
      path: DETAIL_PATH,
      queryKeys: ["id"],
      jsonBodyKeys: [],
    });
  });

  it(
    "writes external response evidence without leaking request credentials or values into the manifest",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "markorbit-cnipa-har-"));
      const inputPath = path.join(root, "capture.har");
      const outputDirectory = path.join(root, "evidence");
      const source = JSON.stringify(har());
      await writeFile(inputPath, source, "utf8");

      const manifest = await importCnipaOfflineHarEvidence({
        inputPath,
        outputDirectory,
        workingDirectory: path.join(root, "repo"),
      });
      const manifestText = await readFile(path.join(outputDirectory, "manifest.json"), "utf8");

      expect(manifest.matchedEntryCount).toBe(2);
      expect(manifestText).not.toContain("must-not-leak");
      expect(manifestText).not.toContain("REAL-VALUE-MUST-NOT-LEAK");
      expect(manifestText).not.toContain("SECRET-REQUEST-ID");
      expect(manifestText).not.toContain("Authorization");
      expect(manifestText).not.toContain("Cookie");
      expect(manifestText).toContain('"jsonBodyKeys": [');
      expect(manifestText).toContain('"regNo"');

      const firstResponse = manifest.entries[0]?.responseFile;
      expect(firstResponse).toBeTruthy();
      const responseText = await readFile(path.join(outputDirectory, firstResponse!), "utf8");
      expect(responseText).toContain("PUBLIC-RESPONSE");
    },
  );

  it("fails closed on transport drift or credential-like request-body fields", () => {
    const wrongMethod = har();
    (wrongMethod.log.entries[0] as MutableListEntry).request.method = "GET";
    expect(() => parseCnipaOfflineHarEvidence(wrongMethod)).toThrow(/must use POST/);

    const credentialBody = har();
    (credentialBody.log.entries[0] as MutableListEntry).request.postData.text = JSON.stringify({
      pageIndex: 1,
      authToken: "must-not-be-accepted",
    });
    expect(() => parseCnipaOfflineHarEvidence(credentialBody)).toThrow(/credential-like/);
  });
});
