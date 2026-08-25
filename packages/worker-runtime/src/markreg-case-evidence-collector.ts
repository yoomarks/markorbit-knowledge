import { createHash } from "node:crypto";
import {
  CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
  CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
  CASE_EVIDENCE_SOURCE_SYSTEM,
  isCaseCandidateV1,
  type CaseCandidateIntakeV1,
  type CaseCandidateV1,
  type CaseDocumentPackageEvidenceV1,
  type CaseEvidenceCollectionV1,
  type CaseEvidenceSurfaceOmissionV1,
  type ExactCaseSourcePayloadV1,
} from "@markorbit/contracts";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class CaseEvidenceCollectionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CaseEvidenceCollectionError";
  }
}

export type ResolvedMarkRegCaseSourceAccess = {
  baseUrl: string;
  workspaceId: string;
  internalAuthorization: string;
  internalPrincipal: string;
};

export interface AuthorizedMarkRegCaseSourceResolver {
  resolve(candidate: Readonly<CaseCandidateV1>): Promise<ResolvedMarkRegCaseSourceAccess>;
}

export type MarkRegCaseSourceTransportRequest = {
  url: string;
  headers: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxResponseBytes: number;
};

export type MarkRegCaseSourceTransportResponse = {
  status: number;
  body: Uint8Array;
};

export type MarkRegCaseSourceTransport = (
  request: MarkRegCaseSourceTransportRequest,
) => Promise<MarkRegCaseSourceTransportResponse>;

export interface CaseEvidenceCollectionSink {
  saveCollection(
    value: CaseEvidenceCollectionV1,
  ):
    | { collection: CaseEvidenceCollectionV1; replayed: boolean }
    | Promise<{ collection: CaseEvidenceCollectionV1; replayed: boolean }>;
}

export interface CaseCandidateCollectionStateSink {
  recordSourceUnavailable(
    candidateId: string,
    input: { code: string; message: string; observedAt?: string },
  ): CaseCandidateIntakeV1 | Promise<CaseCandidateIntakeV1>;
  recordCollectionComplete(
    candidateId: string,
    collectionRef: string,
    collectedAt?: string,
  ): CaseCandidateIntakeV1 | Promise<CaseCandidateIntakeV1>;
}

export type MarkRegCaseEvidenceCollectorOptions = {
  resolver: AuthorizedMarkRegCaseSourceResolver;
  evidenceSink: CaseEvidenceCollectionSink;
  stateSink: CaseCandidateCollectionStateSink;
  transport?: MarkRegCaseSourceTransport;
  timeoutMs?: number;
  maxResponseBytes?: number;
  now?: () => Date;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function exactPayload(sourceRef: string, bytes: Uint8Array): ExactCaseSourcePayloadV1 {
  return {
    sourceRef,
    mediaType: "application/json",
    sha256: sha256(bytes),
    sizeBytes: bytes.byteLength,
    dataBase64: Buffer.from(bytes).toString("base64"),
  };
}

function parseJson(bytes: Uint8Array, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new CaseEvidenceCollectionError(
      "MARKREG_RESPONSE_INVALID",
      `${label} returned invalid JSON`,
      false,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_RESPONSE_INVALID",
      `${label} response must be a JSON object`,
      false,
    );
  }
  return parsed as Record<string, unknown>;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sameVersion(left: unknown, right: number): boolean {
  return String(left) === String(right);
}

async function defaultTransport(
  request: MarkRegCaseSourceTransportRequest,
): Promise<MarkRegCaseSourceTransportResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: "GET",
      headers: request.headers,
      signal: controller.signal,
      redirect: "error",
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > request.maxResponseBytes) {
          await reader.cancel();
          throw new CaseEvidenceCollectionError(
            "MARKREG_RESPONSE_TOO_LARGE",
            "MarkReg response exceeded the configured byte limit",
            false,
            response.status,
          );
        }
        chunks.push(result.value);
      }
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof CaseEvidenceCollectionError) throw error;
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new CaseEvidenceCollectionError(
      timedOut ? "MARKREG_TIMEOUT" : "MARKREG_NETWORK_ERROR",
      timedOut ? "MarkReg request timed out" : "MarkReg request failed",
      true,
      undefined,
      error instanceof Error ? { cause: error } : undefined,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function boundedTimeout(value: number | undefined): number {
  const resolved = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(resolved) || resolved < 1_000 || resolved > 300_000) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_TIMEOUT_INVALID",
      "MarkReg timeout must be between 1000 and 300000 milliseconds",
      false,
    );
  }
  return resolved;
}

function boundedResponseBytes(value: number | undefined): number {
  const resolved = value ?? DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isSafeInteger(resolved) || resolved < 1_024 || resolved > 64 * 1024 * 1024) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_RESPONSE_LIMIT_INVALID",
      "MarkReg response byte limit must be between 1024 and 67108864 bytes",
      false,
    );
  }
  return resolved;
}

function baseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_ACCESS_INVALID",
      "Resolved MarkReg base URL is invalid",
      false,
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password
  ) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_ACCESS_INVALID",
      "Resolved MarkReg base URL must be an HTTP(S) service URL without embedded credentials",
      false,
    );
  }
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  return parsed.toString().replace(/\/$/u, "");
}

function validateAccess(
  candidate: CaseCandidateV1,
  access: ResolvedMarkRegCaseSourceAccess,
): ResolvedMarkRegCaseSourceAccess & { baseUrl: string } {
  if (
    !nonEmpty(access.workspaceId) ||
    !nonEmpty(access.internalAuthorization) ||
    !nonEmpty(access.internalPrincipal)
  ) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_ACCESS_INVALID",
      "Resolved MarkReg access is incomplete",
      false,
    );
  }
  if (access.workspaceId !== candidate.accessScope.sourceWorkspaceId) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_WORKSPACE_MISMATCH",
      "Resolved MarkReg Workspace does not match the Case Candidate",
      false,
    );
  }
  return { ...access, baseUrl: baseUrl(access.baseUrl) };
}

function sourceHeaders(access: ResolvedMarkRegCaseSourceAccess): Record<string, string> {
  return {
    accept: "application/json",
    "x-markorbit-internal-authorization": access.internalAuthorization,
    "x-markorbit-principal": access.internalPrincipal,
    "x-markorbit-workspace-id": access.workspaceId,
  };
}

function requiredStatus(status: number, label: string): void {
  if (status >= 200 && status < 300) return;
  if (status >= 500) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_TEMPORARY_FAILURE",
      `${label} returned HTTP ${status}`,
      true,
      status,
    );
  }
  throw new CaseEvidenceCollectionError(
    status === 401 || status === 403
      ? "MARKREG_SOURCE_NOT_AUTHORIZED"
      : status === 404
        ? "MARKREG_SOURCE_NOT_FOUND"
        : "MARKREG_SOURCE_REJECTED",
    `${label} returned HTTP ${status}`,
    false,
    status,
  );
}

function optionalDisposition(
  status: number,
  surface: CaseEvidenceSurfaceOmissionV1["surface"],
): CaseEvidenceSurfaceOmissionV1 | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) return { surface, reason: "NOT_AUTHORIZED" };
  if (status === 404) return { surface, reason: "NOT_AVAILABLE" };
  if (status >= 500) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_TEMPORARY_FAILURE",
      `${surface} returned HTTP ${status}`,
      true,
      status,
    );
  }
  throw new CaseEvidenceCollectionError(
    "MARKREG_SOURCE_REJECTED",
    `${surface} returned HTTP ${status}`,
    false,
    status,
  );
}

function verifyFormalMatter(response: Record<string, unknown>, candidate: CaseCandidateV1): void {
  const matter = object(response.formalMatter);
  if (
    !matter ||
    matter.formalMatterId !== candidate.sourceMatterId ||
    matter.workspaceId !== candidate.accessScope.sourceWorkspaceId ||
    !sameVersion(matter.version, candidate.sourceMatterVersion) ||
    matter.snapshotSha256 !== candidate.sourceSnapshotSha256
  ) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_IDENTITY_MISMATCH",
      "MarkReg Formal Matter response does not match the frozen Case Candidate identity",
      false,
    );
  }
}

function verifyLifecycleReference(value: unknown, candidate: CaseCandidateV1, label: string): void {
  const item = object(value);
  if (!item) return;
  const formalMatter = object(item.formalMatter);
  if (
    item.workspaceId !== candidate.accessScope.sourceWorkspaceId ||
    !formalMatter ||
    formalMatter.id !== candidate.sourceMatterId ||
    !sameVersion(formalMatter.version, candidate.sourceMatterVersion) ||
    ("officialStatusVerified" in item && item.officialStatusVerified !== false)
  ) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_IDENTITY_MISMATCH",
      `${label} does not match the frozen Case Candidate identity`,
      false,
    );
  }
}

function verifyLifecycle(response: Record<string, unknown>, candidate: CaseCandidateV1): void {
  if (!("currentView" in response) || !Array.isArray(response.events)) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_RESPONSE_INVALID",
      "Lifecycle provenance response is missing currentView/events",
      false,
    );
  }
  if (response.currentView !== null) {
    verifyLifecycleReference(response.currentView, candidate, "Lifecycle current view");
  }
  for (const event of response.events) {
    verifyLifecycleReference(event, candidate, "Lifecycle event");
  }
}

