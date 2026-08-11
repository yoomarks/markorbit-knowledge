import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ReadyPackageV2DeliveryAuditEvent,
  ReadyPackageV2DeliverySubmission,
} from "@markorbit/persistence/ready-package-v2-deliveries";
import { ReadyPackageV2DeliveryTransportError } from "../ready-package-v2-delivery-http-transport";
import { ReadyPackageV2DeliveryService } from "../ready-package-v2-delivery-service";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PACKAGE = "rdp_01K14TEST000000000000000001";
const REQUEST_SHA = "a".repeat(64);

const ORIGINAL_ENV = {
  url: process.env.MARKORBIT_CORE_V2_DELIVERY_URL,
  secret: process.env.MARKORBIT_CORE_INTERNAL_SECRET,
  protocol: process.env.MARKORBIT_CORE_V2_PROTOCOL_VERSION,
  legacy: process.env.MARKORBIT_CORE_INTAKE_URL,
};

afterEach(() => {
  if (ORIGINAL_ENV.url === undefined) delete process.env.MARKORBIT_CORE_V2_DELIVERY_URL;
  else process.env.MARKORBIT_CORE_V2_DELIVERY_URL = ORIGINAL_ENV.url;
  if (ORIGINAL_ENV.secret === undefined) delete process.env.MARKORBIT_CORE_INTERNAL_SECRET;
  else process.env.MARKORBIT_CORE_INTERNAL_SECRET = ORIGINAL_ENV.secret;
  if (ORIGINAL_ENV.protocol === undefined) delete process.env.MARKORBIT_CORE_V2_PROTOCOL_VERSION;
  else process.env.MARKORBIT_CORE_V2_PROTOCOL_VERSION = ORIGINAL_ENV.protocol;
  if (ORIGINAL_ENV.legacy === undefined) delete process.env.MARKORBIT_CORE_INTAKE_URL;
  else process.env.MARKORBIT_CORE_INTAKE_URL = ORIGINAL_ENV.legacy;
});

function configureOutbound() {
  process.env.MARKORBIT_CORE_V2_DELIVERY_URL = "https://core.example.test/internal/v2/deliveries";
  process.env.MARKORBIT_CORE_INTERNAL_SECRET = "test-secret";
  process.env.MARKORBIT_CORE_V2_PROTOCOL_VERSION = "1.0";
  process.env.MARKORBIT_CORE_INTAKE_URL = "https://core.example.test/internal/v1/intakes";
}

function submission(
  overrides: Partial<ReadyPackageV2DeliverySubmission> = {},
): ReadyPackageV2DeliverySubmission {
  return {
    submissionId: "rvd_01K14TEST000000000000000001",
    workspaceId: WORKSPACE,
    readyPackageId: PACKAGE,
    readyPackageDigest: "b".repeat(64),
    coreWorkspaceId: "123e4567-e89b-12d3-a456-426614174000",
    idempotencyKey: "ready-package-v2-delivery:rvd_01K14TEST000000000000000001",
    requestJson: '{"frozen":true}',
    requestSha256: REQUEST_SHA,
    contentExportSha256: "c".repeat(64),
    state: "PENDING",
    transportAttempts: 0,
    createdAt: "2026-08-11T16:30:00.000Z",
    updatedAt: "2026-08-11T16:30:00.000Z",
    ...overrides,
  };
}

function auditEvent(
  sequence: number,
  type: ReadyPackageV2DeliveryAuditEvent["type"],
  overrides: Partial<ReadyPackageV2DeliveryAuditEvent> = {},
): ReadyPackageV2DeliveryAuditEvent {
  return {
    workspaceId: WORKSPACE,
    submissionId: "rvd_01K14TEST000000000000000001",
    readyPackageId: PACKAGE,
    sequence,
    type,
    requestSha256: REQUEST_SHA,
    recordedAt: new Date(
      Date.parse("2026-08-11T16:30:00.000Z") + (sequence - 1) * 60_000,
    ).toISOString(),
    ...overrides,
  };
}

function preparedAudit(): ReadyPackageV2DeliveryAuditEvent {
  return auditEvent(1, "PREPARED");
}

function resultEvidence(
  recordedAt: string,
  status: "RECEIVED" | "ACCEPTED" | "REJECTED" = "RECEIVED",
) {
  return {
    protocolVersion: "1.0" as const,
    objectType: "READY_PACKAGE_V2_DELIVERY_RESULT" as const,
    deliveryId: "rvd_01K14TEST000000000000000001",
    readyPackageId: PACKAGE,
    status,
    requestSha256: REQUEST_SHA,
    recordedAt,
  };
}

function deliveryRepository(overrides: Record<string, unknown> = {}) {
  return {
    getByReadyPackage: vi.fn(),
    prepare: vi.fn(),
    markTransportAttempt: vi.fn(),
    recordTransportUncertainty: vi.fn(),
    recordTransportResult: vi.fn(),
    recordResult: vi.fn(),
    list: vi.fn(() => []),
    listAuditEvents: vi.fn(() => []),
    ...overrides,
  } as never;
}

