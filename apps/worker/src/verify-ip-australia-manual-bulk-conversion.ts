export {};

type Json = Record<string, unknown>;

const SHA256 = /^[a-f0-9]{64}$/;
const TERMINAL_FAILURES = new Set(["FAILED", "CANCELLED"]);
const EXPECTED_CONVERTER = { converterId: "builtin-html-markdown", version: "1.0.0" } as const;
const HTML_MIME_TYPES = new Set(["text/html", "application/xhtml+xml"]);

function record(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`IP Australia bulk conversion verifier missing ${field}`);
  }
  return value.trim();
}

function requiredPositiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return parsed;
}

function baseUrl(): string {
  const raw = process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() || "http://127.0.0.1:3000";
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MARKORBIT_CONTROL_PLANE_URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function expectedCount(): number {
  return requiredPositiveInteger(
    process.env.MARKORBIT_IP_AU_EXPECTED_COUNT ?? "577",
    "expected count",
  );
}

function timeoutMs(): number {
  const value = Number(process.env.MARKORBIT_IP_AU_CONVERSION_TIMEOUT_MS ?? "1800000");
  if (!Number.isSafeInteger(value) || value < 30_000 || value > 3_600_000) {
    throw new Error("MARKORBIT_IP_AU_CONVERSION_TIMEOUT_MS must be 30000..3600000");
  }
  return value;
}

function pollMs(): number {
  const value = Number(process.env.MARKORBIT_IP_AU_CONVERSION_POLL_MS ?? "3000");
  if (!Number.isSafeInteger(value) || value < 250 || value > 30_000) {
    throw new Error("MARKORBIT_IP_AU_CONVERSION_POLL_MS must be 250..30000");
  }
  return value;
}

async function getJson(path: string, init: RequestInit = {}): Promise<Json> {
  const response = await fetch(`${baseUrl()}${path}`, init);
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  const parsed = record(body);
  if (!parsed) throw new Error(`${path} did not return a JSON object`);
  return parsed;
}

function operatorServiceReadHeaders(workspaceId: string): Record<string, string> {
  const internalSecret = requiredString(
    process.env.MO_INTERNAL_SERVICE_SECRET,
    "MO_INTERNAL_SERVICE_SECRET",
  );
  const sessionId = requiredString(
    process.env.MARKORBIT_CALIBRATION_SESSION_ID,
    "MARKORBIT_CALIBRATION_SESSION_ID",
  );
  const userId = requiredString(
    process.env.MARKORBIT_CALIBRATION_USER_ID,
    "MARKORBIT_CALIBRATION_USER_ID",
  );
  const membershipId = requiredString(
    process.env.MARKORBIT_CALIBRATION_MEMBERSHIP_ID,
    "MARKORBIT_CALIBRATION_MEMBERSHIP_ID",
  );
  const principal = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId,
        userId,
        workspaceId,
        membershipId,
        role: "READ_ONLY",
        permissions: ["matter:read"],
        sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    }),
    "utf8",
  ).toString("base64url");
  return {
    "x-markorbit-internal-authorization": internalSecret,
    "x-markorbit-principal": principal,
  };
}

async function listConversionRuns(workspaceId: string, sourceId: string): Promise<Json[]> {
  const items: Json[] = [];
  const limit = 100;
  let offset = 0;
  let expectedTotal: number | null = null;

  while (expectedTotal === null || offset < expectedTotal) {
    const payload = await getJson(
      `/api/conversion-runs?workspaceId=${encodeURIComponent(workspaceId)}` +
        `&sourceId=${encodeURIComponent(sourceId)}&trigger=AUTO_PROFILE&limit=${limit}&offset=${offset}`,
    );
    const page = array(payload.items)
      .map(record)
      .filter((value): value is Json => Boolean(value));
    const total = Number(payload.total);
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error(`ConversionRun list returned invalid total: ${String(payload.total)}`);
    }
    if (expectedTotal !== null && expectedTotal !== total) {
      expectedTotal = total;
    } else if (expectedTotal === null) {
      expectedTotal = total;
    }
    items.push(...page);
    offset += page.length;
    if (page.length === 0 || items.length >= expectedTotal) break;
  }
  return items;
}

