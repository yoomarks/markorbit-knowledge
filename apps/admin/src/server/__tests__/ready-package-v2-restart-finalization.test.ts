import { describe, expect, it, vi } from "vitest";
import type {
  ReadyPackageV2DeliveryAuditEvent,
  ReadyPackageV2DeliverySubmission,
} from "@markorbit/persistence/ready-package-v2-deliveries";
import { ReadyPackageV2DeliveryService } from "../ready-package-v2-delivery-service";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const READY_PACKAGE = "rdp_01K14TEST000000000000000001";
const DELIVERY = "rvd_01K14TEST000000000000000001";
const REQUEST_SHA = "a".repeat(64);

function audit(
  sequence: number,
  type: ReadyPackageV2DeliveryAuditEvent["type"],
  overrides: Partial<ReadyPackageV2DeliveryAuditEvent> = {},
): ReadyPackageV2DeliveryAuditEvent {
  return {
    workspaceId: WORKSPACE,
    submissionId: DELIVERY,
    readyPackageId: READY_PACKAGE,
    sequence,
    type,
    requestSha256: REQUEST_SHA,
    recordedAt: new Date(Date.parse("2026-08-23T10:00:00.000Z") + sequence * 60_000).toISOString(),
    ...overrides,
  };
}

describe("ReadyPackage V2 restart finalization", () => {
  it("strips local recordedAt evidence before exact protocol finalization and never resends HTTP", async () => {
    const started = audit(2, "TRANSPORT_ATTEMPT_STARTED", { attemptNumber: 1 });
    const transportRecorded = audit(3, "TRANSPORT_RESULT_RECORDED", {
      attemptNumber: 1,
      resultStatus: "ACCEPTED",
    });
    const protocolResult = {
      protocolVersion: "1.0" as const,
      objectType: "READY_PACKAGE_V2_DELIVERY_RESULT" as const,
      deliveryId: DELIVERY,
      readyPackageId: READY_PACKAGE,
      status: "ACCEPTED" as const,
      requestSha256: REQUEST_SHA,
    };
    const persisted: ReadyPackageV2DeliverySubmission = {
      submissionId: DELIVERY,
      workspaceId: WORKSPACE,
      readyPackageId: READY_PACKAGE,
      readyPackageDigest: "b".repeat(64),
      coreWorkspaceId: "123e4567-e89b-12d3-a456-426614174000",
      idempotencyKey: `ready-package-v2-delivery:${DELIVERY}`,
      requestJson: '{"frozen":true}',
      requestSha256: REQUEST_SHA,
      contentExportSha256: "c".repeat(64),
      state: "PENDING",
      transportAttempts: 1,
      lastTransportAttemptedAt: started.recordedAt,
      transportResult: { ...protocolResult, recordedAt: transportRecorded.recordedAt },
      createdAt: "2026-08-23T10:00:00.000Z",
      updatedAt: transportRecorded.recordedAt,
    };
    const finalized: ReadyPackageV2DeliverySubmission = {
      ...persisted,
      state: "RESULT_RECORDED",
      result: { ...protocolResult, recordedAt: "2026-08-23T10:04:00.000Z" },
      updatedAt: "2026-08-23T10:04:00.000Z",
    };
    const recordResult = vi.fn(() => finalized);
    const transportSubmit = vi.fn();
    const deliveries = {
      getByReadyPackage: vi.fn(() => persisted),
      prepare: vi.fn(),
      markTransportAttempt: vi.fn(),
      recordTransportUncertainty: vi.fn(),
      recordTransportResult: vi.fn(),
      recordResult,
      list: vi.fn(() => []),
      listAuditEvents: vi.fn(() => [audit(1, "PREPARED"), started, transportRecorded]),
    } as never;
    const service = new ReadyPackageV2DeliveryService({
      readyPackages: {} as never,
      canonical: {} as never,
      staging: {} as never,
      bindings: {} as never,
      deliveries,
      transport: { submit: transportSubmit },
    });

    const result = await service.submit(WORKSPACE, READY_PACKAGE);

    expect(result.transportUsed).toBe(false);
    expect(result.replayed).toBe(true);
    expect(result.submission.state).toBe("RESULT_RECORDED");
    expect(recordResult).toHaveBeenCalledWith(WORKSPACE, DELIVERY, protocolResult);
    expect(transportSubmit).not.toHaveBeenCalled();
  });
});
