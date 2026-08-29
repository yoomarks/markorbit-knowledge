import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { IpAustraliaManualFullAcquisitionReport } from "./ip-australia-manual-full-acquisition";
import {
  emitIpAustraliaManualFullAcquisitionReport,
  ipAustraliaManualFullAcquisitionExitCode,
  parseIpAustraliaManualFullAcquisitionCliOptions,
} from "./ip-australia-manual-full-acquisition-cli";

function incompleteReport(): IpAustraliaManualFullAcquisitionReport {
  return {
    inventoryPageCount: 1,
    acquiredPageCount: 0,
    failedPageCount: 1,
    sourceUnavailablePageCount: 0,
    incompleteEvidencePageCount: 1,
    standardArticleCount: 0,
    specialEvidencePageCount: 0,
    currentNavigationPageCount: 1,
    updateHistoryOnlyPageCount: 0,
    pagesWithPublishedDateCount: 0,
    pagesWithAmendmentHistoryCount: 0,
    pagesWithControlledNoticeCount: 0,
    totalBodyCharacters: 0,
    inventoryFailures: 0,
    concurrency: 2,
    interBatchDelayMs: 500,
    pages: [
      {
        uri: "https://manuals.ipaustralia.gov.au/trademark/example",
        inventoryLabel: "Example",
        currentNavigation: true,
        updateHistoryPages: [],
        ok: false,
        evidenceProfile: "INCOMPLETE_EVIDENCE",
        title: "",
        datePublished: null,
        bodyText: "",
        amendments: [],
        controlledDocumentNotice: false,
        contentSha256: null,
        error: "Required manual source evidence was incomplete",
      },
    ],
    acceptanceBoundary: "synthetic test boundary",
  };
}

describe("IP Australia Manual full-acquisition CLI", () => {
  it("parses an explicit report output path separately from acquisition controls", () => {
    expect(
      parseIpAustraliaManualFullAcquisitionCliOptions([
        "--concurrency=2",
        "--delay-ms=500",
        "--output=/tmp/ip-australia/report.json",
      ]),
    ).toEqual({
      concurrency: 2,
      interBatchDelayMs: 500,
      outputPath: "/tmp/ip-australia/report.json",
    });
    expect(() => parseIpAustraliaManualFullAcquisitionCliOptions(["--output="])).toThrow(
      /non-empty path/i,
    );
  });

  it("writes a clean JSON evidence file even when the acquisition result must exit 2", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ip-australia-report-"));
    const outputPath = path.join(root, "report.json");
    let stdout = "";
    const report = incompleteReport();

    try {
      await emitIpAustraliaManualFullAcquisitionReport(report, {
        outputPath,
        stdout: (value) => {
          stdout += value;
        },
      });

      const raw = await readFile(outputPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed.event).toBe("ip_australia.trademark.manual.full_acquisition");
      expect(parsed.incompleteEvidencePageCount).toBe(1);
      expect(raw).not.toContain("ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL");
      expect(stdout).toBe("");
      expect(ipAustraliaManualFullAcquisitionExitCode(report)).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
