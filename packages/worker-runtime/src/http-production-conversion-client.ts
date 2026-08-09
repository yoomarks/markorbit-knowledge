import { randomBytes } from "node:crypto";
import {
  CONVERSION_RUNTIME_VERSION,
  isCanonicalMarkdownMetadataV1,
  isConversionClaimResult,
  type CanonicalMarkdownMetadataV1,
  type ConversionClaimRequest,
  type ConversionClaimResult,
  type ConversionFailedReport,
  type ConversionOutputReadyReport,
  type ConversionProgressReport,
  type ConversionStartedReport,
  type RuntimeReportBase,
} from "@markorbit/contracts";
import {
  type ProductionConversionRuntimeClient,
  type ProductionMarkdownStagingContext,
  type ProductionRawArtifactReader,
  type ProductionStagingCommitResult,
  type ProductionStagingUploader,
  type ProductionStagingUploadEvidence,
} from "./production-markdown-staging";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type ProductionConversionClaimEnvelope = {
  result: ConversionClaimResult;
  replayed: boolean;
};

export type ProductionConversionRunContext = {
  workspaceId: string;
  conversionRunId: string;
  sourceId: string;
  rawArtifactId: string;
  documentMetadata: CanonicalMarkdownMetadataV1;
};

export type ProductionConversionHttpOptions = {
  fetchImpl?: typeof fetch;
};

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