function serviceWithDeliveries(
  deliveries: ReturnType<typeof deliveryRepository>,
  transportSubmit = vi.fn(),
) {
  return new ReadyPackageV2DeliveryService({
    readyPackages: {} as never,
    canonical: {} as never,
    staging: {} as never,
    bindings: {} as never,
    deliveries,
    transport: { submit: transportSubmit },
  });
}

describe("ReadyPackage V2 delivery service", () => {
  it("finalizes from reconciled durable transport evidence without transport configuration or network", async () => {
    const started = auditEvent(2, "TRANSPORT_ATTEMPT_STARTED", { attemptNumber: 1 });
    const recorded = auditEvent(3, "TRANSPORT_RESULT_RECORDED", {
      attemptNumber: 1,
      resultStatus: "RECEIVED",
    });
    const persisted = submission({
      transportAttempts: 1,
      lastTransportAttemptedAt: started.recordedAt,
      transportResult: resultEvidence(recorded.recordedAt),
      updatedAt: recorded.recordedAt,
    });
    const transportSubmit = vi.fn();
    const recordResult = vi.fn((_workspaceId, _submissionId, result) => ({
      ...persisted,
      state: "RESULT_RECORDED" as const,
      result: { ...result, recordedAt: "2026-08-11T16:33:00.000Z" },
      updatedAt: "2026-08-11T16:33:00.000Z",
    }));
    const service = serviceWithDeliveries(
      deliveryRepository({
        getByReadyPackage: vi.fn(() => persisted),
        listAuditEvents: vi.fn(() => [preparedAudit(), started, recorded]),
        recordResult,
      }),
      transportSubmit,
    );

    const result = await service.submit(WORKSPACE, PACKAGE);

    expect(result.transportUsed).toBe(false);
    expect(result.replayed).toBe(true);
    expect(result.submission.state).toBe("RESULT_RECORDED");
    expect(recordResult).toHaveBeenCalledTimes(1);
    expect(transportSubmit).not.toHaveBeenCalled();
  });

  it("returns a reconciled finalized submission without touching transport", async () => {
    const started = auditEvent(2, "TRANSPORT_ATTEMPT_STARTED", { attemptNumber: 1 });
    const recorded = auditEvent(3, "TRANSPORT_RESULT_RECORDED", {
      attemptNumber: 1,
      resultStatus: "RECEIVED",
    });
    const finalizedEvent = auditEvent(4, "FINALIZED", {
      attemptNumber: 1,
      resultStatus: "RECEIVED",
    });
    const finalized = submission({
      state: "RESULT_RECORDED",
      transportAttempts: 1,
      lastTransportAttemptedAt: started.recordedAt,
      transportResult: resultEvidence(recorded.recordedAt),
      result: resultEvidence(finalizedEvent.recordedAt),
      updatedAt: finalizedEvent.recordedAt,
    });
    const transportSubmit = vi.fn();
    const service = serviceWithDeliveries(
      deliveryRepository({
        getByReadyPackage: vi.fn(() => finalized),
        listAuditEvents: vi.fn(() => [preparedAudit(), started, recorded, finalizedEvent]),
      }),
      transportSubmit,
    );

    const result = await service.submit(WORKSPACE, PACKAGE);

    expect(result.submission).toEqual(finalized);
    expect(result.transportUsed).toBe(false);
    expect(transportSubmit).not.toHaveBeenCalled();
  });

  it("records bounded unknown-outcome evidence after a reconciled safe submission throws", async () => {
    configureOutbound();
    const beforeAttempt = submission();
    const started = auditEvent(2, "TRANSPORT_ATTEMPT_STARTED", { attemptNumber: 1 });
    const attempted = submission({
      transportAttempts: 1,
      lastTransportAttemptedAt: started.recordedAt,
      updatedAt: started.recordedAt,
    });
    const recordTransportUncertainty = vi.fn();
    const transportError = new ReadyPackageV2DeliveryTransportError(
      "CORE_V2_DELIVERY_TIMEOUT",
      "sensitive transport message must not be persisted",
      504,
    );
    const service = serviceWithDeliveries(
      deliveryRepository({
        getByReadyPackage: vi.fn(() => beforeAttempt),
        listAuditEvents: vi.fn(() => [preparedAudit()]),
        markTransportAttempt: vi.fn(() => attempted),
        recordTransportUncertainty,
      }),
      vi.fn(async () => Promise.reject(transportError)),
    );

    await expect(service.submit(WORKSPACE, PACKAGE)).rejects.toBe(transportError);
    expect(recordTransportUncertainty).toHaveBeenCalledWith(WORKSPACE, attempted.submissionId, {
      issueCode: "CORE_V2_DELIVERY_TIMEOUT",
      httpStatus: 504,
    });
    expect(JSON.stringify(recordTransportUncertainty.mock.calls)).not.toContain(
      "sensitive transport message",
    );
  });

  it("retries the exact frozen request after outcome-unknown evidence", async () => {
    configureOutbound();
    const firstStarted = auditEvent(2, "TRANSPORT_ATTEMPT_STARTED", { attemptNumber: 1 });
    const unknown = auditEvent(3, "TRANSPORT_OUTCOME_UNKNOWN", {
      attemptNumber: 1,
      issueCode: "CORE_V2_DELIVERY_TIMEOUT",
      httpStatus: 504,
    });
    const persisted = submission({
      transportAttempts: 1,
      lastTransportAttemptedAt: firstStarted.recordedAt,
      updatedAt: firstStarted.recordedAt,
    });
    const attemptedAgain = submission({
      transportAttempts: 2,
      lastTransportAttemptedAt: "2026-08-11T16:33:00.000Z",
      updatedAt: "2026-08-11T16:33:00.000Z",
    });
    const consumerResult = {
      protocolVersion: "1.0" as const,
      objectType: "READY_PACKAGE_V2_DELIVERY_RESULT" as const,
      deliveryId: persisted.submissionId,
      readyPackageId: PACKAGE,
      status: "ACCEPTED" as const,
      requestSha256: REQUEST_SHA,
    };
    const transportSubmit = vi.fn(async () => consumerResult);
    const recordTransportResult = vi.fn(() => ({
      ...attemptedAgain,
      transportResult: { ...consumerResult, recordedAt: "2026-08-11T16:34:00.000Z" },
    }));
    const recordResult = vi.fn(() => ({
      ...attemptedAgain,
      state: "RESULT_RECORDED" as const,
      transportResult: { ...consumerResult, recordedAt: "2026-08-11T16:34:00.000Z" },
      result: { ...consumerResult, recordedAt: "2026-08-11T16:35:00.000Z" },
    }));
    const service = serviceWithDeliveries(
      deliveryRepository({
        getByReadyPackage: vi.fn(() => persisted),
        listAuditEvents: vi.fn(() => [preparedAudit(), firstStarted, unknown]),
        markTransportAttempt: vi.fn(() => attemptedAgain),
        recordTransportResult,
        recordResult,
      }),
      transportSubmit,
    );

    const result = await service.submit(WORKSPACE, PACKAGE);

    expect(result.transportUsed).toBe(true);
    expect(transportSubmit).toHaveBeenCalledWith(persisted.requestJson, persisted.idempotencyKey);
    expect(attemptedAgain.requestJson).toBe(persisted.requestJson);
    expect(attemptedAgain.idempotencyKey).toBe(persisted.idempotencyKey);
  });

  it("fails closed and never sends when mutable state is not backed by audit evidence", async () => {
    configureOutbound();
    const inconsistent = submission({
      transportAttempts: 1,
      lastTransportAttemptedAt: "2026-08-11T16:31:00.000Z",
    });
    const transportSubmit = vi.fn();
    const service = serviceWithDeliveries(
      deliveryRepository({
        getByReadyPackage: vi.fn(() => inconsistent),
        listAuditEvents: vi.fn(() => [preparedAudit()]),
      }),
      transportSubmit,
    );

    await expect(service.submit(WORKSPACE, PACKAGE)).rejects.toThrowError(
      /evidence is inconsistent/u,
    );
    expect(transportSubmit).not.toHaveBeenCalled();
  });

  it("serializes diagnosis and bounded audit evidence without frozen request secrets", () => {
    const started = auditEvent(2, "TRANSPORT_ATTEMPT_STARTED", { attemptNumber: 1 });
    const recorded = auditEvent(3, "TRANSPORT_RESULT_RECORDED", {
      attemptNumber: 1,
      resultStatus: "RECEIVED",
    });
    const persisted = submission({
      transportAttempts: 1,
      lastTransportAttemptedAt: started.recordedAt,
      transportResult: resultEvidence(recorded.recordedAt),
      updatedAt: recorded.recordedAt,
    });
    const service = new ReadyPackageV2DeliveryService({
      readyPackages: {
        list: vi.fn(() => [
          {
            id: PACKAGE,
            workspaceId: WORKSPACE,
            evidence: { digest: persisted.readyPackageDigest },
          },
        ]),
      } as never,
      canonical: {} as never,
      staging: {} as never,
      bindings: {
        getByKnowledgeWorkspaceId: vi.fn(() => ({ coreWorkspaceId: persisted.coreWorkspaceId })),
      } as never,
      deliveries: deliveryRepository({
        list: vi.fn(() => [persisted]),
        listAuditEvents: vi.fn(() => [preparedAudit(), started, recorded]),
      }),
      transport: { submit: vi.fn() },
    });

    const overview = service.overview(WORKSPACE);
    const serialized = JSON.stringify(overview);

    expect(overview.items[0]?.stage).toBe("LOCAL_FINALIZATION_REQUIRED");
    expect(overview.items[0]?.diagnosis?.recommendedAction).toBe("FINALIZE_LOCALLY_NO_NETWORK");
    expect(overview.items[0]?.auditEvents).toHaveLength(3);
    expect(serialized).not.toContain(persisted.requestJson);
    expect(serialized).not.toContain(persisted.idempotencyKey);
  });
});
