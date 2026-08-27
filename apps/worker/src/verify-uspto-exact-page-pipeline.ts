export {};

type Json = Record<string, unknown>;

const TERMINAL_CONVERSION = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const SHA256 = /^[a-f0-9]{64}$/;

function record(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Exact-page pipeline missing ${field}`);
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

function timeoutMs(): number {
  const value = Number(process.env.MARKORBIT_GOLDEN_PIPELINE_TIMEOUT_MS ?? "300000");
  if (!Number.isSafeInteger(value) || value < 30_000 || value > 900_000) {
    throw new Error("MARKORBIT_GOLDEN_PIPELINE_TIMEOUT_MS must be 30000..900000");
  }
  return value;
}

async function getJson(path: string): Promise<Json> {
  const response = await fetch(`${baseUrl()}${path}`);
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  const parsed = record(body);
  if (!parsed) throw new Error(`${path} did not return a JSON object`);
  return parsed;
}

async function waitForConversion(
  conversionRunId: string,
  workspaceId: string,
  timeout: number,
): Promise<Json> {
  const started = Date.now();
  let last = "UNKNOWN";
  while (Date.now() - started < timeout) {
    const payload = await getJson(
      `/api/conversion-runs/${encodeURIComponent(conversionRunId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    const run = record(payload.run);
    last = requiredString(run?.status, "conversionRun.status");
    process.stdout.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), event: "exact-page-pipeline.conversion.poll", conversionRunId, status: last })}\n`,
    );
    if (TERMINAL_CONVERSION.has(last)) return payload;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`ConversionRun ${conversionRunId} did not finish; last=${last}`);
}

async function waitForReadyPackage(
  conversionRunId: string,
  workspaceId: string,
  timeout: number,
): Promise<Json> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const payload = await getJson(
      `/api/ready-packages?workspaceId=${encodeURIComponent(workspaceId)}&conversionRunId=${encodeURIComponent(conversionRunId)}`,
    );
    const readyPackage = record(payload.readyPackage);
    if (readyPackage) return readyPackage;
    process.stdout.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), event: "exact-page-pipeline.package.poll", conversionRunId, status: "PENDING" })}\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`ReadyPackage for ConversionRun ${conversionRunId} was not produced`);
}

function verifyConversion(
  payload: Json,
  sourceId: string,
): { rawArtifactId: string; events: string[] } {
  const run = record(payload.run);
  if (!run) throw new Error("Conversion response is missing run");
  if (run.status !== "COMPLETED") {
    throw new Error(`ConversionRun ended as ${String(run.status)}: ${JSON.stringify(payload)}`);
  }
  if (run.sourceId !== sourceId) {
    throw new Error("ConversionRun escaped the exact accepted Source boundary");
  }
  const converter = record(run.converter);
  if (converter?.converterId !== "builtin-markdown-staging" || converter?.version !== "1.0.0") {
    throw new Error(`Unexpected converter: ${JSON.stringify(converter)}`);
  }
  const requestedOutput = record(run.requestedOutput);
  if (requestedOutput?.format !== "MARKDOWN") {
    throw new Error(`Unexpected conversion output: ${JSON.stringify(requestedOutput)}`);
  }
  const rawArtifactId = requiredString(run.rawArtifactId, "conversionRun.rawArtifactId");
  const events = array(payload.events)
    .map(record)
    .filter((value): value is Json => Boolean(value))
    .map((event) => requiredString(event.eventType, "conversion event type"));
  for (const required of ["CREATED", "STARTED", "VERIFICATION_STARTED", "COMPLETED"]) {
    if (!events.includes(required)) {
      throw new Error(`Conversion evidence is missing ${required}`);
    }
  }
  return { rawArtifactId, events };
}

function verifyReadyPackage(
  readyPackage: Json,
  sourceId: string,
  conversionRunId: string,
  rawArtifactId: string,
): { readyPackageId: string; digest: string; stagingDocumentId: string } {
  const readyPackageId = requiredString(readyPackage.id, "readyPackage.id");
  if (readyPackage.status !== "VERIFIED") {
    throw new Error(`ReadyPackage must be VERIFIED: ${String(readyPackage.status)}`);
  }
  const evidence = record(readyPackage.evidence);
  if (!evidence) throw new Error("ReadyPackage is missing evidence");
  if (evidence.sourceId !== sourceId || evidence.conversionRunId !== conversionRunId) {
    throw new Error("ReadyPackage does not preserve Source/ConversionRun continuity");
  }
  const artifactIds = array(evidence.artifactIds).filter(
    (value): value is string => typeof value === "string",
  );
  if (!artifactIds.includes(rawArtifactId)) {
    throw new Error("ReadyPackage does not reference the converted RawArtifact");
  }
  const rawArtifactSha256 = requiredString(evidence.rawArtifactSha256, "rawArtifactSha256");
  const stagingSha256 = requiredString(evidence.stagingSha256, "stagingSha256");
  const digest = requiredString(evidence.digest, "readyPackage.digest");
  if (!SHA256.test(rawArtifactSha256) || !SHA256.test(stagingSha256) || !SHA256.test(digest)) {
    throw new Error("ReadyPackage contains invalid SHA-256 evidence");
  }
  if (evidence.legalTruthVerified !== false) {
    throw new Error("ReadyPackage must preserve legalTruthVerified=false");
  }
  if (
    evidence.verificationOutcome !== "PASS" &&
    evidence.verificationOutcome !== "PASS_WITH_WARNINGS"
  ) {
    throw new Error(`Unexpected verification outcome: ${String(evidence.verificationOutcome)}`);
  }
  const converter = record(evidence.converter);
  if (converter?.converterId !== "builtin-markdown-staging" || converter?.version !== "1.0.0") {
    throw new Error("ReadyPackage converter evidence is not exact");
  }
  return {
    readyPackageId,
    digest,
    stagingDocumentId: requiredString(evidence.stagingDocumentId, "stagingDocumentId"),
  };
}

async function verifyCoreBoundary(
  readyPackageId: string,
  workspaceId: string,
  digest: string,
  stagingDocumentId: string,
  rawArtifactId: string,
): Promise<void> {
  const payload = await getJson(
    `/api/ready-packages/${encodeURIComponent(readyPackageId)}/core-intake?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  if (payload.readyPackageStatus !== "VERIFIED" || payload.transportStatus !== "NOT_SUBMITTED") {
    throw new Error(`Knowledge crossed the Core handoff boundary: ${JSON.stringify(payload)}`);
  }
  if (
    payload.latestCoreIntakeSubmission !== null ||
    payload.latestCoreIntakeReceipt !== null ||
    array(payload.coreIntakeSubmissions).length !== 0 ||
    array(payload.coreIntakeReceipts).length !== 0
  ) {
    throw new Error("Knowledge recorded Core submission evidence without an explicit handoff");
  }

  const binding = record(payload.coreWorkspaceBinding);
  const preview = record(payload.coreIntakeRequestPreview);
  if (binding && !preview) {
    throw new Error("Bound Core workspace is missing the read-only Core Intake preview");
  }
  if (preview) {
    if (
      preview.readyPackageId !== readyPackageId ||
      preview.workspaceId !== workspaceId ||
      preview.digest !== digest
    ) {
      throw new Error("Core Intake preview does not preserve ReadyPackage identity/digest");
    }
    const evidence = record(preview.evidence);
    const artifactIds = array(evidence?.artifactIds).filter(
      (value): value is string => typeof value === "string",
    );
    if (!artifactIds.includes(rawArtifactId) || evidence?.stagingDocumentId !== stagingDocumentId) {
      throw new Error("Core Intake preview does not preserve acquisition/Staging evidence");
    }
  }
  if ("intakeId" in payload || "coreIntakeResult" in payload) {
    throw new Error("Knowledge must not fabricate a Core acceptance result");
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((value) => value !== "--");
  const sourceId = requiredString(args[0], "sourceId argument");
  const conversionRunId = requiredString(args[1], "conversionRunId argument");
  const workspaceId = requiredString(process.env.MARKORBIT_WORKSPACE_ID, "MARKORBIT_WORKSPACE_ID");
  const timeout = timeoutMs();

  const conversionPayload = await waitForConversion(conversionRunId, workspaceId, timeout);
  const conversion = verifyConversion(conversionPayload, sourceId);
  const readyPackage = await waitForReadyPackage(conversionRunId, workspaceId, timeout);
  const packageEvidence = verifyReadyPackage(
    readyPackage,
    sourceId,
    conversionRunId,
    conversion.rawArtifactId,
  );
  await verifyCoreBoundary(
    packageEvidence.readyPackageId,
    workspaceId,
    packageEvidence.digest,
    packageEvidence.stagingDocumentId,
    conversion.rawArtifactId,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        event: "exact-page-pipeline.verified",
        source: "USPTO",
        sourceId,
        conversionRunId,
        rawArtifactId: conversion.rawArtifactId,
        readyPackageId: packageEvidence.readyPackageId,
        readyPackageDigest: packageEvidence.digest,
        conversionEvents: conversion.events,
        sourceGraphRequired: false,
        coreTransportStatus: "NOT_SUBMITTED",
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