function matchingDocumentPackages(
  response: Record<string, unknown>,
  candidate: CaseCandidateV1,
): Record<string, unknown>[] {
  if (!Array.isArray(response.documentPackages)) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_RESPONSE_INVALID",
      "Document Package list response is missing documentPackages",
      false,
    );
  }
  return response.documentPackages
    .map(object)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter(
      (item) =>
        item.formalMatterId === candidate.sourceMatterId &&
        sameVersion(item.sourceFormalMatterVersion, candidate.sourceMatterVersion) &&
        item.sourceFormalMatterHash === candidate.sourceSnapshotSha256 &&
        nonEmpty(item.documentPackageId),
    )
    .sort((left, right) =>
      String(left.documentPackageId).localeCompare(String(right.documentPackageId)),
    );
}

function verifyDocumentPackage(
  item: Record<string, unknown>,
  candidate: CaseCandidateV1,
  expectedId: string,
): void {
  if (
    item.documentPackageId !== expectedId ||
    item.workspaceId !== candidate.accessScope.sourceWorkspaceId ||
    item.formalMatterId !== candidate.sourceMatterId ||
    !sameVersion(item.sourceFormalMatterVersion, candidate.sourceMatterVersion) ||
    item.sourceFormalMatterHash !== candidate.sourceSnapshotSha256
  ) {
    throw new CaseEvidenceCollectionError(
      "MARKREG_SOURCE_IDENTITY_MISMATCH",
      `Document Package ${expectedId} does not match the frozen Case Candidate identity`,
      false,
    );
  }
}

function deterministicCollectionId(
  candidate: CaseCandidateV1,
  formalMatter: ExactCaseSourcePayloadV1,
  lifecycleProvenance: ExactCaseSourcePayloadV1 | undefined,
  documentPackages: CaseDocumentPackageEvidenceV1[],
  omissions: CaseEvidenceSurfaceOmissionV1[],
): string {
  const identity = canonical({
    candidateId: candidate.candidateId,
    sourceMatterId: candidate.sourceMatterId,
    sourceMatterVersion: candidate.sourceMatterVersion,
    sourceSnapshotSha256: candidate.sourceSnapshotSha256,
    formalMatter: formalMatter.sha256,
    lifecycleProvenance: lifecycleProvenance?.sha256,
    documentPackages: documentPackages.map((item) => [item.documentPackageId, item.payload.sha256]),
    omissions: [...omissions].sort((left, right) => left.surface.localeCompare(right.surface)),
  });
  return `case-evidence_${sha256(identity).slice(0, 32)}`;
}

export class MarkRegCaseEvidenceCollector {
  private readonly resolver: AuthorizedMarkRegCaseSourceResolver;
  private readonly evidenceSink: CaseEvidenceCollectionSink;
  private readonly stateSink: CaseCandidateCollectionStateSink;
  private readonly transport: MarkRegCaseSourceTransport;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly now: () => Date;

  constructor(options: MarkRegCaseEvidenceCollectorOptions) {
    this.resolver = options.resolver;
    this.evidenceSink = options.evidenceSink;
    this.stateSink = options.stateSink;
    this.transport = options.transport ?? defaultTransport;
    this.timeoutMs = boundedTimeout(options.timeoutMs);
    this.maxResponseBytes = boundedResponseBytes(options.maxResponseBytes);
    this.now = options.now ?? (() => new Date());
  }

  async collect(candidate: CaseCandidateV1): Promise<CaseEvidenceCollectionV1> {
    if (!isCaseCandidateV1(candidate)) {
      throw new CaseEvidenceCollectionError(
        "CASE_CANDIDATE_INVALID",
        "Case Candidate is invalid",
        false,
      );
    }
    try {
      return await this.collectResolved(candidate);
    } catch (error) {
      if (error instanceof CaseEvidenceCollectionError && error.retryable) {
        const observedAt = this.now().toISOString();
        await this.stateSink.recordSourceUnavailable(candidate.candidateId, {
          code: error.code,
          message: error.message,
          observedAt,
        });
      }
      throw error;
    }
  }