export function productionRuntimeId(prefix: string, now = Date.now()): string {
  if (!/^[a-z]{3}$/.test(prefix)) throw new Error("PRODUCTION_RUNTIME_ID_PREFIX_INVALID");
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PRODUCTION_CONVERSION_CONTROL_PLANE_URL_INVALID");
  }
  return url.toString().replace(/\/$/, "");
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const error = body.error as Record<string, unknown> | undefined;
    if (typeof error?.message === "string") return error.message;
  } catch {
    // fall through
  }
  return `HTTP ${response.status}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value)
    throw new Error(`PRODUCTION_CONVERSION_RESPONSE_MISSING_${field}`);
  return value;
}

function exactArrayBuffer(content: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy.buffer;
}

export class HttpProductionConversionClient
  implements
    ProductionRawArtifactReader,
    ProductionStagingUploader,
    ProductionConversionRuntimeClient
{
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    controlPlaneUrl: string,
    readonly workerId: string,
    private readonly workerCredential: string,
    options: ProductionConversionHttpOptions = {},
  ) {
    this.baseUrl = normalizedBaseUrl(controlPlaneUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async claim(request: ConversionClaimRequest): Promise<ProductionConversionClaimEnvelope> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/worker/v1/conversion/claim`, {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify(request),
    });
    if (!response.ok)
      throw new Error(`PRODUCTION_CONVERSION_CLAIM_FAILED: ${await errorMessage(response)}`);
    const body = record(await response.json());
    if (!body || !isConversionClaimResult(body.result) || typeof body.replayed !== "boolean") {
      throw new Error("PRODUCTION_CONVERSION_CLAIM_RESPONSE_INVALID");
    }
    return { result: body.result, replayed: body.replayed };
  }

  async runContext(conversionRunId: string): Promise<ProductionConversionRunContext> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/worker/v1/conversion/run/${encodeURIComponent(conversionRunId)}?workerId=${encodeURIComponent(this.workerId)}`,
      { headers: this.authHeaders() },
    );
    if (!response.ok)
      throw new Error(`PRODUCTION_CONVERSION_CONTEXT_FAILED: ${await errorMessage(response)}`);
    const body = record(await response.json());
    if (!body || !isCanonicalMarkdownMetadataV1(body.documentMetadata)) {
      throw new Error("PRODUCTION_CONVERSION_CONTEXT_RESPONSE_INVALID");
    }
    return {
      workspaceId: requiredString(body.workspaceId, "WORKSPACE_ID"),
      conversionRunId: requiredString(body.conversionRunId, "RUN_ID"),
      sourceId: requiredString(body.sourceId, "SOURCE_ID"),
      rawArtifactId: requiredString(body.rawArtifactId, "ARTIFACT_ID"),
      documentMetadata: body.documentMetadata,
    };
  }

  async read(grant: ProductionMarkdownStagingContext["inputGrant"]): Promise<Uint8Array> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/worker/v1/conversion/input/${encodeURIComponent(grant.id)}?workerId=${encodeURIComponent(this.workerId)}`,
      { headers: this.authHeaders() },
    );
    if (!response.ok)
      throw new Error(`PRODUCTION_CONVERSION_INPUT_FAILED: ${await errorMessage(response)}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async upload(
    context: ProductionMarkdownStagingContext,
    content: Uint8Array,
    evidence: ProductionStagingUploadEvidence,
    idempotencyKey: string,
  ): Promise<ProductionStagingCommitResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/worker/v1/conversion/output`, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "content-type": "text/markdown",
        "content-length": String(content.byteLength),
        "x-markorbit-workspace-id": context.workspaceId,
        "x-markorbit-worker-id": context.workerId,
        "x-markorbit-conversion-run-id": context.conversionRunId,
        "x-markorbit-conversion-attempt-id": context.conversionAttemptId,
        "x-markorbit-upload-grant-id": evidence.uploadGrantId,
        "idempotency-key": idempotencyKey,
      },
      body: exactArrayBuffer(content),
    });
    if (!response.ok)
      throw new Error(`PRODUCTION_CONVERSION_OUTPUT_FAILED: ${await errorMessage(response)}`);
    const body = record(await response.json());
    if (!body) throw new Error("PRODUCTION_CONVERSION_OUTPUT_RESPONSE_INVALID");
    const stagingStatus = body.stagingStatus;
    const verificationOutcome = body.verificationOutcome;
    const finalizationDecision = body.finalizationDecision;
    if (
      (stagingStatus !== "READY" && stagingStatus !== "BLOCKED") ||
      !["PASS", "PASS_WITH_WARNINGS", "FAIL"].includes(String(verificationOutcome)) ||
      (finalizationDecision !== "COMPLETED" && finalizationDecision !== "FAILED")
    ) {
      throw new Error("PRODUCTION_CONVERSION_OUTPUT_RESPONSE_INVALID");
    }
    return {
      stagingDocumentId: requiredString(body.stagingDocumentId, "STAGING_DOCUMENT_ID"),
      stagingStatus,
      verificationOutcome:
        verificationOutcome as ProductionStagingCommitResult["verificationOutcome"],
      finalizationDecision,
      ...(typeof body.readyPackageId === "string" ? { readyPackageId: body.readyPackageId } : {}),
    };
  }

  async started(context: ProductionMarkdownStagingContext, idempotencyKey: string): Promise<void> {
    const report: ConversionStartedReport = {
      ...this.reportBase(context, "CONVERSION_STARTED_REPORT", idempotencyKey, "PENDING", "csr"),
      objectType: "CONVERSION_STARTED_REPORT",
      converter: context.converter,
    };
    await this.report(report);
  }

  async progress(
    context: ProductionMarkdownStagingContext,
    progress: { percent: number; message: string },
    idempotencyKey: string,
  ): Promise<void> {
    const report: ConversionProgressReport = {
      ...this.reportBase(context, "CONVERSION_PROGRESS_REPORT", idempotencyKey, "RUNNING", "cpr"),
      objectType: "CONVERSION_PROGRESS_REPORT",
      progress,
    };
    await this.report(report);
  }

  async outputReady(
    context: ProductionMarkdownStagingContext,
    evidence: ProductionStagingUploadEvidence,
    idempotencyKey: string,
  ): Promise<void> {
    const report: ConversionOutputReadyReport = {
      ...this.reportBase(
        context,
        "CONVERSION_OUTPUT_READY_REPORT",
        idempotencyKey,
        "RUNNING",
        "cor",
      ),
      objectType: "CONVERSION_OUTPUT_READY_REPORT",
      output: evidence,
    };
    await this.report(report);
  }

  async failed(
    context: ProductionMarkdownStagingContext,
    failure: { code: string; message: string; retryable: false },
    idempotencyKey: string,
  ): Promise<void> {
    const report: ConversionFailedReport = {
      ...this.reportBase(context, "CONVERSION_FAILED_REPORT", idempotencyKey, "RUNNING", "cfr"),
      objectType: "CONVERSION_FAILED_REPORT",
      failure,
    };
    await this.report(report);
  }

  private reportBase(
    context: ProductionMarkdownStagingContext,
    objectType: RuntimeReportBase["objectType"],
    idempotencyKey: string,
    expectedCurrentStatus: RuntimeReportBase["expectedCurrentStatus"],
    prefix: string,
  ): RuntimeReportBase {
    return {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType,
      id: productionRuntimeId(prefix),
      workspaceId: context.workspaceId,
      workerId: context.workerId,
      workerCredentialId: `worker-ref:${context.workerId}`,
      conversionRunId: context.conversionRunId,
      conversionAttemptId: context.conversionAttemptId,
      conversionLeaseId: context.lease.id,
      leaseGeneration: context.lease.generation,
      leaseTokenReference: context.lease.tokenReference,
      leaseTokenDigest: context.lease.tokenDigest,
      idempotencyKey,
      occurredAt: new Date().toISOString(),
      expectedCurrentStatus,
    };
  }

  private async report(
    report:
      | ConversionStartedReport
      | ConversionProgressReport
      | ConversionOutputReadyReport
      | ConversionFailedReport,
  ): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/worker/v1/conversion/report`, {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify(report),
    });
    if (!response.ok)
      throw new Error(`PRODUCTION_CONVERSION_REPORT_FAILED: ${await errorMessage(response)}`);
  }

  private authHeaders(): Record<string, string> {
    return { authorization: `Bearer ${this.workerCredential}` };
  }

  private jsonHeaders(): Record<string, string> {
    return { ...this.authHeaders(), "content-type": "application/json" };
  }
}
