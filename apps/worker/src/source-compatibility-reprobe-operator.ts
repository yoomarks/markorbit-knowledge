export type SourceCompatibilityState = "PASS" | "DEGRADED" | "BLOCKED";

export type SourceCompatibilityReprobeOperatorConfig = {
  controlPlaneUrl: string;
  workerId: string;
  workerCredential: string;
};

export type SourceCompatibilityReprobeExecutionView = {
  executionId: string;
  intentId: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  executedByActorId: string;
  workerId: string;
  status: "STARTED" | "COMPLETED" | "FAILED";
  observationObservedAt: string | null;
  observationState: SourceCompatibilityState | null;
  errorCode: string | null;
  errorMessage: string | null;
  replayed: boolean;
};

export type SourceCompatibilityReprobeReconciliationView = {
  reconciled: boolean;
  execution: SourceCompatibilityReprobeExecutionView;
};

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${field}`);
  return value.trim();
}

function endpoint(controlPlaneUrl: string): string {
  return `${controlPlaneUrl.replace(/\/$/u, "")}/api/worker/v1/source-compatibility-reprobes`;
}

function parseExecution(value: unknown): SourceCompatibilityReprobeExecutionView {
  const execution = record(value);
  if (!execution) throw new Error("Compatibility re-probe API returned no execution");
  const status = requiredString(execution.status, "execution.status");
  if (status !== "STARTED" && status !== "COMPLETED" && status !== "FAILED") {
    throw new Error("Compatibility re-probe API returned an invalid execution status");
  }
  const observationState = execution.observationState;
  if (
    observationState !== null &&
    observationState !== "PASS" &&
    observationState !== "DEGRADED" &&
    observationState !== "BLOCKED"
  ) {
    throw new Error("Compatibility re-probe API returned an invalid observation state");
  }
  if (typeof execution.replayed !== "boolean") {
    throw new Error("Compatibility re-probe API returned an invalid replayed flag");
  }
  return {
    executionId: requiredString(execution.executionId, "execution.executionId"),
    intentId: requiredString(execution.intentId, "execution.intentId"),
    workspaceId: requiredString(execution.workspaceId, "execution.workspaceId"),
    jurisdiction: requiredString(execution.jurisdiction, "execution.jurisdiction"),
    targetId: requiredString(execution.targetId, "execution.targetId"),
    executedByActorId: requiredString(execution.executedByActorId, "execution.executedByActorId"),
    workerId: requiredString(execution.workerId, "execution.workerId"),
    status,
    observationObservedAt:
      typeof execution.observationObservedAt === "string" ? execution.observationObservedAt : null,
    observationState: observationState as SourceCompatibilityState | null,
    errorCode: typeof execution.errorCode === "string" ? execution.errorCode : null,
    errorMessage: typeof execution.errorMessage === "string" ? execution.errorMessage : null,
    replayed: execution.replayed,
  };
}

async function operation(
  config: SourceCompatibilityReprobeOperatorConfig,
  payload: JsonRecord,
  fetchImplementation: FetchLike,
): Promise<JsonRecord> {
  const response = await fetchImplementation(endpoint(config.controlPlaneUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.workerCredential}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ workerId: config.workerId, ...payload }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Compatibility re-probe operation ${String(payload.operation)} failed (${response.status}): ${text.slice(0, 1000)}`,
    );
  }
  const body = record(JSON.parse(text));
  if (!body) throw new Error("Compatibility re-probe API returned an invalid response");
  return body;
}

export async function startSourceCompatibilityReprobe(
  config: SourceCompatibilityReprobeOperatorConfig,
  input: { intentId: string; executedByActorId: string; idempotencyKey: string },
  fetchImplementation: FetchLike = fetch,
): Promise<SourceCompatibilityReprobeExecutionView> {
  const body = await operation(
    config,
    {
      operation: "START",
      intentId: input.intentId,
      executedByActorId: input.executedByActorId,
      idempotencyKey: input.idempotencyKey,
    },
    fetchImplementation,
  );
  return parseExecution(body.execution);
}

export async function reconcileSourceCompatibilityReprobe(
  config: SourceCompatibilityReprobeOperatorConfig,
  input: { executionId: string },
  fetchImplementation: FetchLike = fetch,
): Promise<SourceCompatibilityReprobeReconciliationView> {
  const body = await operation(
    config,
    { operation: "RECONCILE", executionId: input.executionId },
    fetchImplementation,
  );
  if (typeof body.reconciled !== "boolean") {
    throw new Error("Compatibility re-probe reconciliation returned an invalid reconciled flag");
  }
  return { reconciled: body.reconciled, execution: parseExecution(body.execution) };
}

export async function completeSourceCompatibilityReprobe(
  config: SourceCompatibilityReprobeOperatorConfig,
  input: { executionId: string; observedAt: string; state: SourceCompatibilityState },
  fetchImplementation: FetchLike = fetch,
): Promise<SourceCompatibilityReprobeExecutionView> {
  const body = await operation(
    config,
    {
      operation: "COMPLETE",
      executionId: input.executionId,
      observedAt: input.observedAt,
      state: input.state,
    },
    fetchImplementation,
  );
  return parseExecution(body.execution);
}

export async function failSourceCompatibilityReprobe(
  config: SourceCompatibilityReprobeOperatorConfig,
  input: { executionId: string; errorCode: string; errorMessage: string },
  fetchImplementation: FetchLike = fetch,
): Promise<SourceCompatibilityReprobeExecutionView> {
  const body = await operation(
    config,
    {
      operation: "FAIL",
      executionId: input.executionId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    },
    fetchImplementation,
  );
  return parseExecution(body.execution);
}

export type FilteredRepresentativeCanarySummary = {
  version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2";
  observedAt: string;
  observations: [JsonRecord];
};

export function filterRepresentativeCanarySummary(
  summaryValue: unknown,
  targetId: string,
): {
  summary: FilteredRepresentativeCanarySummary;
  state: SourceCompatibilityState;
  observedAt: string;
} {
  const summary = record(summaryValue);
  if (summary?.version !== "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2") {
    throw new Error("Representative canary returned an unsupported summary version");
  }
  const observedAt = requiredString(summary.observedAt, "summary.observedAt");
  if (!Array.isArray(summary.observations)) {
    throw new Error("Representative canary summary is missing observations");
  }
  const matches = summary.observations
    .map((value) => record(value))
    .filter((value): value is JsonRecord => value !== null)
    .filter((value) => value.targetId === targetId);
  if (matches.length !== 1) {
    throw new Error(
      `Representative canary summary must contain exactly one observation for ${targetId}; found ${matches.length}`,
    );
  }
  const state = requiredString(matches[0].state, "observation.state") as SourceCompatibilityState;
  if (state !== "PASS" && state !== "DEGRADED" && state !== "BLOCKED") {
    throw new Error(`Representative canary returned invalid state ${state}`);
  }
  return {
    summary: {
      version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
      observedAt,
      observations: [matches[0]],
    },
    state,
    observedAt,
  };
}
