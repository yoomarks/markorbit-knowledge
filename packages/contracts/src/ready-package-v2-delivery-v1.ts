import type { ReadyPackageContentExportV2 } from "./ready-package-content-export-v2";

export const READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION = "1.0" as const;
export const READY_PACKAGE_V2_DELIVERY_REQUEST_OBJECT_TYPE =
  "READY_PACKAGE_V2_DELIVERY_REQUEST" as const;
export const READY_PACKAGE_V2_DELIVERY_RESULT_OBJECT_TYPE =
  "READY_PACKAGE_V2_DELIVERY_RESULT" as const;
export const READY_PACKAGE_V2_DELIVERY_TARGET_SERVICE = "MARKORBIT_CORE" as const;
export const READY_PACKAGE_V2_DELIVERY_STATUSES = ["RECEIVED", "ACCEPTED", "REJECTED"] as const;

export type ReadyPackageV2DeliveryStatus = (typeof READY_PACKAGE_V2_DELIVERY_STATUSES)[number];

export type ReadyPackageV2DeliveryRequestV1 = {
  protocolVersion: typeof READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION;
  objectType: typeof READY_PACKAGE_V2_DELIVERY_REQUEST_OBJECT_TYPE;
  deliveryId: string;
  readyPackageId: string;
  knowledgeWorkspaceId: string;
  target: {
    service: typeof READY_PACKAGE_V2_DELIVERY_TARGET_SERVICE;
    workspaceId: string;
  };
  readyPackageDigest: string;
  contentExportSha256: string;
  contentExport: ReadyPackageContentExportV2;
  submittedAt: string;
};

export type ReadyPackageV2DeliveryResultV1 = {
  protocolVersion: typeof READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION;
  objectType: typeof READY_PACKAGE_V2_DELIVERY_RESULT_OBJECT_TYPE;
  deliveryId: string;
  readyPackageId: string;
  status: ReadyPackageV2DeliveryStatus;
  requestSha256: string;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isReadyPackageV2DeliveryRequestV1(
  value: unknown,
): value is ReadyPackageV2DeliveryRequestV1 {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "protocolVersion",
      "objectType",
      "deliveryId",
      "readyPackageId",
      "knowledgeWorkspaceId",
      "target",
      "readyPackageDigest",
      "contentExportSha256",
      "contentExport",
      "submittedAt",
    ]) ||
    !isRecord(value.target) ||
    !exactKeys(value.target, ["service", "workspaceId"])
  ) {
    return false;
  }
  const contentExport = value.contentExport as ReadyPackageContentExportV2 | undefined;
  return (
    value.protocolVersion === READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION &&
    value.objectType === READY_PACKAGE_V2_DELIVERY_REQUEST_OBJECT_TYPE &&
    typeof value.deliveryId === "string" &&
    value.deliveryId.startsWith("rvd_") &&
    typeof value.readyPackageId === "string" &&
    value.readyPackageId.startsWith("rdp_") &&
    typeof value.knowledgeWorkspaceId === "string" &&
    value.knowledgeWorkspaceId.startsWith("wsp_") &&
    value.target.service === READY_PACKAGE_V2_DELIVERY_TARGET_SERVICE &&
    typeof value.target.workspaceId === "string" &&
    UUID.test(value.target.workspaceId) &&
    typeof value.readyPackageDigest === "string" &&
    SHA256.test(value.readyPackageDigest) &&
    typeof value.contentExportSha256 === "string" &&
    SHA256.test(value.contentExportSha256) &&
    isRecord(contentExport) &&
    contentExport.contractVersion === "2.0" &&
    contentExport.objectType === "READY_PACKAGE_CONTENT_EXPORT" &&
    contentExport.readyPackageId === value.readyPackageId &&
    contentExport.knowledgeWorkspaceId === value.knowledgeWorkspaceId &&
    contentExport.readyPackageDigest === value.readyPackageDigest &&
    isTimestamp(value.submittedAt)
  );
}

export function assertReadyPackageV2DeliveryRequestV1(
  value: unknown,
): asserts value is ReadyPackageV2DeliveryRequestV1 {
  if (!isReadyPackageV2DeliveryRequestV1(value)) {
    throw new TypeError("Invalid ReadyPackageV2DeliveryRequestV1");
  }
}

export function serializeReadyPackageV2DeliveryRequestV1(
  value: ReadyPackageV2DeliveryRequestV1,
): string {
  assertReadyPackageV2DeliveryRequestV1(value);
  return JSON.stringify({
    protocolVersion: value.protocolVersion,
    objectType: value.objectType,
    deliveryId: value.deliveryId,
    readyPackageId: value.readyPackageId,
    knowledgeWorkspaceId: value.knowledgeWorkspaceId,
    target: {
      service: value.target.service,
      workspaceId: value.target.workspaceId.toLowerCase(),
    },
    readyPackageDigest: value.readyPackageDigest,
    contentExportSha256: value.contentExportSha256,
    contentExport: value.contentExport,
    submittedAt: value.submittedAt,
  } satisfies ReadyPackageV2DeliveryRequestV1);
}

export function isReadyPackageV2DeliveryResultV1(
  value: unknown,
): value is ReadyPackageV2DeliveryResultV1 {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "protocolVersion",
      "objectType",
      "deliveryId",
      "readyPackageId",
      "status",
      "requestSha256",
    ])
  ) {
    return false;
  }
  return (
    value.protocolVersion === READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION &&
    value.objectType === READY_PACKAGE_V2_DELIVERY_RESULT_OBJECT_TYPE &&
    typeof value.deliveryId === "string" &&
    value.deliveryId.startsWith("rvd_") &&
    typeof value.readyPackageId === "string" &&
    value.readyPackageId.startsWith("rdp_") &&
    typeof value.status === "string" &&
    READY_PACKAGE_V2_DELIVERY_STATUSES.includes(value.status as ReadyPackageV2DeliveryStatus) &&
    typeof value.requestSha256 === "string" &&
    SHA256.test(value.requestSha256)
  );
}

export function assertReadyPackageV2DeliveryResultV1(
  value: unknown,
): asserts value is ReadyPackageV2DeliveryResultV1 {
  if (!isReadyPackageV2DeliveryResultV1(value)) {
    throw new TypeError("Invalid ReadyPackageV2DeliveryResultV1");
  }
}