function summarizeStatuses(runs: Json[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const run of runs) {
    const status = String(run.status ?? "UNKNOWN");
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

async function waitForCompletedRuns(
  workspaceId: string,
  sourceId: string,
  expected: number,
  timeout: number,
): Promise<Json[]> {
  const started = Date.now();
  let lastStatus: Record<string, number> = {};

  while (Date.now() - started < timeout) {
    const runs = await listConversionRuns(workspaceId, sourceId);
    lastStatus = summarizeStatuses(runs);
    process.stdout.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "ip-australia-manual.bulk-conversion.poll",
        observedRuns: runs.length,
        expectedRuns: expected,
        statuses: lastStatus,
      })}\n`,
    );

    const failed = runs.filter((run) => TERMINAL_FAILURES.has(String(run.status)));
    if (failed.length > 0) {
      throw new Error(
        `Observed terminal conversion failures: ${JSON.stringify(
          failed.slice(0, 10).map((run) => ({
            id: run.id,
            status: run.status,
            rawArtifactId: run.rawArtifactId,
          })),
        )}`,
      );
    }
    if (runs.length > expected) {
      throw new Error(
        `Expected exactly ${expected} AUTO_PROFILE conversions, observed ${runs.length}`,
      );
    }
    if (runs.length === expected && runs.every((run) => run.status === "COMPLETED")) return runs;
    await new Promise((resolve) => setTimeout(resolve, pollMs()));
  }

  throw new Error(
    `IP Australia bulk conversion did not complete ${expected} runs before timeout; statuses=${JSON.stringify(lastStatus)}`,
  );
}

function verifyConversionRuns(runs: Json[], sourceId: string, expected: number): Set<string> {
  if (runs.length !== expected) {
    throw new Error(`Expected ${expected} completed conversion runs, got ${runs.length}`);
  }
  const artifactIds = new Set<string>();
  const runIds = new Set<string>();
  for (const run of runs) {
    const runId = requiredString(run.id, "conversionRun.id");
    const rawArtifactId = requiredString(run.rawArtifactId, "conversionRun.rawArtifactId");
    if (run.status !== "COMPLETED") {
      throw new Error(`ConversionRun ${runId} is ${String(run.status)}`);
    }
    if (run.sourceId !== sourceId) {
      throw new Error(`ConversionRun ${runId} escaped Source boundary`);
    }
    if (run.trigger !== "AUTO_PROFILE") {
      throw new Error(`ConversionRun ${runId} was not auto-profile dispatched`);
    }
    const converter = record(run.converter);
    if (
      converter?.converterId !== EXPECTED_CONVERTER.converterId ||
      converter?.version !== EXPECTED_CONVERTER.version
    ) {
      throw new Error(
        `ConversionRun ${runId} used unexpected converter: ${JSON.stringify(converter)}`,
      );
    }
    const input = record(run.input);
    const inputSha256 = requiredString(input?.sha256, "conversionRun.input.sha256");
    if (
      input?.artifactKind !== "HTML" ||
      !HTML_MIME_TYPES.has(String(input.mimeType)) ||
      !SHA256.test(inputSha256)
    ) {
      throw new Error(`ConversionRun ${runId} lost immutable HTML input evidence`);
    }
    const output = record(run.requestedOutput);
    if (output?.format !== "MARKDOWN") {
      throw new Error(
        `ConversionRun ${runId} requested unexpected output: ${JSON.stringify(output)}`,
      );
    }
    if (runIds.has(runId)) throw new Error(`Duplicate ConversionRun id ${runId}`);
    if (artifactIds.has(rawArtifactId)) {
      throw new Error(
        `RawArtifact ${rawArtifactId} received more than one AUTO_PROFILE conversion`,
      );
    }
    runIds.add(runId);
    artifactIds.add(rawArtifactId);
  }
  return artifactIds;
}

async function readyPackages(workspaceId: string): Promise<Json[]> {
  const payload = await getJson(
    `/api/ready-packages?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return array(payload.readyPackages)
    .map(record)
    .filter((value): value is Json => Boolean(value));
}

