import { describe, expect, it } from "vitest";
import type { ExecutionReceipt, Job } from "@markorbit/worker-runtime";
import { buildIpAustraliaManualAcquisitionRunEvidence } from "./ip-australia-manual-acquisition-learning";

const job = {
  runId: "run_ip_au_577",
  sourceId: "src_ip_au_manual",
  planId: "pln_ip_au_manual",
} as unknown as Job;

const receipt = {
  executor: {
    executorId: "ip-australia-manual-http",
    version: "1.0.0",
    mode: "PRODUCTION",
  },
  outputKinds: ["HTML"],
  itemsObserved: 577,
  bytesPrepared: 12_000_000,
  metadataOnly: false,
  summary: "577 Manual pages",
} as ExecutionReceipt;

describe("IP Australia Manual acquisition learning evidence", () => {
  it("describes a complete 577-page production corpus without claiming legal truth", () => {
    const evidence = buildIpAustraliaManualAcquisitionRunEvidence({
      job,
      receipt,
      diagnostics: {
        inventoryPageCount: 577,
        emittedArtifactCount: 577,
        sourceGaps: [],
        etagObserved: true,
        lastModifiedObserved: false,
      },
      startedAt: "2026-08-22T00:00:00.000Z",
      finishedAt: "2026-08-22T00:05:00.000Z",
    });

    expect(evidence).toMatchObject({
      runId: "run_ip_au_577",
      sourceId: "src_ip_au_manual",
      playbookId: "official-static-index-tree",
      playbookRevision: 1,
      outcome: "SUCCESS",
      counts: {
        discovered: 577,
        attempted: 577,
        fetched: 577,
        accepted: 577,
        duplicates: 0,
        retries: 0,
      },
      coverage: {
        knownCorpus: 577,
        ratio: 1,
        previousRatio: null,
      },
      httpStatusCounts: { "200": 577 },
      surfaceOutcomes: [
        {
          surface: "INDEX_PAGE",
          discovered: 577,
          accepted: 577,
          knownCorpus: 577,
        },
      ],
      changeDetection: {
        etagObserved: true,
        lastModifiedObserved: false,
        validator304Count: 0,
        digestChanges: 0,
      },
      performance: {
        durationMs: 300_000,
        bytes: 12_000_000,
      },
      boundaries: {
        legalTruthVerified: false,
        autoPromotionApplied: false,
        collectionAuthorityGranted: false,
      },
    });
  });

  it("records source gaps as degraded evidence instead of fabricating complete coverage", () => {
    const evidence = buildIpAustraliaManualAcquisitionRunEvidence({
      job,
      receipt: { ...receipt, itemsObserved: 576 },
      diagnostics: {
        inventoryPageCount: 577,
        emittedArtifactCount: 576,
        sourceGaps: [
          {
            uri: "https://manuals.ipaustralia.gov.au/trade-marks/blocked-page",
            label: "Blocked page",
            status: 503,
            reason: "FETCH_FAILED",
            error: "upstream returned HTTP 503",
          },
        ],
        etagObserved: false,
        lastModifiedObserved: true,
      },
      startedAt: "2026-08-22T00:00:00.000Z",
      finishedAt: "2026-08-22T00:05:00.000Z",
    });

    expect(evidence.outcome).toBe("DEGRADED");
    expect(evidence.coverage.ratio).toBeCloseTo(576 / 577);
    expect(evidence.httpStatusCounts).toEqual({ "200": 576, "503": 1 });
    expect(evidence.changeDetection).toMatchObject({
      etagObserved: false,
      lastModifiedObserved: true,
    });
    expect(evidence.failureSignatures).toEqual([
      {
        code: "FETCH_FAILED",
        count: 1,
        sample: "upstream returned HTTP 503",
      },
    ]);
  });
});
