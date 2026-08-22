import { describe, expect, it, vi } from "vitest";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionRunEvidence,
  type SourceFingerprint,
} from "@markorbit/contracts";
import { HttpAcquisitionIntelligenceClient } from "../src/http-acquisition-intelligence-client";

const evidence: AcquisitionRunEvidence = {
  protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  objectType: "ACQUISITION_RUN_EVIDENCE",
  runId: "run_test",
  sourceId: "src_test",
  playbookId: "official-static-index-tree",
  playbookRevision: 1,
  startedAt: "2026-08-22T00:00:00.000Z",
  finishedAt: "2026-08-22T00:01:00.000Z",
  outcome: "SUCCESS",
  counts: { discovered: 1, attempted: 1, fetched: 1, accepted: 1, duplicates: 0, retries: 0 },
  coverage: { knownCorpus: 1, ratio: 1, previousRatio: null },
  httpStatusCounts: { "200": 1 },
  failureSignatures: [],
  surfaceOutcomes: [{ surface: "INDEX_PAGE", discovered: 1, accepted: 1, knownCorpus: 1 }],
  rendering: { used: false },
  changeDetection: {
    etagObserved: false,
    lastModifiedObserved: false,
    validator304Count: 0,
    digestChanges: 0,
  },
  performance: { durationMs: 60_000, bytes: 100 },
  evidenceRefs: ["run:test"],
  boundaries: {
    legalTruthVerified: false,
    autoPromotionApplied: false,
    collectionAuthorityGranted: false,
  },
};

const fingerprint: SourceFingerprint = {
  protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  objectType: "SOURCE_FINGERPRINT",
  sourceId: "src_test",
  observedAt: "2026-08-22T00:01:00.000Z",
  architecture: "STATIC_HTML",
  discoverySurfaces: ["INDEX_PAGE"],
  renderRequirement: "NONE",
  localeStructure: "SINGLE",
  supportsHttpValidators: true,
  attachmentKinds: ["HTML"],
  confidence: 0.9,
  evidenceRefs: ["profile:static-index-html-v1"],
};

describe("HttpAcquisitionIntelligenceClient", () => {
  it("submits authenticated run evidence plus fingerprint and validates the intake receipt", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        authorization: "Bearer credential-1",
        "content-type": "application/json",
      });
      expect(JSON.parse(String(init?.body))).toEqual({ workerId: "worker-1", evidence, fingerprint });
      return new Response(
        JSON.stringify({
          version: "ACQUISITION_INTELLIGENCE_WORKER_INTAKE_V1",
          workerId: "worker-1",
          runId: "run_test",
          sourceId: "src_test",
          executionAttemptId: "exa_test",
          replayed: false,
          lessonsRecorded: 2,
          playbookHistory: {
            runs: 1,
            successRate: 1,
            averageCoverage: 1,
            averageDurationMs: 60_000,
          },
          strategyCandidateId: null,
          strategyCandidateStage: null,
          strategyCandidateEvidenceCount: 0,
          reevaluationRequestId: null,
          fingerprintRecorded: true,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const client = new HttpAcquisitionIntelligenceClient(
      "https://knowledge.example.test/",
      "worker-1",
      "credential-1",
      fetcher as typeof fetch,
    );

    await expect(client.recordRun(evidence, fingerprint)).resolves.toMatchObject({
      runId: "run_test",
      executionAttemptId: "exa_test",
      lessonsRecorded: 2,
      fingerprintRecorded: true,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://knowledge.example.test/api/worker/v1/acquisition-intelligence/runs",
      expect.any(Object),
    );
  });

  it("rejects a fingerprint for a different source before transport", async () => {
    const fetcher = vi.fn();
    const client = new HttpAcquisitionIntelligenceClient(
      "https://knowledge.example.test",
      "worker-1",
      "credential-1",
      fetcher as typeof fetch,
    );

    await expect(
      client.recordRun(evidence, { ...fingerprint, sourceId: "src_wrong" }),
    ).rejects.toThrow("must match evidence sourceId");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces the control-plane error message on rejected evidence", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "run/source mismatch" } }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new HttpAcquisitionIntelligenceClient(
      "https://knowledge.example.test",
      "worker-1",
      "credential-1",
      fetcher as typeof fetch,
    );

    await expect(client.recordRun(evidence)).rejects.toMatchObject({
      status: 409,
      message: "run/source mismatch",
    });
  });
});
