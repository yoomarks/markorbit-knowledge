import { describe, expect, it, vi } from "vitest";
import type {
  ReadyPackageV2DeliveryAuditEvent,
  ReadyPackageV2DeliverySubmission,
} from "@markorbit/persistence/ready-package-v2-deliveries";
import { ReadyPackageV2DeliveryService } from "../ready-package-v2-delivery-service";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PACKAGE = "rdp_01K14TEST000000000000000001";
const DELIVERY = "rvd_01K14TEST000000000000000001";
const REQUEST_SHA = "a".repeat(64);
const RECORDED_AT = "2026-08-23T12:05:00.000Z";

function auditEvent(
  sequence: number,
  type: ReadyPackageV2DeliveryAuditEvent["type"],
  overrides: Partial<ReadyPackageV2DeliveryAuditEvent> = {},
): ReadyPackageV2DeliveryAuditEvent {
  return {
    workspaceId: WORKSPACE,
    submissionId: DELIVERY,
    readyPackageId: PACKAGE,
    sequence,
    type,
    requestSha256: REQUEST_SHA,
    recordedAt: new Date(Date.parse("2026-08-23T12:00:00.000Z") + sequence * 60_000).toISOString(),
    ...overrides,
  };
}

describe("ReadyPackage V2 restart local finalization", () => {
  it("strips durable recordedAt metadata before passing the Core protocol result to recordResult", async () => {
    const transportResult = {
      protocolVersion: "1.0" as const,
      objectType: "READY_PACKAGE_V2_DELIVERY_RESULT" as const,
      deliveryId: DELIVERY,
      readyPackageId: PACKAGE,
      status: "ACCEPTED" as const,
      requestSha256: REQUEST_SHA,
      recordedAt: RECORDED_AT,
    };
    const persisted: ReadyPackageV2DeliverySubmission = {
      submissionId: DELIVERY,
      workspaceId: WORKSPACE,
      readyPackageId: PACKAGE,
      readyPackageDigest: "b".repeat(64),
      coreWorkspaceId: "123e4567-e89b-12d3-a456-426614174000",
      idempotencyKey: `ready-package-v2-delivery:${DELIVERY}`,
      requestJson: '{"frozen":true}',
      requestSha256: REQUEST_SHA,
      contentExportSha256: "c".repeat(64),
      state: "PENDING",
      transportAttempts: 1,
      lastTransportAttemptedAt: "2026-08-23T12:02:00.000Z",
      transportResult,
      createdAt: "2026-08-23T12:00:00.000Z",
      updatedAt: RECORDED_AT,
    };
    const auditEvents = [
      auditEvent(0, "PREPARED", { recordedAt: "2026-08-23T12:00:00.000Z" }),
      auditEvent(1, "TRANSPORT_ATTEMPT_STARTED", {
        attemptNumber: 1,
        recordedAt: "2026-08-23T12:02:00.000Z",
      }),
      auditEvent(2, "TRANSPORT_RESULT_RECORDED", {
        attemptNumber: 1,
        resultStatus: "ACCEPTED",
        recordedAt: RECORDED_AT,
      }),
    ];
    const protocolResult = {
      protocolVersion: "1.0" as const,
      objectType: "READY_PACKAGE_V2_DELIVERY_RESULT" as const,
      deliveryId: DELIVERY,
      readyPackageId: PACKAGE,
      status: "ACCEPTED" as const,
      requestSha256: REQUEST_SHA,
    };
    const recordResult = vi.fn(() => ({
      ...persisted,
      state: "RESULT_RECORDED" as const,
      result: { ...protocolResult, recordedAt: "2026-08-23T12:06:00.000Z" },
      updatedAt: "2026-08-23T12:06:00.000Z",
    }));
    const transportSubmit = vi.fn();
    const service = new ReadyPackageV2DeliveryService({
      readyPackages: {} as never,
      canonical: {} as never,
      staging: {} as never,
      bindings: {} as never,
      deliveries: {
        getByReadyPackage: vi.fn(() => persisted),
        prepare: vi.fn(),
        markTransportAttempt: vi.fn(),
        recordTransportUncertainty: vi.fn(),
        recordTransportResult: vi.fn(),
        recordResult,
        list: vi.fn(() => []),
        listAuditEvents: vi.fn(() => auditEvents),
      } as never,
      transport: { submit: transportSubmit },
    });

    const result = await service.submit(WORKSPACE, PACKAGE);

    expect(result.transportUsed).toBe(false);
    expect(result.replayed).toBe(true);
    expect(recordResult).toHaveBeenCalledWith(WORKSPACE, DELIVERY, protocolResult);
    expect(recordResult.mock.calls[0]?.[2]).not.toHaveProperty("recordedAt");
    expect(transportSubmit).not.toHaveBeenCalled();
  });
});