function verifyReadyPackages(
  packages: Json[],
  runs: Json[],
  sourceId: string,
  expected: number,
): Array<{ id: string; rawArtifactId: string; digest: string; stagingDocumentId: string }> {
  const runById = new Map(runs.map((run) => [requiredString(run.id, "conversionRun.id"), run]));
  const sourcePackages = packages.filter(
    (readyPackage) => record(readyPackage.evidence)?.sourceId === sourceId,
  );
  if (sourcePackages.length !== expected) {
    throw new Error(`Expected ${expected} ReadyPackages for Source, got ${sourcePackages.length}`);
  }

  const seenRuns = new Set<string>();
  const seenArtifacts = new Set<string>();
  return sourcePackages.map((readyPackage) => {
    const id = requiredString(readyPackage.id, "readyPackage.id");
    if (readyPackage.status !== "VERIFIED") {
      throw new Error(
        `ReadyPackage ${id} must remain VERIFIED, got ${String(readyPackage.status)}`,
      );
    }
    const evidence = record(readyPackage.evidence);
    if (!evidence) throw new Error(`ReadyPackage ${id} is missing evidence`);
    const conversionRunId = requiredString(
      evidence.conversionRunId,
      "readyPackage.evidence.conversionRunId",
    );
    const run = runById.get(conversionRunId);
    if (!run) {
      throw new Error(
        `ReadyPackage ${id} references an unexpected ConversionRun ${conversionRunId}`,
      );
    }
    const rawArtifactId = requiredString(run.rawArtifactId, "conversionRun.rawArtifactId");
    const artifactIds = array(evidence.artifactIds).filter(
      (value): value is string => typeof value === "string",
    );
    if (!artifactIds.includes(rawArtifactId)) {
      throw new Error(`ReadyPackage ${id} does not preserve RawArtifact ${rawArtifactId}`);
    }
    if (seenRuns.has(conversionRunId)) {
      throw new Error(`Duplicate ReadyPackage for ConversionRun ${conversionRunId}`);
    }
    if (seenArtifacts.has(rawArtifactId)) {
      throw new Error(`Duplicate ReadyPackage for RawArtifact ${rawArtifactId}`);
    }
    seenRuns.add(conversionRunId);
    seenArtifacts.add(rawArtifactId);

    for (const field of ["rawArtifactSha256", "stagingSha256", "digest"] as const) {
      const digest = requiredString(evidence[field], `readyPackage.evidence.${field}`);
      if (!SHA256.test(digest)) throw new Error(`ReadyPackage ${id} contains invalid ${field}`);
    }
    if (evidence.legalTruthVerified !== false) {
      throw new Error(`ReadyPackage ${id} must preserve legalTruthVerified=false`);
    }
    if (
      evidence.verificationOutcome !== "PASS" &&
      evidence.verificationOutcome !== "PASS_WITH_WARNINGS"
    ) {
      throw new Error(
        `ReadyPackage ${id} has unexpected verification outcome ${String(evidence.verificationOutcome)}`,
      );
    }
    const converter = record(evidence.converter);
    if (
      converter?.converterId !== EXPECTED_CONVERTER.converterId ||
      converter?.version !== EXPECTED_CONVERTER.version
    ) {
      throw new Error(`ReadyPackage ${id} converter evidence is not exact`);
    }

    return {
      id,
      rawArtifactId,
      digest: requiredString(evidence.digest, "readyPackage.evidence.digest"),
      stagingDocumentId: requiredString(
        evidence.stagingDocumentId,
        "readyPackage.evidence.stagingDocumentId",
      ),
    };
  });
}

