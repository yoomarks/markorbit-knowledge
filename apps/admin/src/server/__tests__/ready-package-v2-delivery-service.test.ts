import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadyPackageV2DeliverySubmission } from "@markorbit/persistence/ready-package-v2-deliveries";
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

function submission(): ReadyPackageV2DeliverySubmission {
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
    transportAttempts: 1,
    lastTransportAttemptedAt: "2026-08-11T16:31:00.000Z",
    transportResult: {
      protocolVersion: "1.0",
      objectType: "READY_PACKAGE_V2_DELIVERY_RESULT",
      deliveryId: "rvd_01K14TEST000000000000000001",
      readyPackageId: PACKAGE,
      status: "RECEIVED",
      requestSha256: REQUEST_SHA,
      recordedAt: "2026-08-11T16:32:00.000Z",
    },
    createdAt: "2026-08-11T16:30:00.000Z",
    updatedAt: "2026-08-11T16:32:00.000Z",
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

describe("ReadyPackage V2 delivery service", () => {
  it("finalizes from a durable transport result without transport configuration or network", async () => {
    const persisted = submission();
    const transportSubmit = vi.fn();
    const recordResult = vi.fn((_workspaceId, _submissionId, result) => ({
      ...persisted,
      state: "RESULT_RECORDED" as const,
      result: { ...result, recordedAt: "2026-08-11T16:33:00.000Z" },
      updatedAt: "2026-08-11T16:33:00.000Z",
    }));
    const service = new ReadyPackageV2DeliveryService({
      readyPackages: {} as never,
      canonical: {} as never,
      staging: {} as never,
      bindings: {} as never,
      deliveries: deliveryRepository({
        getByReadyPackage: vi.fn(() => persisted),
        recordResult,
      }),
      transport: { submit: transportSubmit },
    });

    const result = await service.submit(WORKSPACE, PACKAGE);

    expect(result.transportUsed).toBe(false);
    expect(result.replayed).toBe(true);
    expect(result.submission.state).toBe("RESULT_RECORDED");
    expect(recordResult).toHaveBeenCalledTimes(1);
    expect(transportSubmit).not.toHaveBeenCalled();
  });

  it("returns an already finalized submission without touching transport or audit", async () => {
    const finalized = {
      ...submission(),
      state: "RESULT_RECORDED" as const,
      result: {
        ...submission().transportResult!,
        recordedAt: "2026-08-11T16:33:00.000Z",
      },
    };
    const transportSubmit = vi.fn();
    const recordTransportUncertainty = vi.fn();
    const service = new ReadyPackageV2DeliveryService({
      readyPackages: {} as never,
      canonical: {} as never,
      staging: {} as never,
      bindings: {} as never,
      deliveries: deliveryRepository({
        getByReadyPackage: vi.fn(() => finalized),
        recordTransportUncertainty,
      }),
      transport: { submit: transportSubmit },
    });

    const result = await service.submit(WORKSPACE, PACKAGE);

    expect(result.submission).toEqual(finalized);
    expect(result.transportUsed).toBe(false);
    expect(transportSubmit).not.toHaveBeenCalled();
    expect(recordTransportUncertainty).not.toHaveBeenCalled();
  });

  it("records bounded unknown-outcome evidence after a started transport attempt throws", async () => {
    configureOutbound();
    const beforeAttempt: ReadyPackageV2DeliverySubmission = {
      ...submission(),
      transportAttempts: 0,
      lastTransportAttemptedAt: undefined,
      transportResult: undefined,
      updatedAt: "2026-08-11T16:30:00.000Z",
    };
    const attempted: ReadyPackageV2DeliverySubmission = {
      ...beforeAttempt,
      transportAttempts: 1,
      lastTransportAttemptedAt: "2026-08-11T16:31:00.000Z",
      updatedAt: "2026-08-11T16:31:00.000Z",
    };
    const recordTransportUncertainty = vi.fn();
    const transportError = new ReadyPackageV2DeliveryTransportError(
      "CORE_V2_DELIVERY_TIMEOUT",
      "sensitive transport message must not be persisted",
      504,
    );
    const service = new ReadyPackageV2DeliveryService({
      readyPackages: {} as never,
      canonical: {} as never,
      staging: {} as never,
      bindings: {} as never,
      deliveries: deliveryRepository({
        getByReadyPackage: vi.fn(() => beforeAttempt),
        markTransportAttempt: vi.fn(() => attempted),
        recordTransportUncertainty,
      }),
      transport: { submit: vi.fn(async () => Promise.reject(transportError)) },
    });

    await expect(service.submit(WORKSPACE, PACKAGE)).rejects.toBe(transportError);
    expect(recordTransportUncertainty).toHaveBeenCalledWith(WORKSPACE, attempted.submissionId, {
      issueCode: "CORE_V2_DELIVERY_TIMEOUT",
      httpStatus: 504,
    });
    expect(JSON.stringify(recordTransportUncertainty.mock.calls)).not.toContain(
      "sensitive transport message",
    );
  });

  it("includes only bounded audit events in the operator overview", () => {
    const persisted = submission();
    const auditEvents = [
      {
        workspaceId: WORKSPACE,
        submissionId: persisted.submissionId,
        readyPackageId: PACKAGE,
        sequence: 1,
        type: "PREPARED" as const,
        requestSha256: REQUEST_SHA,
        recordedAt: "2026-08-11T16:30:00.000Z",
      },
    ];
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
        getByKnowledgeWorkspaceId: vi.fn(() => ({
          coreWorkspaceId: persisted.coreWorkspaceId,
        })),
      } as never,
      deliveries: deliveryRepository({
        list: vi.fn(() => [persisted]),
        listAuditEvents: vi.fn(() => auditEvents),
      }),
      transport: { submit: vi.fn() },
    });

    const overview = service.overview(WORKSPACE);

    expect(overview.items[0]?.auditEvents).toEqual(auditEvents);
    expect(JSON.stringify(overview)).not.toContain(persisted.requestJson);
    expect(JSON.stringify(overview)).not.toContain(persisted.idempotencyKey);
  });
});
