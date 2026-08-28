import { randomBytes } from "node:crypto";

const CONVERTER = { converterId: "builtin-markdown-staging", version: "1.0.0" } as const;
const SOURCE_SLUG = "uspto-trademarks-golden-source";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function baseUrl(): string {
  return required("MARKORBIT_CONTROL_PLANE_URL").replace(/\/$/, "");
}

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function id(prefix: string): string {
  const timestamp = encodeBase32(BigInt(Date.now()), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

type Json = Record<string, unknown>;
function record(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}
function string(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Missing ${field}`);
  return value;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function json(path: string, init?: RequestInit): Promise<Json> {
  const response = await fetch(`${baseUrl()}${path}`, init);
  const body = (await response.json()) as Json;
  if (!response.ok) {
    const error = record(body.error);
    throw new Error(typeof error?.message === "string" ? error.message : `HTTP ${response.status}`);
  }
  return body;
}

async function ensureConverter(): Promise<void> {
  const listed = await json(`/api/converters?q=${CONVERTER.converterId}&limit=100`);
  const exists = array(listed.items).some((item) => {
    const manifest = record(record(item)?.manifest);
    return (
      manifest?.converterId === CONVERTER.converterId && manifest?.version === CONVERTER.version
    );
  });
  if (exists) return;
  await json("/api/converters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      converterId: CONVERTER.converterId,
      displayName: "Built-in Markdown Staging — Production",
      version: CONVERTER.version,
      runtime: "BUILT_IN",
      capabilities: ["CONVERT", "PRESERVE_LINKS"],
      inputs: { artifactKinds: ["MARKDOWN"], mimePatterns: ["text/markdown"] },
      outputFormat: "MARKDOWN",
      deterministic: true,
      configurationSchema: {},
      resourceHints: { maxInputBytes: 4_500_000, timeoutSeconds: 60 },
      status: "ACTIVE",
    }),
  });
}

async function workerContext(workerId: string): Promise<{ workspaceId: string }> {
  const body = await json(`/api/workers/${encodeURIComponent(workerId)}`);
  const view = record(body.view);
  const worker = record(view?.worker);
  return { workspaceId: string(worker?.workspaceId, "worker.workspaceId") };
}

async function sourceId(workspaceId: string): Promise<string> {
  const configured = process.env.MARKORBIT_SOURCE_ID?.trim();
  if (configured) return configured;

  const body = await json(
    `/api/sources?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(SOURCE_SLUG)}&limit=100`,
  );
  for (const item of array(body.items)) {
    const source = record(item);
    if (source?.slug === SOURCE_SLUG) return string(source.id, "source.id");
  }
  throw new Error(
    "USPTO Golden Source not found; run bootstrap:uspto first or set MARKORBIT_SOURCE_ID to an accepted Source",
  );
}

async function ensureProfile(
  workspaceId: string,
  source: string,
): Promise<{ id: string; targetPathTemplate: string }> {
  const body = await json(
    `/api/conversion-profiles?workspaceId=${encodeURIComponent(workspaceId)}&sourceId=${encodeURIComponent(source)}&converterId=${CONVERTER.converterId}&status=ACTIVE&limit=100`,
  );
  for (const item of array(body.items)) {
    const profile = record(item);
    const converter = record(profile?.converter);
    if (
      converter?.converterId === CONVERTER.converterId &&
      converter?.version === CONVERTER.version
    ) {
      return {
        id: string(profile?.id, "profile.id"),
        targetPathTemplate: string(profile?.targetPathTemplate, "profile.targetPathTemplate"),
      };
    }
  }
  const created = await json("/api/conversion-profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      sourceId: source,
      name: `USPTO Markdown → Verified Staging (${source})`,
      status: "ACTIVE",
      converter: CONVERTER,
      input: { artifactKinds: ["MARKDOWN"], mimePatterns: ["text/markdown"] },
      outputFormat: "MARKDOWN",
      targetPathTemplate: "sources/uspto/{artifactId}.md",
      configuration: {},
      precedence: 100,
      autoConvert: false,
    }),
  });
  const profile = record(created.profile);
  return {
    id: string(profile?.id, "profile.id"),
    targetPathTemplate: string(profile?.targetPathTemplate, "profile.targetPathTemplate"),
  };
}

async function ensureCapability(workerId: string, workspaceId: string): Promise<number> {
  const listed = await json(
    `/api/conversion-runtime/capabilities?workerId=${encodeURIComponent(workerId)}&workspaceId=${encodeURIComponent(workspaceId)}&active=true&limit=100`,
  );
  for (const item of array(listed.items)) {
    const capability = record(record(item)?.capability);
    const supported = array(capability?.supportedConverters).some((value) => {
      const support = record(value);
      return (
        support?.converterId === CONVERTER.converterId &&
        array(support?.versions).includes(CONVERTER.version)
      );
    });
    if (supported && typeof capability?.capabilityRevision === "number")
      return capability.capabilityRevision;
  }
  const revision = 1;
  await json("/api/conversion-runtime/capabilities", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contractVersion: "1.0",
      objectType: "CONVERSION_WORKER_CAPABILITY",
      id: id("cwc"),
      workerId,
      capabilityRevision: revision,
      supportedConverters: [{ converterId: CONVERTER.converterId, versions: [CONVERTER.version] }],
      acceptedArtifactKinds: ["MARKDOWN"],
      acceptedMimePatterns: ["text/markdown"],
      supportedOutputFormats: ["MARKDOWN"],
      runtime: { runtimeId: "markorbit-production-markdown-staging", version: "1.0.0" },
      createdAt: new Date().toISOString(),
    }),
  });
  return revision;
}

async function existingConversionRunId(
  workspaceId: string,
  artifactId: string,
): Promise<string | null> {
  const listed = await json(
    `/api/conversion-runs?workspaceId=${encodeURIComponent(workspaceId)}&rawArtifactId=${encodeURIComponent(artifactId)}&limit=100`,
  );
  const runs = array(listed.items)
    .map((item) => record(item))
    .filter((item): item is Json => Boolean(item))
    .filter((run) => run.status !== "FAILED" && run.status !== "CANCELLED")
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  return runs.length > 0 ? string(runs[0]?.id, "conversionRun.id") : null;
}

async function dispatchLatest(
  workspaceId: string,
  source: string,
  profile: { id: string; targetPathTemplate: string },
): Promise<string | null> {
  const listed = await json(
    `/api/artifacts?workspaceId=${encodeURIComponent(workspaceId)}&sourceId=${encodeURIComponent(source)}&artifactKind=MARKDOWN&mimeType=text%2Fmarkdown&limit=100`,
  );
  const artifacts = array(listed.items)
    .map((item) => record(record(item)?.artifact))
    .filter((item): item is Json => Boolean(item))
    .sort((left, right) => String(right.capturedAt).localeCompare(String(left.capturedAt)));
  const candidate = artifacts.find(
    (artifact) =>
      artifact.status === "REGISTERED" ||
      artifact.status === "DUPLICATE_CHECKED" ||
      artifact.status === "READY_FOR_CONVERSION",
  );
  if (!candidate) return null;
  const artifactId = string(candidate.id, "artifact.id");

  // Finalization can legitimately enqueue an AUTO_PROFILE run before this live smoke reaches
  // its manual dispatch step. Reuse that governed run instead of attempting to overwrite the
  // sticky conversion-profile authorization on the immutable RawArtifact.
  const existingRunId = await existingConversionRunId(workspaceId, artifactId);
  if (existingRunId) return existingRunId;

  const authorization = await json(
    `/api/raw-artifacts/${encodeURIComponent(artifactId)}/authorize-conversion`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    },
  );
  const authorized = record(authorization.result);
  const conversionProfileId = string(authorized?.conversionProfileId, "conversionProfileId");
  const dispatched = await json("/api/conversion-runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      rawArtifactId: artifactId,
      conversionProfileId,
      requestedOutput: { format: "MARKDOWN", targetPathTemplate: profile.targetPathTemplate },
      trigger: "MANUAL",
      actor: { type: "ADMIN", id: "bootstrap-uspto-conversion" },
      idempotencyKey: `uspto-conversion:${artifactId}:${CONVERTER.version}`,
    }),
  });
  const recordBody = record(dispatched.record);
  const run = record(recordBody?.run);
  return string(run?.id, "conversionRun.id");
}

async function main(): Promise<void> {
  const workerId = required("MARKORBIT_WORKER_ID");
  const { workspaceId } = await workerContext(workerId);
  const source = await sourceId(workspaceId);
  await ensureConverter();
  const profile = await ensureProfile(workspaceId, source);
  const capabilityRevision = await ensureCapability(workerId, workspaceId);
  const conversionRunId = process.argv.includes("--dispatch-latest")
    ? await dispatchLatest(workspaceId, source, profile)
    : null;
  process.stdout.write(
    `${JSON.stringify(
      {
        workspaceId,
        sourceId: source,
        workerId,
        converter: CONVERTER,
        conversionProfileId: profile.id,
        capabilityRevision,
        conversionRunId,
        workerEnvironment: {
          MARKORBIT_WORKSPACE_ID: workspaceId,
          MARKORBIT_CONVERSION_ENABLED: "1",
          MARKORBIT_CONVERSION_CAPABILITY_REVISION: String(capabilityRevision),
        },
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
