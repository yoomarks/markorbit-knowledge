import {
  parseCoverageTargets,
  parseRegistrations,
  type CoverageRegistration,
  type CoverageTarget,
} from "./source-coverage-bootstrap";

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

type ConverterSpec = {
  key: "MARKDOWN" | "PDF" | "RICH" | "IMAGE";
  converterId: string;
  version: string;
  displayName: string;
  runtime: "BUILT_IN" | "LOCAL_PROCESS";
  capabilities: string[];
  artifactKinds: string[];
  mimePatterns: string[];
  maxInputBytes: number;
  timeoutSeconds: number;
  precedence: number;
};

const RICH_MIME_BY_KIND: Record<string, string[]> = {
  DOCX: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  XLSX: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  CSV: ["text/csv", "application/csv"],
  JSON: ["application/json", "text/json"],
  XML: ["application/xml", "text/xml"],
  EMAIL: ["message/rfc822"],
  TEXT: ["text/plain"],
};

const CONVERTERS: ConverterSpec[] = [
  {
    key: "MARKDOWN",
    converterId: "builtin-markdown-staging",
    version: "1.0.0",
    displayName: "Built-in Markdown Staging — Production",
    runtime: "BUILT_IN",
    capabilities: ["CONVERT", "PRESERVE_LINKS"],
    artifactKinds: ["MARKDOWN"],
    mimePatterns: ["text/markdown"],
    maxInputBytes: 4_500_000,
    timeoutSeconds: 60,
    precedence: 1000,
  },
  {
    key: "PDF",
    converterId: "builtin-pdf-markdown",
    version: "1.0.0",
    displayName: "Built-in PDF to Markdown — Production",
    runtime: "BUILT_IN",
    capabilities: ["CONVERT", "PRESERVE_LINKS"],
    artifactKinds: ["PDF"],
    mimePatterns: ["application/pdf"],
    maxInputBytes: 12_000_000,
    timeoutSeconds: 60,
    precedence: 900,
  },
  {
    key: "RICH",
    converterId: "local-rich-document-markdown",
    version: "1.0.0",
    displayName: "Local Rich Document to Markdown — Production",
    runtime: "LOCAL_PROCESS",
    capabilities: ["CONVERT", "PRESERVE_LINKS", "PRESERVE_TABLES"],
    artifactKinds: ["DOCX", "XLSX", "CSV", "JSON", "XML", "EMAIL", "TEXT"],
    mimePatterns: [...new Set(Object.values(RICH_MIME_BY_KIND).flat())],
    maxInputBytes: 25_000_000,
    timeoutSeconds: 180,
    precedence: 800,
  },
  {
    key: "IMAGE",
    converterId: "local-ocr-markdown",
    version: "1.0.0",
    displayName: "Local OCR to Markdown — Production",
    runtime: "LOCAL_PROCESS",
    capabilities: ["CONVERT"],
    artifactKinds: ["PDF", "IMAGE"],
    mimePatterns: ["application/pdf", "image/*"],
    maxInputBytes: 25_000_000,
    timeoutSeconds: 180,
    precedence: 700,
  },
];

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${field}`);
  return value;
}

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

async function requestJson(
  fetchImpl: FetchLike,
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetchImpl(`${baseUrl}${path}`, init);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = record(record(body)?.error);
    const message = typeof error?.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(`${path}: ${message}`);
  }
  return body;
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
  const payload = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=US&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return {
    targets: parseCoverageTargets(payload),
    registrations: parseRegistrations(payload),
  };
}

async function ensureManifest(
  fetchImpl: FetchLike,
  baseUrl: string,
  spec: ConverterSpec,
): Promise<"CREATED" | "REUSED"> {
  const listed = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/converters?q=${encodeURIComponent(spec.converterId)}&limit=100`,
  );
  for (const item of array(record(listed)?.items)) {
    const manifest = record(record(item)?.manifest);
    if (manifest?.converterId !== spec.converterId || manifest.version !== spec.version) continue;
    if (manifest.status !== "ACTIVE") {
      throw new Error(`Converter ${spec.converterId}@${spec.version} exists but is not ACTIVE`);
    }
    return "REUSED";
  }
  await requestJson(
    fetchImpl,
    baseUrl,
    "/api/converters",
    jsonPost({
      converterId: spec.converterId,
      displayName: spec.displayName,
      version: spec.version,
      runtime: spec.runtime,
      capabilities: spec.capabilities,
      inputs: { artifactKinds: spec.artifactKinds, mimePatterns: spec.mimePatterns },
      outputFormat: "MARKDOWN",
      deterministic: true,
      configurationSchema: {},
      resourceHints: { maxInputBytes: spec.maxInputBytes, timeoutSeconds: spec.timeoutSeconds },
      status: "ACTIVE",
    }),
  );
  return "CREATED";
}

function sourceIdForTarget(
  target: CoverageTarget,
  registrations: Map<string, CoverageRegistration>,
): string {
  const registration = registrations.get(target.id);
  if (!registration || registration.state !== "REGISTERED") {
    throw new Error(`Foundational target ${target.id} is not registered`);
  }
  return requiredString(registration.sourceIds[0], `${target.id}.sourceId`);
}

