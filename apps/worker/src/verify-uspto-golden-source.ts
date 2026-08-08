const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Golden Source verification missing ${field}`);
  }
  return value;
}

function baseUrl(): string {
  const raw = process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() || "http://127.0.0.1:3000";
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MARKORBIT_CONTROL_PLANE_URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl()}${path}`);
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

function runStatus(payload: unknown): string {
  const outer = record(payload);
  const runRecord = record(outer?.run);
  const run = record(runRecord?.run);
  return requiredString(run?.status, "run.status");
}

function jobs(payload: unknown): Record<string, unknown>[] {
  const outer = record(payload);
  const runRecord = record(outer?.run);
  return array(runRecord?.jobs).map(record).filter((value): value is Record<string, unknown> => !!value);
}

async function waitForTerminal(runId: string, timeoutMs: number): Promise<unknown> {
  const startedAt = Date.now();
  let lastStatus = "UNKNOWN";
  while (Date.now() - startedAt < timeoutMs) {
    const payload = await getJson(`/api/runs/${encodeURIComponent(runId)}`);
    lastStatus = runStatus(payload);
    process.stdout.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), event: "golden-source.poll", runId, status: lastStatus })}\n`,
    );
    if (TERMINAL_STATUSES.has(lastStatus)) return payload;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Golden Source run ${runId} did not reach a terminal state; last=${lastStatus}`);
}

function verifyArtifacts(payload: unknown): {
  count: number;
  kinds: string[];
  receiptIds: string[];
} {
  const outer = record(payload);
  const items = array(outer?.items).map(record).filter((value): value is Record<string, unknown> => !!value);
  if (items.length < 2) {
    throw new Error(`Expected at least two RawArtifacts, received ${items.length}`);
  }

  const kinds = new Set<string>();
  const receiptIds: string[] = [];
  for (const item of items) {
    const artifact = record(item.artifact);
    if (!artifact) throw new Error("RawArtifact list item is missing artifact");

    const provenance = record(artifact.provenance);
    const binaryHash = record(artifact.binaryHash);
    const collector = record(artifact.collector);
    const contentObject = record(item.contentObject);
    if (!provenance || !binaryHash || !collector || !contentObject) {
      throw new Error(`RawArtifact ${String(artifact.id)} is missing governed evidence metadata`);
    }

    const kind = requiredString(artifact.artifactKind, "artifact.artifactKind");
    const sourceUri = requiredString(provenance.sourceUri, "artifact.provenance.sourceUri");
    const hashAlgorithm = requiredString(binaryHash.algorithm, "artifact.binaryHash.algorithm");
    const sha256 = requiredString(binaryHash.value, "artifact.binaryHash.value");
    const contentSha256 = requiredString(contentObject.sha256, "contentObject.sha256");
    const sizeBytes = artifact.sizeBytes;
    const status = requiredString(artifact.status, "artifact.status");
    const connectorId = requiredString(collector.connectorId, "artifact.collector.connectorId");
    const connectorVersion = requiredString(
      collector.connectorVersion,
      "artifact.collector.connectorVersion",
    );
    const receiptId = requiredString(item.receiptId, "artifact.receiptId");

    const source = new URL(sourceUri);
    if (
      source.protocol !== "https:" ||
      (source.hostname !== "uspto.gov" && !source.hostname.endsWith(".uspto.gov"))
    ) {
      throw new Error(`Unexpected Golden Source provenance URI: ${sourceUri}`);
    }
    if (hashAlgorithm !== "SHA-256" || !/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error(`RawArtifact ${String(artifact.id)} has invalid SHA-256 evidence`);
    }
    if (contentSha256 !== sha256) {
      throw new Error(`RawArtifact ${String(artifact.id)} hash differs from content object`);
    }
    if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
      throw new Error(`RawArtifact ${String(artifact.id)} has invalid sizeBytes`);
    }
    if (contentObject.sizeBytes !== sizeBytes) {
      throw new Error(`RawArtifact ${String(artifact.id)} size differs from content object`);
    }
    if (status !== "REGISTERED") {
      throw new Error(`RawArtifact ${String(artifact.id)} is not REGISTERED: ${status}`);
    }
    if (connectorId !== "crawl4ai-web" || connectorVersion !== "1.1.0") {
      throw new Error(
        `RawArtifact ${String(artifact.id)} has unexpected collector ${connectorId}@${connectorVersion}`,
      );
    }

    kinds.add(kind);
    receiptIds.push(receiptId);
  }

  for (const requiredKind of ["HTML", "MARKDOWN"]) {
    if (!kinds.has(requiredKind)) {
      throw new Error(`Golden Source evidence is missing ${requiredKind}`);
    }
  }

  return { count: items.length, kinds: [...kinds].sort(), receiptIds };
}

