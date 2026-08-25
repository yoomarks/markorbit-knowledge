import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_INTAKE_OBJECT_TYPE,
  CASE_CANDIDATE_INTAKE_PROTOCOL_VERSION,
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  type CaseCandidateIntakeV1,
  type CaseCandidateV1,
  type CaseEvidenceCollectionV1,
} from "@markorbit/contracts";
import {
  CaseEvidenceCollectionError,
  MarkRegCaseEvidenceCollector,
  type CaseCandidateCollectionStateSink,
  type CaseEvidenceCollectionSink,
  type MarkRegCaseSourceTransport,
  type MarkRegCaseSourceTransportRequest,
} from "./markreg-case-evidence-collector";

const workspaceId = "workspace:test";
const matterId = "formal-matter_12345678";
const matterHash = "a".repeat(64);

function candidate(overrides: Partial<CaseCandidateV1> = {}): CaseCandidateV1 {
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
    ...overrides,
  };
}

function intake(
  candidateId: string,
  state: "PENDING" | "WAITING_SOURCE" | "COLLECTED",
  extras: Partial<CaseCandidateIntakeV1> = {},
): CaseCandidateIntakeV1 {
  return {
    protocolVersion: CASE_CANDIDATE_INTAKE_PROTOCOL_VERSION,
    objectType: CASE_CANDIDATE_INTAKE_OBJECT_TYPE,
    candidateId,
    sourceIdentitySha256: "f".repeat(64),
    collectionState: state,
    acceptedAt: "2026-08-25T03:21:00.000Z",
    updatedAt: "2026-08-25T04:00:00.000Z",
    ...extras,
  };
}

function response(value: unknown, status = 200): { status: number; body: Uint8Array } {
  return { status, body: Buffer.from(JSON.stringify(value), "utf8") };
}

