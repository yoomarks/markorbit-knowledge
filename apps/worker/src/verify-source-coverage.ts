export {};

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const DEFAULT_WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value)
    throw new Error(`Coverage verification missing ${field}`);
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
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

function runStatus(payload: unknown): string {
  const outer = record(payload);
  const runRecord = record(outer?.run);
  const run = record(runRecord?.run);
  return requiredString(run?.status, "run.status");
}

async function waitForRun(runId: string, timeoutMs: number): Promise<unknown> {
  const startedAt = Date.now();
  let lastStatus = "UNKNOWN";
  while (Date.now() - startedAt < timeoutMs) {
    const payload = await getJson(`/api/runs/${encodeURIComponent(runId)}`);
    lastStatus = runStatus(payload);
    process.stdout.write(
      `${JSON.stringify({ event: "source-coverage.poll", runId, status: lastStatus, at: new Date().toISOString() })}\n`,
    );
    if (TERMINAL_STATUSES.has(lastStatus)) return payload;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Coverage run ${runId} timed out with status ${lastStatus}`);
}

async function verifyRegistration(workspaceId: string): Promise<number> {
  const payload = await getJson(
    `/api/source-coverage?jurisdiction=US&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  const outer = record(payload);
  const registrations = array(outer?.registration).map(record).filter(Boolean) as JsonRecord[];
  if (registrations.length === 0) throw new Error("Coverage response contains no registrations");
  const missing = registrations.filter((item) => item.state !== "REGISTERED");
  if (missing.length > 0) {
    throw new Error(
      `Foundational coverage is incomplete: ${missing.map((item) => String(item.targetId)).join(", ")}`,
    );
  }
  return registrations.length;
}

async function verifyArtifacts(runId: string): Promise<{ count: number; kinds: string[] }> {
  const payload = await getJson(`/api/artifacts?runId=${encodeURIComponent(runId)}&limit=100`);
  const items = array(record(payload)?.items).map(record).filter(Boolean) as JsonRecord[];
  if (items.length < 2) throw new Error(`Run ${runId} produced only ${items.length} RawArtifacts`);
  const kinds = new Set<string>();
  for (const item of items) {
    const artifact = record(item.artifact);
    const provenance = record(artifact?.provenance);
    const binaryHash = record(artifact?.binaryHash);
    const collector = record(artifact?.collector);
    if (!artifact || !provenance || !binaryHash || !collector) {
      throw new Error(`Run ${runId} contains incomplete governed artifact evidence`);
    }
    const sourceUri = requiredString(provenance.sourceUri, "artifact.provenance.sourceUri");
    const source = new URL(sourceUri);
    if (
      source.protocol !== "https:" ||
      (source.hostname !== "uspto.gov" && !source.hostname.endsWith(".uspto.gov"))
    ) {
      throw new Error(`Run ${runId} has unexpected provenance URI ${sourceUri}`);
    }
    const kind = requiredString(artifact.artifactKind, "artifact.artifactKind");
    const sha = requiredString(binaryHash.value, "artifact.binaryHash.value");
    if (binaryHash.algorithm !== "SHA-256" || !/^[a-f0-9]{64}$/.test(sha)) {
      throw new Error(`Run ${runId} has invalid SHA-256 evidence`);
    }
    if (collector.connectorId !== "crawl4ai-web" || collector.connectorVersion !== "1.2.0") {
      throw new Error(
        `Run ${runId} has unexpected collector ${String(collector.connectorId)}@${String(collector.connectorVersion)}`,
      );
    }
    kinds.add(kind);
  }
  for (const requiredKind of ["HTML", "MARKDOWN"]) {
    if (!kinds.has(requiredKind))
      throw new Error(`Run ${runId} is missing ${requiredKind} evidence`);
  }
  return { count: items.length, kinds: [...kinds].sort() };
}

async function main(): Promise<void> {
  const rawRunIds = process.argv.slice(2).find((value) => value !== "--") ?? "";
  const runIds = rawRunIds
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const workspaceId = process.env.MARKORBIT_COVERAGE_WORKSPACE_ID?.trim() || DEFAULT_WORKSPACE_ID;
  const timeoutMs = Number(process.env.MARKORBIT_COVERAGE_TIMEOUT_MS ?? "600000");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 1_200_000) {
    throw new Error("MARKORBIT_COVERAGE_TIMEOUT_MS must be 30000..1200000");
  }

  const registrationCount = await verifyRegistration(workspaceId);
  const verifiedRuns: Array<{ runId: string; artifactCount: number; artifactKinds: string[] }> = [];
  for (const runId of runIds) {
    const terminal = await waitForRun(runId, timeoutMs);
    const status = runStatus(terminal);
    if (status !== "COMPLETED") throw new Error(`Coverage run ${runId} ended as ${status}`);
    const artifacts = await verifyArtifacts(runId);
    verifiedRuns.push({ runId, artifactCount: artifacts.count, artifactKinds: artifacts.kinds });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        event: "source-coverage.verified",
        registrationCount,
        liveRunCount: verifiedRuns.length,
        runs: verifiedRuns,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