function verifyExecutions(payload: unknown, artifactReceiptIds: string[]): void {
  const outer = record(payload);
  const executions = array(outer?.executions)
    .map(record)
    .filter((value): value is Record<string, unknown> => !!value);
  if (executions.length !== 1) {
    throw new Error(`Expected one execution attempt, received ${executions.length}`);
  }
  const attempt = record(executions[0]?.attempt);
  if (!attempt) throw new Error("Execution evidence is missing attempt");
  const status = requiredString(attempt.status, "execution.attempt.status");
  if (status !== "COMPLETED") {
    throw new Error(`Execution attempt did not complete: ${status}`);
  }
  const receipt = record(attempt.receipt);
  if (!receipt) throw new Error("Completed execution attempt is missing receipt");
  const receiptIds = array(receipt.artifactReceiptIds).filter(
    (value): value is string => typeof value === "string",
  );
  if (receiptIds.length === 0) {
    throw new Error("Execution receipt contains no artifact receipt references");
  }
  for (const artifactReceiptId of artifactReceiptIds) {
    if (!receiptIds.includes(artifactReceiptId)) {
      throw new Error(`Execution receipt does not reference artifact receipt ${artifactReceiptId}`);
    }
  }

  const events = array(executions[0]?.events).map(record).filter(Boolean) as Record<string, unknown>[];
  const eventTypes = events.map((event) => event.eventType).filter((value): value is string => typeof value === "string");
  for (const requiredEvent of ["STARTED", "UPLOADING", "VERIFYING", "COMPLETED"]) {
    if (!eventTypes.includes(requiredEvent)) {
      throw new Error(`Execution evidence is missing lifecycle event ${requiredEvent}`);
    }
  }
}

async function main(): Promise<void> {
  const runId = requiredString(
    process.argv.slice(2).find((value) => value !== "--"),
    "runId argument",
  );
  const timeoutMs = Number(process.env.MARKORBIT_GOLDEN_SOURCE_TIMEOUT_MS ?? "300000");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 900_000) {
    throw new Error("MARKORBIT_GOLDEN_SOURCE_TIMEOUT_MS must be 30000..900000");
  }

  const terminal = await waitForTerminal(runId, timeoutMs);
  const status = runStatus(terminal);
  if (status !== "COMPLETED") {
    const executionPayload = await getJson(`/api/runs/${encodeURIComponent(runId)}/executions`);
    throw new Error(
      `Golden Source run ended as ${status}: ${JSON.stringify({ run: terminal, executions: executionPayload })}`,
    );
  }

  const runJobs = jobs(terminal);
  if (runJobs.length !== 1 || runJobs[0]?.status !== "COMPLETED") {
    throw new Error(`Golden Source Job did not complete cleanly: ${JSON.stringify(runJobs)}`);
  }

  const artifactPayload = await getJson(`/api/artifacts?runId=${encodeURIComponent(runId)}&limit=100`);
  const artifactEvidence = verifyArtifacts(artifactPayload);
  const executionPayload = await getJson(`/api/runs/${encodeURIComponent(runId)}/executions`);
  verifyExecutions(executionPayload, artifactEvidence.receiptIds);

  process.stdout.write(
    `${JSON.stringify(
      {
        event: "golden-source.verified",
        runId,
        status,
        artifactCount: artifactEvidence.count,
        artifactKinds: artifactEvidence.kinds,
        source: "USPTO",
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