function formalMatter(hash = matterHash) {
  return {
    formalMatter: {
      formalMatterId: matterId,
      workspaceId,
      version: 1,
      snapshotSha256: hash,
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
      {
        documentPackageId: "document-package_other",
        workspaceId,
        formalMatterId: "formal-matter_other",
        sourceFormalMatterVersion: 1,
        sourceFormalMatterHash: "b".repeat(64),
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

class RecordingEvidenceSink implements CaseEvidenceCollectionSink {
  readonly saved: CaseEvidenceCollectionV1[] = [];
  private readonly byId = new Map<string, CaseEvidenceCollectionV1>();

  saveCollection(value: CaseEvidenceCollectionV1) {
    const prior = this.byId.get(value.collectionId);
    if (prior) return { collection: prior, replayed: true };
    this.byId.set(value.collectionId, value);
    this.saved.push(value);
    return { collection: value, replayed: false };
  }
}

class RecordingStateSink implements CaseCandidateCollectionStateSink {
  readonly unavailable: {
    candidateId: string;
    code: string;
    message: string;
    observedAt?: string;
  }[] = [];
  readonly completed: { candidateId: string; collectionRef: string; collectedAt?: string }[] = [];

  recordSourceUnavailable(
    candidateId: string,
    input: { code: string; message: string; observedAt?: string },
  ): CaseCandidateIntakeV1 {
    this.unavailable.push({ candidateId, ...input });
    return intake(candidateId, "WAITING_SOURCE", {
      sourceUnavailable: {
        code: input.code,
        message: input.message,
        observedAt: input.observedAt ?? "2026-08-25T04:00:00.000Z",
        retryable: true,
      },
    });
  }

  recordCollectionComplete(
    candidateId: string,
    collectionRef: string,
    collectedAt?: string,
  ): CaseCandidateIntakeV1 {
    this.completed.push({ candidateId, collectionRef, ...(collectedAt ? { collectedAt } : {}) });
    return intake(candidateId, "COLLECTED", {
      collectionRef,
      collectedAt: collectedAt ?? "2026-08-25T04:00:00.000Z",
    });
  }
}

function transportFrom(
  routes: Readonly<Record<string, { status: number; body: Uint8Array }>>,
  requests: MarkRegCaseSourceTransportRequest[],
): MarkRegCaseSourceTransport {
  return async (request) => {
    requests.push(request);
    const path = new URL(request.url).pathname;
    const found = routes[path];
    if (!found) throw new Error(`Unexpected request ${path}`);
    return found;
  };
}

function collectorFixture(
  routes: Readonly<Record<string, { status: number; body: Uint8Array }>>,
  options: {
    resolvedWorkspaceId?: string;
    now?: () => Date;
    transport?: MarkRegCaseSourceTransport;
  } = {},
) {
  const requests: MarkRegCaseSourceTransportRequest[] = [];
  const evidence = new RecordingEvidenceSink();
  const state = new RecordingStateSink();
  const collector = new MarkRegCaseEvidenceCollector({
    resolver: {
      resolve: async () => ({
        baseUrl: "https://markreg.test",
        workspaceId: options.resolvedWorkspaceId ?? workspaceId,
        internalAuthorization: "internal-secret-value",
        internalPrincipal: "encoded-workspace-principal",
      }),
    },
    evidenceSink: evidence,
    stateSink: state,
    transport: options.transport ?? transportFrom(routes, requests),
    now: options.now ?? (() => new Date("2026-08-25T04:00:00.000Z")),
  });
  return { collector, requests, evidence, state };
}

const matterPath = `/v1/formal-matters/${matterId}`;
const lifecyclePath = `/v1/operations/formal-matters/${matterId}/lifecycle-provenance`;
const packagePath = "/v1/document-packages/document-package_01";

describe("MarkRegCaseEvidenceCollector", () => {
  it("collects exact Formal Matter, lifecycle and matching Document Package evidence", async () => {
    const fixture = collectorFixture({
      [matterPath]: response(formalMatter()),
      [lifecyclePath]: response(lifecycle()),
      "/v1/document-packages": response(packageList()),
      [packagePath]: response(packageDetail()),
    });

    const result = await fixture.collector.collect(candidate());
    expect(result.documentPackages).toHaveLength(1);
    expect(result.documentPackages[0]?.documentPackageId).toBe("document-package_01");
    expect(result.documentPackages[0]?.payload.dataBase64).toBe(
      Buffer.from(JSON.stringify(packageDetail()), "utf8").toString("base64"),
    );
    expect(result.lifecycleProvenance).toBeDefined();
    expect(result.provenance).toEqual({
      sourceFamily: "CASE",
      originalSystem: "MARKREG",
      originalSystemAuthoritative: true,
      knowledgeSnapshotIsSystemOfRecord: false,
    });
    expect(fixture.evidence.saved).toEqual([result]);
    expect(fixture.state.completed[0]?.collectionRef).toBe(result.collectionId);
    expect(fixture.state.unavailable).toHaveLength(0);

    expect(fixture.requests.map((request) => new URL(request.url).pathname)).toEqual([
      matterPath,
      lifecyclePath,
      "/v1/document-packages",
      packagePath,
    ]);
    expect(fixture.requests.some((request) => request.url.includes("document-package_other"))).toBe(
      false,
    );
    for (const request of fixture.requests) {
      expect(request.headers).toMatchObject({
        "x-markorbit-internal-authorization": "internal-secret-value",
        "x-markorbit-principal": "encoded-workspace-principal",
        "x-markorbit-workspace-id": workspaceId,
      });
    }
  });

  it("fails closed on Formal Matter identity mismatch without marking a source outage", async () => {
    const fixture = collectorFixture({
      [matterPath]: response(formalMatter("b".repeat(64))),
    });

    await expect(fixture.collector.collect(candidate())).rejects.toMatchObject({
      code: "MARKREG_SOURCE_IDENTITY_MISMATCH",
      retryable: false,
    });
    expect(fixture.evidence.saved).toHaveLength(0);
    expect(fixture.state.unavailable).toHaveLength(0);
    expect(fixture.state.completed).toHaveLength(0);
  });

  it("marks retryable MarkReg failures as WAITING_SOURCE and preserves evidence immutability", async () => {
    const fixture = collectorFixture({ [matterPath]: response({ error: "down" }, 503) });

    await expect(fixture.collector.collect(candidate())).rejects.toMatchObject({
      code: "MARKREG_TEMPORARY_FAILURE",
      retryable: true,
      status: 503,
    });
    expect(fixture.state.unavailable).toHaveLength(1);
    expect(fixture.state.unavailable[0]).toMatchObject({
      candidateId: "case-candidate_01",
      code: "MARKREG_TEMPORARY_FAILURE",
    });
    expect(fixture.evidence.saved).toHaveLength(0);
  });

  it("records optional authorization/availability omissions without fabricating evidence", async () => {
    const fixture = collectorFixture({
      [matterPath]: response(formalMatter()),
      [lifecyclePath]: response({ error: "forbidden" }, 403),
      "/v1/document-packages": response({ error: "missing" }, 404),
    });

    const result = await fixture.collector.collect(candidate());
    expect(result.lifecycleProvenance).toBeUndefined();
    expect(result.documentPackages).toEqual([]);
    expect(result.omissions).toEqual([
      { surface: "LIFECYCLE_PROVENANCE", reason: "NOT_AUTHORIZED" },
      { surface: "DOCUMENT_PACKAGES", reason: "NOT_AVAILABLE" },
    ]);
    expect(fixture.state.completed).toHaveLength(1);
  });

  it("ignores Document Packages from a different Formal Matter snapshot", async () => {
    const fixture = collectorFixture({
      [matterPath]: response(formalMatter()),
      [lifecyclePath]: response(lifecycle()),
      "/v1/document-packages": response({
        documentPackages: [
          {
            documentPackageId: "document-package_wrong",
            workspaceId,
            formalMatterId: matterId,
            sourceFormalMatterVersion: 1,
            sourceFormalMatterHash: "b".repeat(64),
          },
        ],
      }),
    });

    const result = await fixture.collector.collect(candidate());
    expect(result.documentPackages).toEqual([]);
    expect(fixture.requests.some((request) => request.url.includes("document-package_wrong"))).toBe(
      false,
    );
  });

  it("fails before transport when the trusted resolver returns the wrong Workspace", async () => {
    const fixture = collectorFixture({}, { resolvedWorkspaceId: "workspace:other" });
    await expect(fixture.collector.collect(candidate())).rejects.toMatchObject({
      code: "MARKREG_WORKSPACE_MISMATCH",
      retryable: false,
    });
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.state.unavailable).toHaveLength(0);
  });

  it("keeps the collection ID deterministic when exact source evidence is unchanged", async () => {
    const routes = {
      [matterPath]: response(formalMatter()),
      [lifecyclePath]: response(lifecycle()),
      "/v1/document-packages": response(packageList()),
      [packagePath]: response(packageDetail()),
    };
    let invocation = 0;
    const fixture = collectorFixture(routes, {
      now: () => {
        invocation += 1;
        return new Date(invocation < 2 ? "2026-08-25T04:00:00.000Z" : "2026-08-25T04:05:00.000Z");
      },
    });

    const first = await fixture.collector.collect(candidate());
    const second = await fixture.collector.collect(candidate());
    expect(second.collectionId).toBe(first.collectionId);
    expect(second).toEqual(first);
    expect(fixture.evidence.saved).toHaveLength(1);
    expect(fixture.state.completed).toHaveLength(2);
  });

  it("maps transport network errors to retryable source unavailability", async () => {
    const requests: MarkRegCaseSourceTransportRequest[] = [];
    const fixture = collectorFixture(
      {},
      {
        transport: async (request) => {
          requests.push(request);
          throw new CaseEvidenceCollectionError(
            "MARKREG_NETWORK_ERROR",
            "MarkReg request failed",
            true,
          );
        },
      },
    );

    await expect(fixture.collector.collect(candidate())).rejects.toMatchObject({
      code: "MARKREG_NETWORK_ERROR",
      retryable: true,
    });
    expect(requests).toHaveLength(1);
    expect(fixture.state.unavailable).toHaveLength(1);
  });
});
