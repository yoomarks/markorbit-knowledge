import { readFileSync } from "node:fs";

export type AdkLivePilotRuntimeSecretV1 = {
  protocolVersion: "1.0";
  objectType: "ADK_LIVE_PILOT_RUNTIME_SECRET";
  workerId: string;
  workerCredential: string;
  leaseId: string;
  leaseToken: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseAdkLivePilotRuntimeSecret(value: unknown): AdkLivePilotRuntimeSecretV1 {
  const item = record(value);
  const expectedKeys = [
    "protocolVersion",
    "objectType",
    "workerId",
    "workerCredential",
    "leaseId",
    "leaseToken",
  ];
  if (
    !item ||
    Object.keys(item).length !== expectedKeys.length ||
    !expectedKeys.every((key) => key in item) ||
    item.protocolVersion !== "1.0" ||
    item.objectType !== "ADK_LIVE_PILOT_RUNTIME_SECRET" ||
    !nonEmpty(item.workerId) ||
    !nonEmpty(item.workerCredential) ||
    !nonEmpty(item.leaseId) ||
    !nonEmpty(item.leaseToken)
  ) {
    throw new Error("Invalid ADK live pilot runtime secret file");
  }

  return {
    protocolVersion: "1.0",
    objectType: "ADK_LIVE_PILOT_RUNTIME_SECRET",
    workerId: item.workerId,
    workerCredential: item.workerCredential,
    leaseId: item.leaseId,
    leaseToken: item.leaseToken,
  };
}

export function loadAdkLivePilotRuntimeSecret(path: string): AdkLivePilotRuntimeSecretV1 {
  return parseAdkLivePilotRuntimeSecret(JSON.parse(readFileSync(path, "utf8")) as unknown);
}
