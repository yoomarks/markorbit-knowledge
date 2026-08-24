import { readFileSync } from "node:fs";

export type AdkLivePilotRuntimeSecretV1 = {
  protocolVersion: "1.0";
  objectType: "ADK_LIVE_PILOT_RUNTIME_SECRET";
  pilotId: string;
  approvalRef: string;
  databasePath: string;
  storageRoot: string;
  planPath: string;
  workerId: string;
  workerCredential: string;
  leaseId: string;
  leaseToken: string;
  preparedAt: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function parseAdkLivePilotRuntimeSecret(value: unknown): AdkLivePilotRuntimeSecretV1 {
  const item = record(value);
  const expectedKeys = [
    "protocolVersion",
    "objectType",
    "pilotId",
    "approvalRef",
    "databasePath",
    "storageRoot",
    "planPath",
    "workerId",
    "workerCredential",
    "leaseId",
    "leaseToken",
    "preparedAt",
  ];
  if (
    !item ||
    Object.keys(item).length !== expectedKeys.length ||
    !expectedKeys.every((key) => key in item) ||
    item.protocolVersion !== "1.0" ||
    item.objectType !== "ADK_LIVE_PILOT_RUNTIME_SECRET" ||
    !nonEmpty(item.pilotId) ||
    !nonEmpty(item.approvalRef) ||
    !nonEmpty(item.databasePath) ||
    !nonEmpty(item.storageRoot) ||
    !nonEmpty(item.planPath) ||
    !nonEmpty(item.workerId) ||
    !nonEmpty(item.workerCredential) ||
    !nonEmpty(item.leaseId) ||
    !nonEmpty(item.leaseToken) ||
    !timestamp(item.preparedAt)
  ) {
    throw new Error("Invalid ADK live pilot runtime secret file");
  }

  return {
    protocolVersion: "1.0",
    objectType: "ADK_LIVE_PILOT_RUNTIME_SECRET",
    pilotId: item.pilotId,
    approvalRef: item.approvalRef,
    databasePath: item.databasePath,
    storageRoot: item.storageRoot,
    planPath: item.planPath,
    workerId: item.workerId,
    workerCredential: item.workerCredential,
    leaseId: item.leaseId,
    leaseToken: item.leaseToken,
    preparedAt: item.preparedAt,
  };
}

export function loadAdkLivePilotRuntimeSecret(path: string): AdkLivePilotRuntimeSecretV1 {
  return parseAdkLivePilotRuntimeSecret(JSON.parse(readFileSync(path, "utf8")) as unknown);
}
