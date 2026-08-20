export type SourceCompatibilityRecorderConfig = {
  controlPlaneUrl: string;
  workerId: string;
  workerCredential: string;
};

export type SourceCompatibilityRecorderResult = {
  version: string;
  recorded: number;
  observedAt: string | null;
  states: {
    PASS: number;
    DEGRADED: number;
    BLOCKED: number;
  };
};

type FetchLike = typeof fetch;

function endpoint(controlPlaneUrl: string): string {
  return `${controlPlaneUrl.replace(/\/$/u, "")}/api/worker/v1/source-compatibility-observations`;
}

async function recordSummary(
  config: SourceCompatibilityRecorderConfig,
  summary: unknown,
  reprobeExecutionId: string | undefined,
  fetchImplementation: FetchLike,
): Promise<SourceCompatibilityRecorderResult> {
  const response = await fetchImplementation(endpoint(config.controlPlaneUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.workerCredential}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      workerId: config.workerId,
      summary,
      ...(reprobeExecutionId ? { reprobeExecutionId } : {}),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Source compatibility observation intake failed (${response.status}): ${text.slice(0, 1000)}`,
    );
  }

  const result = JSON.parse(text) as SourceCompatibilityRecorderResult;
  if (
    typeof result !== "object" ||
    result === null ||
    typeof result.version !== "string" ||
    typeof result.recorded !== "number"
  ) {
    throw new Error("Source compatibility observation intake returned an invalid response");
  }
  return result;
}

export function recordRepresentativeLiveCanarySummary(
  config: SourceCompatibilityRecorderConfig,
  summary: unknown,
  fetchImplementation: FetchLike = fetch,
): Promise<SourceCompatibilityRecorderResult> {
  return recordSummary(config, summary, undefined, fetchImplementation);
}

export function recordRepresentativeLiveCanarySummaryForReprobe(
  config: SourceCompatibilityRecorderConfig,
  summary: unknown,
  reprobeExecutionId: string,
  fetchImplementation: FetchLike = fetch,
): Promise<SourceCompatibilityRecorderResult> {
  const executionId = reprobeExecutionId.trim();
  if (!executionId) throw new Error("reprobeExecutionId is required");
  return recordSummary(config, summary, executionId, fetchImplementation);
}
