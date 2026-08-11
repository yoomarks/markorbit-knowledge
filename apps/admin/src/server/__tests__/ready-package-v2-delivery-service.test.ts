import { describe, expect, it, vi } from "vitest";
import type { ReadyPackageV2DeliverySubmission } from "@markorbit/persistence/ready-package-v2-deliveries";
import { ReadyPackageV2DeliveryService } from "../ready-package-v2-delivery-service";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PACKAGE = "rdp_01K14TEST000000000000000001";
const REQUEST_SHA = "a".repeat(64);

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
      deliveries: {
        getByReadyPackage: vi.fn(() => persisted),
        prepare: vi.fn(),
        markTransportAttempt: vi.fn(),
        recordTransportResult: vi.fn(),
        recordResult,
        list: vi.fn(),
      },
      transport: { submit: transportSubmit },
    });

    const result = await service.submit(WORKSPACE, PACKAGE);

    expect(result.transportUsed).toBe(false);
    expect(result.replayed).toBe(true);
    expect(result.submission.state).toBe("RESULT_RECORDED");
    expect(recordResult).toHaveBeenCalledTimes(1);
    expect(transportSubmit).not.toHaveBeenCalled();
  });

  it("returns an already finalized submission without touching transport", async () => {
    const finalized = {
      ...submission(),
      state: "RESULT_RECORDED" as const,
      result: {
        ...submission().transportResult!,
        recordedAt: "2026-08-11T16:33:00.000Z",
      },
    };
    const transportSubmit = vi.fn();
    const service = new ReadyPackageV2DeliveryService({
      readyPackages: {} as never,
      canonical: {} as never,
      staging: {} as never,
      bindings: {} as never,
      deliveries: {
        getByReadyPackage: vi.fn(() => finalized),
        prepare: vi.fn(),
        markTransportAttempt: vi.fn(),
        recordTransportResult: vi.fn(),
        recordResult: vi.fn(),
        list: vi.fn(),
      },
      transport: { submit: transportSubmit },
    });

    const result = await service.submit(WORKSPACE, PACKAGE);

    expect(result.submission).toEqual(finalized);
    expect(result.transportUsed).toBe(false);
    expect(transportSubmit).not.toHaveBeenCalled();
  });
});