function profileInput(target: CoverageTarget, spec: ConverterSpec): JsonRecord | null {
  if (spec.key === "MARKDOWN") {
    return { artifactKinds: ["MARKDOWN"], mimePatterns: ["text/markdown"] };
  }
  if (!target.acquisition.fetchAttachmentsHint) return null;
  const expected = new Set(target.acquisition.expectedArtifactKinds);
  if (spec.key === "PDF") {
    return expected.has("PDF")
      ? { artifactKinds: ["PDF"], mimePatterns: ["application/pdf"] }
      : null;
  }
  if (spec.key === "IMAGE") {
    return expected.has("IMAGE") ? { artifactKinds: ["IMAGE"], mimePatterns: ["image/*"] } : null;
  }
  const artifactKinds = spec.artifactKinds.filter((kind) => expected.has(kind));
  if (artifactKinds.length === 0) return null;
  const mimePatterns = [...new Set(artifactKinds.flatMap((kind) => RICH_MIME_BY_KIND[kind] ?? []))];
  return { artifactKinds, mimePatterns };
}

function profileName(targetId: string, key: ConverterSpec["key"]): string {
  return `Auto Normalize ${targetId} ${key}`;
}

async function ensureProfile(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  sourceId: string,
  target: CoverageTarget,
  spec: ConverterSpec,
  input: JsonRecord,
): Promise<{ profileId: string; state: "CREATED" | "REUSED" }> {
  const listed = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/conversion-profiles?workspaceId=${encodeURIComponent(workspaceId)}&sourceId=${encodeURIComponent(sourceId)}&converterId=${encodeURIComponent(spec.converterId)}&status=ACTIVE&limit=100`,
  );
  const name = profileName(target.id, spec.key);
  for (const item of array(record(listed)?.items)) {
    const profile = record(item);
    const converter = record(profile?.converter);
    if (profile?.name !== name) continue;
    if (
      converter?.converterId !== spec.converterId ||
      converter.version !== spec.version ||
      profile.autoConvert !== true ||
      profile.outputFormat !== "MARKDOWN"
    ) {
      throw new Error(`Existing profile ${name} does not satisfy the automatic supply contract`);
    }
    return { profileId: requiredString(profile.id, "profile.id"), state: "REUSED" };
  }

  const created = await requestJson(
    fetchImpl,
    baseUrl,
    "/api/conversion-profiles",
    jsonPost({
      workspaceId,
      sourceId,
      name,
      status: "ACTIVE",
      converter: { converterId: spec.converterId, version: spec.version },
      input,
      outputFormat: "MARKDOWN",
      targetPathTemplate: "sources/uspto/{artifactId}.md",
      configuration: {},
      precedence: spec.precedence,
      autoConvert: true,
    }),
  );
  const profile = record(record(created)?.profile);
  return { profileId: requiredString(profile?.id, "profile.id"), state: "CREATED" };
}

export type PrepareUsFoundationalAutoConversionOptions = {
  baseUrl: string;
  workspaceId: string;
  fetchImpl?: FetchLike;
};

export async function prepareUsFoundationalAutoConversion(
  options: PrepareUsFoundationalAutoConversionOptions,
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const coverage = await loadCoverage(fetchImpl, baseUrl, options.workspaceId);
  if (coverage.targets.length === 0) {
    throw new Error("No active US FOUNDATIONAL coverage targets found");
  }
  const registrations = new Map(coverage.registrations.map((value) => [value.targetId, value]));

  const manifests: Array<{ converterId: string; version: string; state: "CREATED" | "REUSED" }> =
    [];
  for (const spec of CONVERTERS) {
    manifests.push({
      converterId: spec.converterId,
      version: spec.version,
      state: await ensureManifest(fetchImpl, baseUrl, spec),
    });
  }

  const profiles: Array<{
    targetId: string;
    sourceId: string;
    converterId: string;
    profileId: string;
    state: "CREATED" | "REUSED";
  }> = [];
  for (const target of coverage.targets) {
    const sourceId = sourceIdForTarget(target, registrations);
    for (const spec of CONVERTERS) {
      const input = profileInput(target, spec);
      if (!input) continue;
      const profile = await ensureProfile(
        fetchImpl,
        baseUrl,
        options.workspaceId,
        sourceId,
        target,
        spec,
        input,
      );
      profiles.push({
        targetId: target.id,
        sourceId,
        converterId: spec.converterId,
        profileId: profile.profileId,
        state: profile.state,
      });
    }
  }

  return {
    workspaceId: options.workspaceId,
    targetCount: coverage.targets.length,
    manifestCount: manifests.length,
    profileCount: profiles.length,
    manifests,
    profiles,
    automaticPolicy: {
      pages: "MARKDOWN_ONLY",
      html: "RAW_EVIDENCE_ONLY",
      pdf: "TEXT_LAYER_ONLY_NO_OCR_FALLBACK",
      scannedPdf: "EXPLICIT_OCR_REQUIRED",
    },
  };
}
