import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  type CaseCandidateV1,
} from "@markorbit/contracts";
import type {
  MarkRegCaseSourceTransport,
  MarkRegCaseSourceTransportRequest,
} from "@markorbit/worker-runtime/markreg-case-evidence-collector";
import {
  CaseLiveAcceptanceService,
  CaseLiveAcceptanceServiceError,
} from "./case-live-acceptance-service";

const workspaceId = "workspace:test";
const matterId = "formal-matter_12345678";
const matterHash = "a".repeat(64);

function candidate(): CaseCandidateV1 {
  return {
    protocolVersion: CASE_CANDIDATE_PROTOCOL_VERSION,
    objectType: CASE_CANDIDATE_OBJECT_TYPE,
    candidateId: "case-candidate_01",
    sourceSystem: CASE_CANDIDATE_SOURCE_SYSTEM,
    sourceMatterId: matterId,
    sourceMatterVersion: 1,
    sourceSnapshotSha256: matterHash,
    sourceRetrievalRef: "markreg:authorized-ref:01",
    promotedBy: "operator:test",
    promotedAt: "2026-08-25T03:20:00.000Z",
    accessScope: { sourceWorkspaceId: workspaceId, classification: "CONFIDENTIAL" },
    idempotencyKey: "case-intake-001",
  };
}

function response(value: unknown, status = 200): { status: number; body: Uint8Array } {
  return { status, body: Buffer.from(JSON.stringify(value), "utf8") };
}

function formalMatter() {
  return {
    formalMatter: {
      formalMatterId: matterId,
      workspaceId,
      version: 1,
      snapshotSha256: matterHash,
      sourceSnapshot: { preparation: { targetJurisdiction: "US" } },
    },
    consequences: {
      orderCreated: false,
      paymentCreated: false,
      professionalAppointed: false,
      filingCreated: false,
    },
  };
}

function lifecycle() {
  return {
    currentView: {
      lifecycleViewId: "lifecycle-view_01",
      workspaceId,
      formalMatter: { id: matterId, version: 1 },
      version: 1,
      officialStatusVerified: false,
    },
    events: [
      {
        lifecycleEventId: "lifecycle-event_01",
        workspaceId,
        formalMatter: { id: matterId, version: 1 },
        version: 1,
        officialStatusVerified: false,
      },
    ],
    recommendedAction: {
      recommendedActionId: "recommended-action_01",
      formalMatter: { id: matterId, version: 1 },
      executionAuthorized: false,
    },
  };
}

function packageList() {
  return {
    documentPackages: [
      {
        documentPackageId: "document-package_01",
        workspaceId,
        formalMatterId: matterId,
        sourceFormalMatterVersion: 1,
        sourceFormalMatterHash: matterHash,
      },
    ],
  };
}

function packageDetail() {
  return {
    documentPackageId: "document-package_01",
    workspaceId,
    formalMatterId: matterId,
    sourceFormalMatterVersion: 1,
    sourceFormalMatterHash: matterHash,
    documentItems: [
      {
        documentItemId: "document-item_01",
        evidenceFingerprint: "c".repeat(64),
        documentReference: {
          checksum: "c".repeat(64),
          storageReference: "markreg-storage://document/01",
        },
      },
    ],
  };
}

const matterPath = `/v1/formal-matters/${matterId}`;
const lifecyclePath = `/v1/operations/formal-matters/${matterId}/lifecycle-provenance`;
const packagePath = "/v1/document-packages/document-package_01";

function successTransport(
  requests: MarkRegCaseSourceTransportRequest[],
): MarkRegCaseSourceTransport {
  const routes: Readonly<Record<string, { status: number; body: Uint8Array }>> = {
    [matterPath]: response(formalMatter()),
    [lifecyclePath]: response(lifecycle()),
    "/v1/document-packages": response(packageList()),
    [packagePath]: response(packageDetail()),
  };
  return async (request) => {
    requests.push(request);
    const path = new URL(request.url).pathname;
    const found = routes[path];
    if (!found) throw new Error(`Unexpected request ${path}`);
    return found;
  };
}

function resolver() {
  return {
    resolve: async () => ({
      baseUrl: "https://markreg.test",
      workspaceId,
      internalAuthorization: "internal-secret-value",
      internalPrincipal: "encoded-workspace-principal",
    }),
  };
}

function prepareInput() {
  return {
    runId: "case-live-run_01",
    candidate: candidate(),
    privacyReviewId: "case-privacy-review_01",
    privacyReviewerRef: "user:privacy-reviewer:01",
    startedAt: "2026-08-25T09:30:00.000Z",
  };
}

function clock(values: readonly string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]!);
}

