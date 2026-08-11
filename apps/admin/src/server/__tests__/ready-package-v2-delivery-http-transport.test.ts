import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION,
  READY_PACKAGE_V2_DELIVERY_REQUEST_OBJECT_TYPE,
  serializeReadyPackageV2DeliveryRequestV1,
  type ReadyPackageV2DeliveryRequestV1,
} from "@markorbit/contracts";
import {
  HttpReadyPackageV2DeliveryTransport,
  readyPackageV2DeliveryTransportReadiness,
} from "../ready-package-v2-delivery-http-transport";

const CORE_WORKSPACE = "123e4567-e89b-12d3-a456-426614174000";
const SHA = "a".repeat(64);

function request(): ReadyPackageV2DeliveryRequestV1 {
  return {
    protocolVersion: READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION,
    objectType: READY_PACKAGE_V2_DELIVERY_REQUEST_OBJECT_TYPE,
    deliveryId: "rvd_01K14TEST000000000000000001",
    readyPackageId: "rdp_01K14TEST000000000000000001",
    knowledgeWorkspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    target: { service: "MARKORBIT_CORE", workspaceId: CORE_WORKSPACE },
    readyPackageDigest: SHA,
    contentExportSha256: "b".repeat(64),
    contentExport: {
      contractVersion: "2.0",
      objectType: "READY_PACKAGE_CONTENT_EXPORT",
      readyPackageId: "rdp_01K14TEST000000000000000001",
      knowledgeWorkspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      readyPackageDigest: SHA,
      canonicalDocument: {
        documentId: "cdd_01K14TEST000000000000000001",
        promotedAt: "2026-08-11T16:20:00.000Z",
      },
      provenance: {
        origin: {
          kind: "VAULT_IMPORT",
          inspectionRunId: "vin_01K14TEST000000000000000001",
          importIntentId: "vmi_01K14TEST000000000000000001",
          importExecutionId: "vie_01K14TEST000000000000000001",
          vaultStagingDocumentId: "vst_01K14TEST000000000000000001",
          verificationId: "vsv_01K14TEST000000000000000001",
          verificationOutcome: "PASS",
          finalizationId: "vsf_01K14TEST000000000000000001",
          rootFingerprintSha256: "c".repeat(64),
          binding: {
            bindingId: "vlt_01K14TEST000000000000000001",
            revision: 1,
            relativeRoot: "MarkOrbit/Review",
          },
          vaultRelativePath: "MarkOrbit/Review/incoming/k14.md",
          bindingRelativePath: "incoming/k14.md",
          observedAt: "2026-08-11T16:00:00.000Z",
          reviewedAt: "2026-08-11T16:05:00.000Z",
          importedAt: "2026-08-11T16:10:00.000Z",
          verifiedAt: "2026-08-11T16:15:00.000Z",
        },
        legalTruthVerified: false,
      },
      content: {
        sha256: "d".repeat(64),
        sizeBytes: 6,
        contentAddressedRef: `cas:sha256:${"d".repeat(64)}`,
        mediaType: "text/markdown",
        encoding: "utf-8",
        content: "hello\n",
      },
    },
    submittedAt: "2026-08-11T16:30:00.000Z",
  };
}

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe("ReadyPackage V2 delivery transport", () => {
  it("requires a dedicated V2 endpoint and explicit protocol declaration", () => {
    process.env.MARKORBIT_CORE_V2_DELIVERY_URL = "https://core.example/internal/knowledge/v2";
    process.env.MARKORBIT_CORE_INTERNAL_SECRET = "secret";
    delete process.env.MARKORBIT_CORE_V2_PROTOCOL_VERSION;
    expect(readyPackageV2DeliveryTransportReadiness(CORE_WORKSPACE)).toEqual({
      configured: false,
      issueCode: "CORE_V2_DELIVERY_PROTOCOL_NOT_DECLARED",
    });

    process.env.MARKORBIT_CORE_V2_PROTOCOL_VERSION = "1.0";
    process.env.MARKORBIT_CORE_INTAKE_URL = "https://core.example/internal/knowledge/v2";
    expect(readyPackageV2DeliveryTransportReadiness(CORE_WORKSPACE)).toEqual({
      configured: false,
      issueCode: "CORE_V2_DELIVERY_V1_ENDPOINT_REUSE_FORBIDDEN",
    });

    process.env.MARKORBIT_CORE_INTAKE_URL =
      "https://core.example/internal/knowledge/ready-packages/intakes";
    expect(readyPackageV2DeliveryTransportReadiness(CORE_WORKSPACE)).toEqual({
      configured: true,
      issueCode: null,
    });
  });

  it("sends the exact frozen JSON with stable idempotency and validates the echoed request hash", async () => {
    const frozen = serializeReadyPackageV2DeliveryRequestV1(request());
    const requestSha256 = createHash("sha256").update(frozen).digest("hex");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: "1.0",
          objectType: "READY_PACKAGE_V2_DELIVERY_RESULT",
          deliveryId: request().deliveryId,
          readyPackageId: request().readyPackageId,
          status: "RECEIVED",
          requestSha256,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const transport = new HttpReadyPackageV2DeliveryTransport(
      "https://core.example/internal/knowledge/v2",
      "secret",
      fetchImpl,
    );

    const result = await transport.submit(frozen, "ready-package-v2-delivery:fixed");

    expect(result.status).toBe("RECEIVED");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://core.example/internal/knowledge/v2");
    expect(init?.body).toBe(frozen);
    expect(new Headers(init?.headers).get("idempotency-key")).toBe(
      "ready-package-v2-delivery:fixed",
    );
    expect(new Headers(init?.headers).get("x-markorbit-ready-package-v2-delivery-protocol")).toBe(
      "1.0",
    );
  });

  it("rejects a result that belongs to another frozen request", async () => {
    const frozen = serializeReadyPackageV2DeliveryRequestV1(request());
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: "1.0",
          objectType: "READY_PACKAGE_V2_DELIVERY_RESULT",
          deliveryId: request().deliveryId,
          readyPackageId: request().readyPackageId,
          status: "RECEIVED",
          requestSha256: "f".repeat(64),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const transport = new HttpReadyPackageV2DeliveryTransport(
      "https://core.example/internal/knowledge/v2",
      "secret",
      fetchImpl,
    );

    await expect(transport.submit(frozen, "ready-package-v2-delivery:fixed")).rejects.toMatchObject(
      {
        code: "CORE_V2_DELIVERY_RESPONSE_MISMATCH",
      },
    );
  });
});