async function verifyRetrieval(
  workspaceId: string,
  sourceId: string,
): Promise<Array<{ query: string; total: number }>> {
  const queries = (
    process.env.MARKORBIT_IP_AU_RETRIEVAL_QUERIES ?? "registration,examination,classification"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const outcomes: Array<{ query: string; total: number }> = [];
  for (const query of queries) {
    const payload = await getJson(
      `/api/retrieval/search?workspaceId=${encodeURIComponent(workspaceId)}` +
        `&sourceId=${encodeURIComponent(sourceId)}&q=${encodeURIComponent(query)}&limit=10`,
      { headers: operatorServiceReadHeaders(workspaceId) },
    );
    const total = Number(payload.total);
    const items = array(payload.items)
      .map(record)
      .filter((value): value is Json => Boolean(value));
    if (!Number.isSafeInteger(total) || total <= 0 || items.length === 0) {
      throw new Error(
        `Retrieval query ${JSON.stringify(query)} did not hit verified IP Australia content`,
      );
    }
    for (const item of items) {
      if (record(item.document)?.sourceId !== sourceId) {
        throw new Error(`Retrieval query ${JSON.stringify(query)} escaped Source boundary`);
      }
    }
    outcomes.push({ query, total });
  }
  return outcomes;
}

async function verifyCoreBoundary(
  workspaceId: string,
  packages: Array<{ id: string }>,
): Promise<number> {
  if (packages.length === 0) {
    throw new Error("No ReadyPackages available for Core boundary verification");
  }
  const indexes = [...new Set([0, Math.floor(packages.length / 2), packages.length - 1])];
  for (const index of indexes) {
    const readyPackage = packages[index];
    const payload = await getJson(
      `/api/ready-packages/${encodeURIComponent(readyPackage.id)}/core-intake?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    if (payload.readyPackageStatus !== "VERIFIED" || payload.transportStatus !== "NOT_SUBMITTED") {
      throw new Error(`ReadyPackage ${readyPackage.id} crossed the Core handoff boundary`);
    }
    if (payload.coreWorkspaceBinding !== null || payload.coreIntakeRequestPreview !== null) {
      throw new Error(
        `ReadyPackage ${readyPackage.id} unexpectedly acquired a Core workspace binding or preview`,
      );
    }
    if (payload.latestCoreIntakeSubmission !== null || payload.latestCoreIntakeReceipt !== null) {
      throw new Error(
        `ReadyPackage ${readyPackage.id} fabricated Core submission or receipt evidence`,
      );
    }
    if (
      array(payload.coreIntakeSubmissions).length !== 0 ||
      array(payload.coreIntakeReceipts).length !== 0 ||
      payload.contentTransportStatus !== "WAITING_FOR_INTAKE"
    ) {
      throw new Error(`ReadyPackage ${readyPackage.id} leaked state across the Core boundary`);
    }
  }
  return indexes.length;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((value) => value !== "--");
  const sourceId = requiredString(args[0] ?? process.env.MARKORBIT_IP_AU_SOURCE_ID, "sourceId");
  const workspaceId = requiredString(process.env.MARKORBIT_WORKSPACE_ID, "MARKORBIT_WORKSPACE_ID");
  const expected = expectedCount();
  const runs = await waitForCompletedRuns(workspaceId, sourceId, expected, timeoutMs());
  const artifactIds = verifyConversionRuns(runs, sourceId, expected);
  const verifiedPackages = verifyReadyPackages(
    await readyPackages(workspaceId),
    runs,
    sourceId,
    expected,
  );
  if (verifiedPackages.length !== artifactIds.size) {
    throw new Error("ReadyPackage coverage does not match converted RawArtifact coverage");
  }
  const retrieval = await verifyRetrieval(workspaceId, sourceId);
  const coreBoundarySamples = await verifyCoreBoundary(workspaceId, verifiedPackages);

  process.stdout.write(
    `${JSON.stringify(
      {
        event: "ip-australia-manual.bulk-conversion.verified",
        source: "IP Australia Trade Marks Manual",
        sourceId,
        expected,
        completedAutoProfileConversions: runs.length,
        uniqueRawArtifacts: artifactIds.size,
        verifiedReadyPackages: verifiedPackages.length,
        converter: EXPECTED_CONVERTER,
        retrieval,
        coreTransportStatus: "NOT_SUBMITTED",
        coreBoundarySamples,
        legalTruthVerified: false,
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