describe("CaseLiveAcceptanceService", () => {
  it("runs the full TEST path through real service composition without becoming K-CASE-008 eligible", async () => {
    const database = new DatabaseSync(":memory:");
    const requests: MarkRegCaseSourceTransportRequest[] = [];
    const service = new CaseLiveAcceptanceService({
      resolver: resolver(),
      runMode: "TEST",
      producerPromotionRef: "markreg:promotion:test-only",
      database,
      transport: successTransport(requests),
      now: clock([
        "2026-08-25T09:31:00.000Z",
        "2026-08-25T09:32:00.000Z",
        "2026-08-25T09:33:00.000Z",
        "2026-08-25T09:34:00.000Z",
        "2026-08-25T09:35:00.000Z",
      ]),
    });

    const prepared = await service.prepareRun(prepareInput());
    expect(prepared.state).toBe("PRIVACY_REVIEW_REQUIRED");
    expect(prepared.evidence?.collectionId).toMatch(/^case-evidence_/u);
    expect(prepared.assembledDossier?.dossierId).toMatch(/^case-dossier_/u);
    expect(prepared.privacyReview).toEqual({
      reviewId: "case-privacy-review_01",
      state: "REVIEW_REQUIRED",
    });
    expect(prepared.eligibleForKCase008Review).toBe(false);
    expect(prepared.publicationAuthorized).toBe(false);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      matterPath,
      lifecyclePath,
      "/v1/document-packages",
      packagePath,
    ]);

    const finalized = service.finalizeRun("case-live-run_01", {
      derivativeId: "case-redacted_01",
      findings: [],
      decidedAt: "2026-08-25T09:40:00.000Z",
    });
    expect(finalized.state).toBe("FINALIZED");
    expect(finalized.privacyReview?.state).toBe("FINALIZED");
    expect(finalized.finalized?.derivativeId).toBe("case-redacted_01");
    expect(finalized.finalized?.dossierVersion).toBe(2);
    expect(finalized.eligibleForKCase008Review).toBe(false);
    expect(finalized.publicationAuthorized).toBe(false);

    const replay = service.finalizeRun("case-live-run_01", {
      derivativeId: "case-redacted_01",
      findings: [],
      decidedAt: "2026-08-25T09:40:00.000Z",
    });
    expect(replay).toEqual(finalized);
    expect(service.getEvents("case-live-run_01").map((event) => event.receipt.state)).toEqual([
      "STARTED",
      "PRIVACY_REVIEW_REQUIRED",
      "FINALIZED",
    ]);
  });

  it("records a retryable MarkReg outage as WAITING_SOURCE and resumes the same run", async () => {
    const database = new DatabaseSync(":memory:");
    const requests: MarkRegCaseSourceTransportRequest[] = [];
    const good = successTransport(requests);
    let failedOnce = false;
    const transport: MarkRegCaseSourceTransport = async (request) => {
      if (!failedOnce && new URL(request.url).pathname === matterPath) {
        failedOnce = true;
        requests.push(request);
        return response({ error: "temporarily unavailable" }, 503);
      }
      return good(request);
    };
    const service = new CaseLiveAcceptanceService({
      resolver: resolver(),
      runMode: "TEST",
      database,
      transport,
      now: clock([
        "2026-08-25T09:31:00.000Z",
        "2026-08-25T09:32:00.000Z",
        "2026-08-25T09:33:00.000Z",
        "2026-08-25T09:34:00.000Z",
        "2026-08-25T09:35:00.000Z",
      ]),
    });

    const waiting = await service.prepareRun(prepareInput());
    expect(waiting.state).toBe("WAITING_SOURCE");
    expect(waiting.failure).toMatchObject({
      stage: "COLLECTION",
      code: "MARKREG_TEMPORARY_FAILURE",
      retryable: true,
    });
    expect(waiting.evidence).toBeUndefined();

    const resumed = await service.prepareRun(prepareInput());
    expect(resumed.state).toBe("PRIVACY_REVIEW_REQUIRED");
    expect(resumed.evidence).toBeDefined();
    expect(service.getEvents("case-live-run_01").map((event) => event.receipt.state)).toEqual([
      "STARTED",
      "WAITING_SOURCE",
      "PRIVACY_REVIEW_REQUIRED",
    ]);
  });

  it("records an operator privacy rejection without finalized or eligible evidence", async () => {
    const database = new DatabaseSync(":memory:");
    const service = new CaseLiveAcceptanceService({
      resolver: resolver(),
      runMode: "TEST",
      database,
      transport: successTransport([]),
      now: clock([
        "2026-08-25T09:31:00.000Z",
        "2026-08-25T09:32:00.000Z",
        "2026-08-25T09:33:00.000Z",
      ]),
    });
    await service.prepareRun(prepareInput());
    const rejected = service.rejectRun("case-live-run_01", [], "2026-08-25T09:40:00.000Z");
    expect(rejected.state).toBe("FAILED");
    expect(rejected.privacyReview?.state).toBe("REJECTED");
    expect(rejected.failure).toEqual({
      stage: "PRIVACY",
      code: "CASE_LIVE_ACCEPTANCE_PRIVACY_REJECTED",
      retryable: false,
    });
    expect(rejected.finalized).toBeUndefined();
    expect(rejected.eligibleForKCase008Review).toBe(false);
  });

  it("forbids injected test transport in LIVE mode", () => {
    expect(
      () =>
        new CaseLiveAcceptanceService({
          resolver: resolver(),
          runMode: "LIVE",
          database: new DatabaseSync(":memory:"),
          transport: successTransport([]),
        }),
    ).toThrowError(CaseLiveAcceptanceServiceError);
  });

  it("rejects replay when the frozen privacy reviewer changes", async () => {
    const database = new DatabaseSync(":memory:");
    const service = new CaseLiveAcceptanceService({
      resolver: resolver(),
      runMode: "TEST",
      database,
      transport: successTransport([]),
      now: clock([
        "2026-08-25T09:31:00.000Z",
        "2026-08-25T09:32:00.000Z",
        "2026-08-25T09:33:00.000Z",
      ]),
    });
    await service.prepareRun(prepareInput());
    await expect(
      service.prepareRun({
        ...prepareInput(),
        privacyReviewerRef: "user:privacy-reviewer:02",
      }),
    ).rejects.toThrowError(CaseLiveAcceptanceServiceError);
  });
});