  private async collectResolved(candidate: CaseCandidateV1): Promise<CaseEvidenceCollectionV1> {
    let access: ResolvedMarkRegCaseSourceAccess;
    try {
      access = validateAccess(candidate, await this.resolver.resolve(candidate));
    } catch (error) {
      if (error instanceof CaseEvidenceCollectionError) throw error;
      throw new CaseEvidenceCollectionError(
        "MARKREG_SOURCE_RESOLUTION_FAILED",
        "Authorized MarkReg source access could not be resolved",
        false,
        undefined,
        error instanceof Error ? { cause: error } : undefined,
      );
    }

    const headers = sourceHeaders(access);
    const matterPath = `/v1/formal-matters/${encodeURIComponent(candidate.sourceMatterId)}`;
    const matterResponse = await this.get(access.baseUrl, matterPath, headers);
    requiredStatus(matterResponse.status, "Formal Matter");
    const matterJson = parseJson(matterResponse.body, "Formal Matter");
    verifyFormalMatter(matterJson, candidate);
    const formalMatter = exactPayload(`markreg:${matterPath}`, matterResponse.body);

    const omissions: CaseEvidenceSurfaceOmissionV1[] = [];
    const lifecycleProvenance = await this.collectLifecycle(
      candidate,
      access.baseUrl,
      headers,
      omissions,
    );
    const documentPackages = await this.collectDocumentPackages(
      candidate,
      access.baseUrl,
      headers,
      omissions,
    );

    const collectedAt = this.now().toISOString();
    const collection: CaseEvidenceCollectionV1 = {
      protocolVersion: CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
      objectType: CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
      collectionId: deterministicCollectionId(
        candidate,
        formalMatter,
        lifecycleProvenance,
        documentPackages,
        omissions,
      ),
      candidateId: candidate.candidateId,
      sourceSystem: CASE_EVIDENCE_SOURCE_SYSTEM,
      sourceMatter: {
        sourceMatterId: candidate.sourceMatterId,
        sourceMatterVersion: candidate.sourceMatterVersion,
        sourceSnapshotSha256: candidate.sourceSnapshotSha256,
        sourceRetrievalRef: candidate.sourceRetrievalRef,
        sourceWorkspaceId: candidate.accessScope.sourceWorkspaceId,
      },
      formalMatter,
      ...(lifecycleProvenance ? { lifecycleProvenance } : {}),
      documentPackages,
      omissions,
      collectedAt,
      provenance: {
        sourceFamily: "CASE",
        originalSystem: "MARKREG",
        originalSystemAuthoritative: true,
        knowledgeSnapshotIsSystemOfRecord: false,
      },
    };

    const saved = await this.evidenceSink.saveCollection(collection);
    await this.stateSink.recordCollectionComplete(
      candidate.candidateId,
      saved.collection.collectionId,
      saved.collection.collectedAt,
    );
    return saved.collection;
  }

  private async collectLifecycle(
    candidate: CaseCandidateV1,
    root: string,
    headers: Record<string, string>,
    omissions: CaseEvidenceSurfaceOmissionV1[],
  ): Promise<ExactCaseSourcePayloadV1 | undefined> {
    const path = `/v1/operations/formal-matters/${encodeURIComponent(candidate.sourceMatterId)}/lifecycle-provenance`;
    const response = await this.get(root, path, headers);
    const omitted = optionalDisposition(response.status, "LIFECYCLE_PROVENANCE");
    if (omitted) {
      omissions.push(omitted);
      return undefined;
    }
    const json = parseJson(response.body, "Lifecycle provenance");
    verifyLifecycle(json, candidate);
    return exactPayload(`markreg:${path}`, response.body);
  }

  private async collectDocumentPackages(
    candidate: CaseCandidateV1,
    root: string,
    headers: Record<string, string>,
    omissions: CaseEvidenceSurfaceOmissionV1[],
  ): Promise<CaseDocumentPackageEvidenceV1[]> {
    const listPath = "/v1/document-packages";
    const listResponse = await this.get(root, listPath, headers);
    const omitted = optionalDisposition(listResponse.status, "DOCUMENT_PACKAGES");
    if (omitted) {
      omissions.push(omitted);
      return [];
    }
    const list = matchingDocumentPackages(
      parseJson(listResponse.body, "Document Package list"),
      candidate,
    );
    const collected: CaseDocumentPackageEvidenceV1[] = [];
    for (const summary of list) {
      const documentPackageId = String(summary.documentPackageId);
      const path = `/v1/document-packages/${encodeURIComponent(documentPackageId)}`;
      const response = await this.get(root, path, headers);
      if (response.status === 401 || response.status === 403) {
        omissions.push({ surface: "DOCUMENT_PACKAGES", reason: "NOT_AUTHORIZED" });
        return [];
      }
      if (response.status === 404) {
        omissions.push({ surface: "DOCUMENT_PACKAGES", reason: "NOT_AVAILABLE" });
        return [];
      }
      requiredStatus(response.status, `Document Package ${documentPackageId}`);
      const json = parseJson(response.body, `Document Package ${documentPackageId}`);
      verifyDocumentPackage(json, candidate, documentPackageId);
      collected.push({
        documentPackageId,
        sourceFormalMatterVersion: candidate.sourceMatterVersion,
        sourceFormalMatterHash: candidate.sourceSnapshotSha256,
        payload: exactPayload(`markreg:${path}`, response.body),
      });
    }
    return collected;
  }

  private get(
    root: string,
    path: string,
    headers: Record<string, string>,
  ): Promise<MarkRegCaseSourceTransportResponse> {
    return this.transport({
      url: `${root}${path}`,
      headers,
      timeoutMs: this.timeoutMs,
      maxResponseBytes: this.maxResponseBytes,
    });
  }
}
