import { type ArtifactKind, type Extensions } from "./schema-v1";
import { type ConversionOutputFormat, mimePatternMatches } from "./conversion-control-v1";
import { type ConversionRunStatus } from "./conversion-execution-v1";

export const CONVERSION_RUNTIME_VERSION = "1.0" as const;
export const CONVERSION_RUNTIME_LIMITS = {
  maxConverters: 50,
  maxVersionsPerConverter: 50,
  maxArtifactKinds: 20,
  maxMimePatterns: 50,
  maxOutputFormats: 10,
  maxCapabilityRevision: 1_000_000,
  maxReferenceLength: 200,
  maxMessageLength: 1000,
  maxFailureCodeLength: 100,
  maxMetadataKeys: 25,
  maxMetadataStringLength: 500,
  maxCanonicalPayloadBytes: 20_000,
  maxUploadBytes: 5_000_000,
} as const;
export const CONVERSION_LEASE_STATUSES = ["ACTIVE", "RELEASED", "EXPIRED", "SUPERSEDED"] as const;
export type ConversionLeaseStatus = (typeof CONVERSION_LEASE_STATUSES)[number];
export const CONVERSION_ATTEMPT_STATUSES = [
  "CLAIMED",
  "STARTED",
  "OUTPUT_REPORTED",
  "FAILED",
  "ABANDONED",
  "LEASE_LOST",
] as const;
export type ConversionAttemptStatus = (typeof CONVERSION_ATTEMPT_STATUSES)[number];
export const CONVERSION_CLAIM_RESULT_TYPES = ["NO_COMPATIBLE_WORK", "CLAIMED"] as const;
export type ConversionClaimResultType = (typeof CONVERSION_CLAIM_RESULT_TYPES)[number];
export const CONVERSION_LEASE_LOSS_CLASSIFICATIONS = [
  "LOST_BEFORE_STARTED_RECLAIMABLE",
  "LOST_AFTER_STARTED_FAIL_RUN",
  "SUPERSEDED",
  "VERIFYING_VERIFIER_OWNS_CONTINUATION",
] as const;
export type ConversionLeaseLossClassification =
  (typeof CONVERSION_LEASE_LOSS_CLASSIFICATIONS)[number];

export type ExactConverterSupport = { converterId: string; versions: string[] };
export type RuntimeTokenReference = { tokenReference: string; tokenDigest: string };
export type RuntimeConverterRef = { converterId: string; version: string };
export type ConversionWorkerCapability = {
  contractVersion: typeof CONVERSION_RUNTIME_VERSION;
  objectType: "CONVERSION_WORKER_CAPABILITY";
  id: string;
  workerId: string;
  capabilityRevision: number;
  supportedConverters: ExactConverterSupport[];
  acceptedArtifactKinds: ArtifactKind[];
  acceptedMimePatterns: string[];
  supportedOutputFormats: ConversionOutputFormat[];
  runtime: { runtimeId: string; version: string };
  createdAt: string;
  extensions?: Extensions;
};
export type ConversionLease = {
  contractVersion: typeof CONVERSION_RUNTIME_VERSION;
  objectType: "CONVERSION_LEASE";
  id: string;
  workspaceId: string;
  conversionRunId: string;
  workerId: string;
  conversionAttemptId: string;
  converter: RuntimeConverterRef;
  generation: number;
  tokenReference: string;
  tokenDigest: string;
  status: ConversionLeaseStatus;
  issuedAt: string;
  expiresAt: string;
  renewableUntil: string;
  releasedAt?: string;
  expiredAt?: string;
  supersededAt?: string;
  extensions?: Extensions;
};
export type ConversionAttempt = {
  contractVersion: typeof CONVERSION_RUNTIME_VERSION;
  objectType: "CONVERSION_ATTEMPT";
  id: string;
  workspaceId: string;
  conversionRunId: string;
  workerId: string;
  conversionLeaseId: string;
  ordinal: number;
  converter: RuntimeConverterRef;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  status: ConversionAttemptStatus;
  outcome?: "OUTPUT_REPORTED" | "FAILED" | "ABANDONED" | "LEASE_LOST";
  failure?: { code: string; message: string; retryable: false; evidence?: Extensions };
  reconciliation?: { code: string; evidence: Extensions };
  extensions?: Extensions;
};
export type ConversionClaimRequest = {
  contractVersion: typeof CONVERSION_RUNTIME_VERSION;
  objectType: "CONVERSION_CLAIM_REQUEST";
  id: string;
  workspaceId: string;
  workerId: string;
  workerCredentialId: string;
  capabilityRevision: number;
  supportedConverters: ExactConverterSupport[];
  maxAcceptedWork: number;
  idempotencyKey: string;
  requestedLeaseDurationSeconds: number;
  extensions?: Extensions;
};
export type RawArtifactReadGrant = {
  contractVersion: typeof CONVERSION_RUNTIME_VERSION;
  objectType: "RAW_ARTIFACT_READ_GRANT";
  id: string;
  workspaceId: string;
  rawArtifactId: string;
  conversionRunId: string;
  conversionAttemptId: string;
  workerId: string;
  expectedSha256: string;
  expectedBytes: number;
  expectedMime: string;
  accessRef: string;
  issuedAt: string;
  expiresAt: string;
  maximumReads: number;
  readsUsed: number;
  usagePolicy: "CONVERSION_INPUT_ONLY";
  tokenReference: string;
  tokenDigest: string;
  extensions?: Extensions;
};
export type StagingOutputUploadGrant = {
  contractVersion: typeof CONVERSION_RUNTIME_VERSION;
  objectType: "STAGING_OUTPUT_UPLOAD_GRANT";
  id: string;
  workspaceId: string;
  conversionRunId: string;
  conversionAttemptId: string;
  workerId: string;
  normalizedTargetPath: string;
  allowedMediaType: "text/markdown";
  maximumBytes: number;
  requiredDigestAlgorithm: "SHA-256";
  uploadSessionRef: string;
  issuedAt: string;
  expiresAt: string;
  tokenReference: string;
  tokenDigest: string;
  allowedContentCount: 1;
  expectedProvenancePolicy: "CONVERSION_ATTEMPT_BOUND";
  extensions?: Extensions;
};
export type ConversionClaimResult = {
  contractVersion: typeof CONVERSION_RUNTIME_VERSION;
  objectType: "CONVERSION_CLAIM_RESULT";
  id: string;
  workspaceId: string;
  workerId: string;
  result: ConversionClaimResultType;
  idempotencyKey: string;
  lease?: ConversionLease;
  executionSummary?: {
    conversionRunId: string;
    rawArtifactId: string;
    artifactKind: ArtifactKind;
    mimeType: string;
    sha256: string;
    sizeBytes: number;
    requestedOutputFormat: ConversionOutputFormat;
    targetPathTemplate: string;
  };
  converter?: RuntimeConverterRef;
  rawArtifactReadGrant?: RawArtifactReadGrant;
  stagingOutputUploadGrant?: StagingOutputUploadGrant;
  extensions?: Extensions;
};
export type RuntimeReportBase = {
  contractVersion: typeof CONVERSION_RUNTIME_VERSION;
  objectType: string;
  id: string;
  workspaceId: string;
  workerId: string;
  workerCredentialId: string;
  conversionRunId: string;
  conversionAttemptId: string;
  conversionLeaseId: string;
  leaseGeneration: number;
  leaseTokenReference: string;
  leaseTokenDigest: string;
  idempotencyKey: string;
  occurredAt: string;
  expectedCurrentStatus: ConversionRunStatus;
  metadata?: Extensions;
};
export type ConversionStartedReport = RuntimeReportBase & {
  objectType: "CONVERSION_STARTED_REPORT";
  converter: RuntimeConverterRef;
};
export type ConversionProgressReport = RuntimeReportBase & {
  objectType: "CONVERSION_PROGRESS_REPORT";
  progress: { percent: number; message?: string };
};
export type ConversionOutputReadyReport = RuntimeReportBase & {
  objectType: "CONVERSION_OUTPUT_READY_REPORT";
  output: {
    uploadGrantId: string;
    targetPath: string;
    sha256: string;
    sizeBytes: number;
    mediaType: "text/markdown";
  };
};
export type ConversionVerificationReadyReport = RuntimeReportBase & {
  objectType: "CONVERSION_VERIFICATION_READY_REPORT";
  stagingDescriptorRef: string;
  outputGrantId: string;
};
export type ConversionFailedReport = RuntimeReportBase & {
  objectType: "CONVERSION_FAILED_REPORT";
  failure: { code: string; message: string; retryable: false };
};
export type ConversionLeaseRenewalRequest = RuntimeReportBase & {
  objectType: "CONVERSION_LEASE_RENEWAL_REQUEST";
  requestedDurationSeconds: number;
};
export type ConversionLeaseRenewalResult = {
  contractVersion: typeof CONVERSION_RUNTIME_VERSION;
  objectType: "CONVERSION_LEASE_RENEWAL_RESULT";
  id: string;
  workspaceId: string;
  conversionLeaseId: string;
  conversionAttemptId: string;
  workerId: string;
  granted: boolean;
  generation: number;
  expiresAt?: string;
  renewableUntil?: string;
  denialCode?: string;
  idempotencyKey: string;
  occurredAt: string;
};
export type ConversionLeaseReleaseRequest = RuntimeReportBase & {
  objectType: "CONVERSION_LEASE_RELEASE_REQUEST";
  reason: "WORKER_SHUTDOWN" | "CANCELLED" | "NO_LONGER_NEEDED";
};
export type ConversionLeaseLossReport = RuntimeReportBase & {
  objectType: "CONVERSION_LEASE_LOSS_REPORT";
  lossReason: "EXPIRED" | "SUPERSEDED" | "REVOKED";
};

const ID = /^[a-z]{3}_[0-9A-HJKMNP-TV-Z]{26}$/;
const WSP = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/;
const WRK = /^wrk_[0-9A-HJKMNP-TV-Z]{26}$/;
const CVR = /^cvr_[0-9A-HJKMNP-TV-Z]{26}$/;
const CVA = /^cva_[0-9A-HJKMNP-TV-Z]{26}$/;
const CVL = /^cvl_[0-9A-HJKMNP-TV-Z]{26}$/;
const ART = /^art_[0-9A-HJKMNP-TV-Z]{26}$/;
const SEMVER =
  /^(?!.*(?:\*|latest|any|[~^<>]=?))\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA = /^[a-f0-9]{64}$/;
const MIME = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const FORBIDDEN = [
  "password",
  "passwd",
  "tokenvalue",
  "bearer",
  "apikey",
  "apisecret",
  "clientsecret",
  "privatekey",
  "accesskey",
  "secret",
  "command",
  "cmd",
  "shell",
  "script",
  "executable",
  "executablepath",
  "argv",
  "args",
  "environment",
  "env",
  "markdown",
  "yaml",
  "html",
  "body",
  "content",
  "binary",
  "base64",
  "cookie",
  "credential",
];
function rec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function only(v: Record<string, unknown>, keys: readonly string[]) {
  const s = new Set(keys);
  return Object.keys(v).every((k) => s.has(k));
}
function req(v: Record<string, unknown>, keys: readonly string[]) {
  return keys.every((k) => Object.prototype.hasOwnProperty.call(v, k));
}
function en<T extends readonly string[]>(a: T, v: unknown): v is T[number] {
  return typeof v === "string" && a.includes(v as T[number]);
}
function time(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v) &&
    !Number.isNaN(Date.parse(v))
  );
}
function pos(v: unknown) {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}
function nn(v: unknown) {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}
function forbidden(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(forbidden);
  if (!rec(v)) return false;
  for (const [k, c] of Object.entries(v)) {
    const n = k.toLowerCase().replace(/[-_\s]/g, "");
    if (
      FORBIDDEN.includes(n) ||
      n.endsWith("secretvalue") ||
      n.endsWith("tokenvalue") ||
      n.endsWith("passwordvalue")
    )
      return true;
    if (typeof c === "string" && c.length > 2000) return true;
    if (forbidden(c)) return true;
  }
  return false;
}
function ext(v: unknown): v is Extensions {
  return (
    rec(v) &&
    Object.keys(v).length <= CONVERSION_RUNTIME_LIMITS.maxMetadataKeys &&
    only(v, Object.keys(v)) &&
    Object.keys(v).every(
      (k) =>
        /^x-[a-z0-9][a-z0-9.-]*$/.test(k) &&
        !/(secret|password|token|credential|command|script|shell|body|content|markdown|yaml|html|binary|base64)/i.test(
          k,
        ),
    ) &&
    !forbidden(v) &&
    Object.values(v).every(
      (value) =>
        typeof value !== "string" ||
        value.length <= CONVERSION_RUNTIME_LIMITS.maxMetadataStringLength,
    )
  );
}
function tokenReference(value: unknown): value is string {
  return typeof value === "string" && /^rtk_[A-Za-z0-9._:-]{8,160}$/.test(value);
}
function tokenDigest(value: unknown): value is string {
  return typeof value === "string" && SHA.test(value);
}
function converter(v: unknown): v is RuntimeConverterRef {
  return (
    rec(v) &&
    req(v, ["converterId", "version"]) &&
    only(v, ["converterId", "version"]) &&
    typeof v.converterId === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.converterId) &&
    typeof v.version === "string" &&
    SEMVER.test(v.version)
  );
}
function converterList(v: unknown): v is ExactConverterSupport[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= CONVERSION_RUNTIME_LIMITS.maxConverters &&
    v.every(
      (x) =>
        rec(x) &&
        req(x, ["converterId", "versions"]) &&
        only(x, ["converterId", "versions"]) &&
        typeof x.converterId === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x.converterId) &&
        Array.isArray(x.versions) &&
        x.versions.length > 0 &&
        x.versions.length <= CONVERSION_RUNTIME_LIMITS.maxVersionsPerConverter &&
        x.versions.every((y) => typeof y === "string" && SEMVER.test(y)) &&
        new Set(x.versions).size === x.versions.length,
    )
  );
}
function runtime(v: unknown) {
  return (
    rec(v) &&
    req(v, ["runtimeId", "version"]) &&
    only(v, ["runtimeId", "version"]) &&
    typeof v.runtimeId === "string" &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(v.runtimeId) &&
    typeof v.version === "string" &&
    SEMVER.test(v.version)
  );
}
function path(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= 500 &&
    !v.startsWith("/") &&
    !v.includes("\\") &&
    !v.includes(":") &&
    !v.startsWith("vault/") &&
    v !== "." &&
    v !== ".." &&
    v.endsWith(".md") &&
    !/[\u0000-\u001F\u007F]/.test(v) &&
    !v.startsWith(".obsidian/") &&
    v.split("/").every((s) => s && s !== "." && s !== "..") &&
    !v.split("/").at(-1)?.slice(0, -3).includes(".")
  );
}
function meta(v: unknown) {
  return v === undefined || ext(v);
}
function withoutKeys(v: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const copy = { ...v };
  for (const k of keys) delete copy[k];
  return copy;
}
function str(v: unknown, n = 200) {
  return typeof v === "string" && v.length > 0 && v.length <= n;
}
function baseReport(v: Record<string, unknown>, type: string) {
  return (
    req(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "workerId",
      "workerCredentialId",
      "conversionRunId",
      "conversionAttemptId",
      "conversionLeaseId",
      "leaseGeneration",
      "leaseTokenReference",
      "leaseTokenDigest",
      "idempotencyKey",
      "occurredAt",
      "expectedCurrentStatus",
    ]) &&
    only(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "workerId",
      "workerCredentialId",
      "conversionRunId",
      "conversionAttemptId",
      "conversionLeaseId",
      "leaseGeneration",
      "leaseTokenReference",
      "leaseTokenDigest",
      "idempotencyKey",
      "occurredAt",
      "expectedCurrentStatus",
      "metadata",
      "converter",
      "progress",
      "output",
      "failure",
      "stagingDescriptorRef",
      "outputGrantId",
      "requestedDurationSeconds",
      "reason",
      "lossReason",
    ]) &&
    v.contractVersion === CONVERSION_RUNTIME_VERSION &&
    v.objectType === type &&
    typeof v.id === "string" &&
    ID.test(v.id) &&
    typeof v.workspaceId === "string" &&
    WSP.test(v.workspaceId) &&
    typeof v.workerId === "string" &&
    WRK.test(v.workerId) &&
    str(v.workerCredentialId) &&
    typeof v.conversionRunId === "string" &&
    CVR.test(v.conversionRunId) &&
    typeof v.conversionAttemptId === "string" &&
    CVA.test(v.conversionAttemptId) &&
    typeof v.conversionLeaseId === "string" &&
    CVL.test(v.conversionLeaseId) &&
    pos(v.leaseGeneration) &&
    tokenReference(v.leaseTokenReference) &&
    tokenDigest(v.leaseTokenDigest) &&
    typeof v.idempotencyKey === "string" &&
    KEY.test(v.idempotencyKey) &&
    time(v.occurredAt) &&
    en(
      ["PENDING", "RUNNING", "VERIFYING", "COMPLETED", "FAILED", "CANCELLED"] as const,
      v.expectedCurrentStatus,
    ) &&
    meta(v.metadata) &&
    !forbidden(withoutKeys(v, ["leaseTokenReference"]))
  );
}
export function isConversionWorkerCapability(v: unknown): v is ConversionWorkerCapability {
  return (
    rec(v) &&
    req(v, [
      "contractVersion",
      "objectType",
      "id",
      "workerId",
      "capabilityRevision",
      "supportedConverters",
      "acceptedArtifactKinds",
      "acceptedMimePatterns",
      "supportedOutputFormats",
      "runtime",
      "createdAt",
    ]) &&
    only(v, [
      "contractVersion",
      "objectType",
      "id",
      "workerId",
      "capabilityRevision",
      "supportedConverters",
      "acceptedArtifactKinds",
      "acceptedMimePatterns",
      "supportedOutputFormats",
      "runtime",
      "createdAt",
      "extensions",
    ]) &&
    v.contractVersion === CONVERSION_RUNTIME_VERSION &&
    v.objectType === "CONVERSION_WORKER_CAPABILITY" &&
    typeof v.id === "string" &&
    /^cwc_[0-9A-HJKMNP-TV-Z]{26}$/.test(v.id) &&
    typeof v.workerId === "string" &&
    WRK.test(v.workerId) &&
    pos(v.capabilityRevision) &&
    Number(v.capabilityRevision) <= CONVERSION_RUNTIME_LIMITS.maxCapabilityRevision &&
    converterList(v.supportedConverters) &&
    Array.isArray(v.acceptedArtifactKinds) &&
    v.acceptedArtifactKinds.length > 0 &&
    v.acceptedArtifactKinds.length <= CONVERSION_RUNTIME_LIMITS.maxArtifactKinds &&
    v.acceptedArtifactKinds.every((item) => str(item)) &&
    Array.isArray(v.acceptedMimePatterns) &&
    v.acceptedMimePatterns.length > 0 &&
    v.acceptedMimePatterns.length <= CONVERSION_RUNTIME_LIMITS.maxMimePatterns &&
    v.acceptedMimePatterns.every((item) => str(item)) &&
    Array.isArray(v.supportedOutputFormats) &&
    v.supportedOutputFormats.length > 0 &&
    v.supportedOutputFormats.length <= CONVERSION_RUNTIME_LIMITS.maxOutputFormats &&
    v.supportedOutputFormats.every((item) => str(item)) &&
    runtime(v.runtime) &&
    time(v.createdAt) &&
    meta(v.extensions) &&
    !forbidden(v)
  );
}
export function isConversionLease(v: unknown): v is ConversionLease {
  if (!(
    rec(v) &&
    req(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "conversionRunId",
      "workerId",
      "conversionAttemptId",
      "converter",
      "generation",
      "tokenReference",
      "tokenDigest",
      "status",
      "issuedAt",
      "expiresAt",
      "renewableUntil",
    ])
  ))
    return false;
  const ok =
    only(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "conversionRunId",
      "workerId",
      "conversionAttemptId",
      "converter",
      "generation",
      "tokenReference",
      "tokenDigest",
      "status",
      "issuedAt",
      "expiresAt",
      "renewableUntil",
      "releasedAt",
      "expiredAt",
      "supersededAt",
      "extensions",
    ]) &&
    v.contractVersion === CONVERSION_RUNTIME_VERSION &&
    v.objectType === "CONVERSION_LEASE" &&
    typeof v.id === "string" &&
    CVL.test(v.id) &&
    typeof v.workspaceId === "string" &&
    WSP.test(v.workspaceId) &&
    typeof v.conversionRunId === "string" &&
    CVR.test(v.conversionRunId) &&
    typeof v.workerId === "string" &&
    WRK.test(v.workerId) &&
    typeof v.conversionAttemptId === "string" &&
    CVA.test(v.conversionAttemptId) &&
    converter(v.converter) &&
    pos(v.generation) &&
    tokenReference(v.tokenReference) &&
    tokenDigest(v.tokenDigest) &&
    en(CONVERSION_LEASE_STATUSES, v.status) &&
    time(v.issuedAt) &&
    time(v.expiresAt) &&
    time(v.renewableUntil) &&
    meta(v.extensions) &&
    !forbidden(withoutKeys(v, ["tokenReference"])) &&
    Date.parse(v.issuedAt as string) < Date.parse(v.expiresAt as string) &&
    Date.parse(v.expiresAt as string) <= Date.parse(v.renewableUntil as string);
  const closed = [v.releasedAt, v.expiredAt, v.supersededAt].filter((value) => value !== undefined);
  if (!ok || closed.length > 1) return false;
  const issued = Date.parse(v.issuedAt as string);
  if (v.status === "ACTIVE") return closed.length === 0;
  if (v.status === "RELEASED") return time(v.releasedAt) && Date.parse(v.releasedAt) >= issued;
  if (v.status === "EXPIRED") return time(v.expiredAt) && Date.parse(v.expiredAt) >= issued;
  return time(v.supersededAt) && Date.parse(v.supersededAt) >= issued;
}
export function isConversionAttempt(v: unknown): v is ConversionAttempt {
  return (
    rec(v) &&
    req(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "conversionRunId",
      "workerId",
      "conversionLeaseId",
      "ordinal",
      "converter",
      "createdAt",
      "status",
    ]) &&
    only(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "conversionRunId",
      "workerId",
      "conversionLeaseId",
      "ordinal",
      "converter",
      "createdAt",
      "startedAt",
      "endedAt",
      "status",
      "outcome",
      "failure",
      "reconciliation",
      "extensions",
    ]) &&
    v.contractVersion === CONVERSION_RUNTIME_VERSION &&
    v.objectType === "CONVERSION_ATTEMPT" &&
    typeof v.id === "string" &&
    CVA.test(v.id) &&
    typeof v.workspaceId === "string" &&
    WSP.test(v.workspaceId) &&
    typeof v.conversionRunId === "string" &&
    CVR.test(v.conversionRunId) &&
    typeof v.workerId === "string" &&
    WRK.test(v.workerId) &&
    typeof v.conversionLeaseId === "string" &&
    CVL.test(v.conversionLeaseId) &&
    pos(v.ordinal) &&
    converter(v.converter) &&
    time(v.createdAt) &&
    (v.startedAt === undefined || time(v.startedAt)) &&
    (v.endedAt === undefined || time(v.endedAt)) &&
    en(CONVERSION_ATTEMPT_STATUSES, v.status) &&
    (v.outcome === undefined ||
      en(["OUTPUT_REPORTED", "FAILED", "ABANDONED", "LEASE_LOST"] as const, v.outcome)) &&
    (v.failure === undefined ||
      (rec(v.failure) &&
        req(v.failure, ["code", "message", "retryable"]) &&
        only(v.failure, ["code", "message", "retryable", "evidence"]) &&
        str(v.failure.code, CONVERSION_RUNTIME_LIMITS.maxFailureCodeLength) &&
        str(v.failure.message, CONVERSION_RUNTIME_LIMITS.maxMessageLength) &&
        v.failure.retryable === false &&
        meta(v.failure.evidence))) &&
    (v.reconciliation === undefined ||
      (rec(v.reconciliation) &&
        req(v.reconciliation, ["code", "evidence"]) &&
        only(v.reconciliation, ["code", "evidence"]) &&
        str(v.reconciliation.code, CONVERSION_RUNTIME_LIMITS.maxFailureCodeLength) &&
        ext(v.reconciliation.evidence))) &&
    meta(v.extensions) &&
    !forbidden(v)
  );
}
export function isRawArtifactReadGrant(v: unknown): v is RawArtifactReadGrant {
  return (
    rec(v) &&
    req(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "rawArtifactId",
      "conversionRunId",
      "conversionAttemptId",
      "workerId",
      "expectedSha256",
      "expectedBytes",
      "expectedMime",
      "accessRef",
      "issuedAt",
      "expiresAt",
      "maximumReads",
      "readsUsed",
      "usagePolicy",
      "tokenReference",
      "tokenDigest",
    ]) &&
    only(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "rawArtifactId",
      "conversionRunId",
      "conversionAttemptId",
      "workerId",
      "expectedSha256",
      "expectedBytes",
      "expectedMime",
      "accessRef",
      "issuedAt",
      "expiresAt",
      "maximumReads",
      "readsUsed",
      "usagePolicy",
      "tokenReference",
      "tokenDigest",
      "extensions",
    ]) &&
    v.contractVersion === CONVERSION_RUNTIME_VERSION &&
    v.objectType === "RAW_ARTIFACT_READ_GRANT" &&
    typeof v.id === "string" &&
    /^rag_[0-9A-HJKMNP-TV-Z]{26}$/.test(v.id) &&
    typeof v.workspaceId === "string" &&
    WSP.test(v.workspaceId) &&
    typeof v.rawArtifactId === "string" &&
    ART.test(v.rawArtifactId) &&
    typeof v.conversionRunId === "string" &&
    CVR.test(v.conversionRunId) &&
    typeof v.conversionAttemptId === "string" &&
    CVA.test(v.conversionAttemptId) &&
    typeof v.workerId === "string" &&
    WRK.test(v.workerId) &&
    typeof v.expectedSha256 === "string" &&
    SHA.test(v.expectedSha256) &&
    pos(v.expectedBytes) &&
    typeof v.expectedMime === "string" &&
    MIME.test(v.expectedMime) &&
    str(v.accessRef, 200) &&
    !/(secret|bearer|token|password)/i.test(v.accessRef as string) &&
    time(v.issuedAt) &&
    time(v.expiresAt) &&
    pos(v.maximumReads) &&
    nn(v.readsUsed) &&
    Number(v.readsUsed) <= Number(v.maximumReads) &&
    v.usagePolicy === "CONVERSION_INPUT_ONLY" &&
    tokenReference(v.tokenReference) &&
    tokenDigest(v.tokenDigest) &&
    meta(v.extensions) &&
    !forbidden(withoutKeys(v, ["tokenReference"]))
  );
}
export function isStagingOutputUploadGrant(v: unknown): v is StagingOutputUploadGrant {
  return (
    rec(v) &&
    req(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "conversionRunId",
      "conversionAttemptId",
      "workerId",
      "normalizedTargetPath",
      "allowedMediaType",
      "maximumBytes",
      "requiredDigestAlgorithm",
      "uploadSessionRef",
      "issuedAt",
      "expiresAt",
      "tokenReference",
      "tokenDigest",
      "allowedContentCount",
      "expectedProvenancePolicy",
    ]) &&
    only(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "conversionRunId",
      "conversionAttemptId",
      "workerId",
      "normalizedTargetPath",
      "allowedMediaType",
      "maximumBytes",
      "requiredDigestAlgorithm",
      "uploadSessionRef",
      "issuedAt",
      "expiresAt",
      "tokenReference",
      "tokenDigest",
      "allowedContentCount",
      "expectedProvenancePolicy",
      "extensions",
    ]) &&
    v.contractVersion === CONVERSION_RUNTIME_VERSION &&
    v.objectType === "STAGING_OUTPUT_UPLOAD_GRANT" &&
    typeof v.id === "string" &&
    /^sug_[0-9A-HJKMNP-TV-Z]{26}$/.test(v.id) &&
    typeof v.workspaceId === "string" &&
    WSP.test(v.workspaceId) &&
    typeof v.conversionRunId === "string" &&
    CVR.test(v.conversionRunId) &&
    typeof v.conversionAttemptId === "string" &&
    CVA.test(v.conversionAttemptId) &&
    typeof v.workerId === "string" &&
    WRK.test(v.workerId) &&
    path(v.normalizedTargetPath) &&
    v.allowedMediaType === "text/markdown" &&
    pos(v.maximumBytes) &&
    Number(v.maximumBytes) <= CONVERSION_RUNTIME_LIMITS.maxUploadBytes &&
    v.requiredDigestAlgorithm === "SHA-256" &&
    str(v.uploadSessionRef, 200) &&
    !/(secret|bearer|token|password|vault)/i.test(v.uploadSessionRef as string) &&
    time(v.issuedAt) &&
    time(v.expiresAt) &&
    tokenReference(v.tokenReference) &&
    tokenDigest(v.tokenDigest) &&
    v.allowedContentCount === 1 &&
    v.expectedProvenancePolicy === "CONVERSION_ATTEMPT_BOUND" &&
    meta(v.extensions) &&
    !forbidden(withoutKeys(v, ["tokenReference"]))
  );
}
export function isConversionClaimRequest(v: unknown): v is ConversionClaimRequest {
  return (
    rec(v) &&
    req(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "workerId",
      "workerCredentialId",
      "capabilityRevision",
      "supportedConverters",
      "maxAcceptedWork",
      "idempotencyKey",
      "requestedLeaseDurationSeconds",
    ]) &&
    only(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "workerId",
      "workerCredentialId",
      "capabilityRevision",
      "supportedConverters",
      "maxAcceptedWork",
      "idempotencyKey",
      "requestedLeaseDurationSeconds",
      "extensions",
    ]) &&
    v.contractVersion === CONVERSION_RUNTIME_VERSION &&
    v.objectType === "CONVERSION_CLAIM_REQUEST" &&
    typeof v.id === "string" &&
    /^ccr_[0-9A-HJKMNP-TV-Z]{26}$/.test(v.id) &&
    typeof v.workspaceId === "string" &&
    WSP.test(v.workspaceId) &&
    typeof v.workerId === "string" &&
    WRK.test(v.workerId) &&
    str(v.workerCredentialId) &&
    pos(v.capabilityRevision) &&
    Number(v.capabilityRevision) <= CONVERSION_RUNTIME_LIMITS.maxCapabilityRevision &&
    converterList(v.supportedConverters) &&
    pos(v.maxAcceptedWork) &&
    Number(v.maxAcceptedWork) <= 10 &&
    typeof v.idempotencyKey === "string" &&
    KEY.test(v.idempotencyKey) &&
    pos(v.requestedLeaseDurationSeconds) &&
    Number(v.requestedLeaseDurationSeconds) <= 3600 &&
    meta(v.extensions) &&
    !forbidden(v)
  );
}
export function isConversionClaimResult(v: unknown): v is ConversionClaimResult {
  if (!(
    rec(v) &&
    req(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "workerId",
      "result",
      "idempotencyKey",
    ])
  ))
    return false;
  const base =
    only(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "workerId",
      "result",
      "idempotencyKey",
      "lease",
      "executionSummary",
      "converter",
      "rawArtifactReadGrant",
      "stagingOutputUploadGrant",
      "extensions",
    ]) &&
    v.contractVersion === CONVERSION_RUNTIME_VERSION &&
    v.objectType === "CONVERSION_CLAIM_RESULT" &&
    typeof v.id === "string" &&
    /^ccs_[0-9A-HJKMNP-TV-Z]{26}$/.test(v.id) &&
    typeof v.workspaceId === "string" &&
    WSP.test(v.workspaceId) &&
    typeof v.workerId === "string" &&
    WRK.test(v.workerId) &&
    en(CONVERSION_CLAIM_RESULT_TYPES, v.result) &&
    typeof v.idempotencyKey === "string" &&
    KEY.test(v.idempotencyKey) &&
    meta(v.extensions) &&
    !forbidden(withoutKeys(v, ["rawArtifactReadGrant", "stagingOutputUploadGrant"]));
  if (!base) return false;
  return v.result === "NO_COMPATIBLE_WORK"
    ? v.lease === undefined
    : isConversionLease(v.lease) &&
        converter(v.converter) &&
        isRawArtifactReadGrant(v.rawArtifactReadGrant) &&
        isStagingOutputUploadGrant(v.stagingOutputUploadGrant) &&
        rec(v.executionSummary) &&
        v.lease.workspaceId === v.workspaceId &&
        v.lease.workerId === v.workerId &&
        v.rawArtifactReadGrant.workspaceId === v.lease.workspaceId &&
        v.stagingOutputUploadGrant.workspaceId === v.lease.workspaceId &&
        v.rawArtifactReadGrant.workerId === v.lease.workerId &&
        v.stagingOutputUploadGrant.workerId === v.lease.workerId &&
        v.rawArtifactReadGrant.conversionRunId === v.lease.conversionRunId &&
        v.stagingOutputUploadGrant.conversionRunId === v.lease.conversionRunId &&
        v.rawArtifactReadGrant.conversionAttemptId === v.lease.conversionAttemptId &&
        v.stagingOutputUploadGrant.conversionAttemptId === v.lease.conversionAttemptId &&
        v.converter.converterId === v.lease.converter.converterId &&
        v.converter.version === v.lease.converter.version &&
        v.executionSummary.conversionRunId === v.lease.conversionRunId &&
        v.executionSummary.rawArtifactId === v.rawArtifactReadGrant.rawArtifactId &&
        v.executionSummary.sha256 === v.rawArtifactReadGrant.expectedSha256 &&
        v.executionSummary.sizeBytes === v.rawArtifactReadGrant.expectedBytes &&
        v.executionSummary.mimeType === v.rawArtifactReadGrant.expectedMime;
}
export function isConversionStartedReport(v: unknown): v is ConversionStartedReport {
  return (
    rec(v) &&
    baseReport(v, "CONVERSION_STARTED_REPORT") &&
    converter(v.converter) &&
    v.expectedCurrentStatus === "PENDING"
  );
}
export function isConversionProgressReport(v: unknown): v is ConversionProgressReport {
  return (
    rec(v) &&
    baseReport(v, "CONVERSION_PROGRESS_REPORT") &&
    rec(v.progress) &&
    only(v.progress, ["percent", "message"]) &&
    typeof v.progress.percent === "number" &&
    v.progress.percent >= 0 &&
    v.progress.percent <= 100 &&
    (v.progress.message === undefined || str(v.progress.message, 300)) &&
    v.expectedCurrentStatus === "RUNNING"
  );
}
export function isConversionOutputReadyReport(v: unknown): v is ConversionOutputReadyReport {
  return (
    rec(v) &&
    baseReport(v, "CONVERSION_OUTPUT_READY_REPORT") &&
    rec(v.output) &&
    req(v.output, ["uploadGrantId", "targetPath", "sha256", "sizeBytes", "mediaType"]) &&
    only(v.output, ["uploadGrantId", "targetPath", "sha256", "sizeBytes", "mediaType"]) &&
    typeof v.output.uploadGrantId === "string" &&
    /^sug_[0-9A-HJKMNP-TV-Z]{26}$/.test(v.output.uploadGrantId) &&
    path(v.output.targetPath) &&
    typeof v.output.sha256 === "string" &&
    SHA.test(v.output.sha256) &&
    pos(v.output.sizeBytes) &&
    v.output.mediaType === "text/markdown" &&
    v.expectedCurrentStatus === "RUNNING"
  );
}
export function isConversionVerificationReadyReport(
  v: unknown,
): v is ConversionVerificationReadyReport {
  return (
    rec(v) &&
    baseReport(v, "CONVERSION_VERIFICATION_READY_REPORT") &&
    str(v.stagingDescriptorRef, 200) &&
    typeof v.outputGrantId === "string" &&
    /^sug_[0-9A-HJKMNP-TV-Z]{26}$/.test(v.outputGrantId) &&
    v.expectedCurrentStatus === "RUNNING"
  );
}
export function isConversionFailedReport(v: unknown): v is ConversionFailedReport {
  return (
    rec(v) &&
    baseReport(v, "CONVERSION_FAILED_REPORT") &&
    rec(v.failure) &&
    req(v.failure, ["code", "message", "retryable"]) &&
    only(v.failure, ["code", "message", "retryable"]) &&
    str(v.failure.code, 100) &&
    str(v.failure.message, 1000) &&
    v.failure.retryable === false &&
    (v.expectedCurrentStatus === "RUNNING" || v.expectedCurrentStatus === "VERIFYING")
  );
}
export function isConversionLeaseRenewalRequest(v: unknown): v is ConversionLeaseRenewalRequest {
  return (
    rec(v) &&
    baseReport(v, "CONVERSION_LEASE_RENEWAL_REQUEST") &&
    pos(v.requestedDurationSeconds) &&
    Number(v.requestedDurationSeconds) <= 3600
  );
}
export function isConversionLeaseRenewalResult(v: unknown): v is ConversionLeaseRenewalResult {
  return (
    rec(v) &&
    req(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "conversionLeaseId",
      "conversionAttemptId",
      "workerId",
      "granted",
      "generation",
      "idempotencyKey",
      "occurredAt",
    ]) &&
    only(v, [
      "contractVersion",
      "objectType",
      "id",
      "workspaceId",
      "conversionLeaseId",
      "conversionAttemptId",
      "workerId",
      "granted",
      "generation",
      "expiresAt",
      "renewableUntil",
      "denialCode",
      "idempotencyKey",
      "occurredAt",
    ]) &&
    v.contractVersion === CONVERSION_RUNTIME_VERSION &&
    v.objectType === "CONVERSION_LEASE_RENEWAL_RESULT" &&
    typeof v.id === "string" &&
    ID.test(v.id) &&
    typeof v.workspaceId === "string" &&
    WSP.test(v.workspaceId) &&
    typeof v.conversionLeaseId === "string" &&
    CVL.test(v.conversionLeaseId) &&
    typeof v.conversionAttemptId === "string" &&
    CVA.test(v.conversionAttemptId) &&
    typeof v.workerId === "string" &&
    WRK.test(v.workerId) &&
    typeof v.granted === "boolean" &&
    pos(v.generation) &&
    typeof v.idempotencyKey === "string" &&
    KEY.test(v.idempotencyKey) &&
    time(v.occurredAt) &&
    !forbidden(v)
  );
}
export function isConversionLeaseReleaseRequest(v: unknown): v is ConversionLeaseReleaseRequest {
  return (
    rec(v) &&
    baseReport(v, "CONVERSION_LEASE_RELEASE_REQUEST") &&
    en(["WORKER_SHUTDOWN", "CANCELLED", "NO_LONGER_NEEDED"] as const, v.reason)
  );
}
export function isConversionLeaseLossReport(v: unknown): v is ConversionLeaseLossReport {
  return (
    rec(v) &&
    baseReport(v, "CONVERSION_LEASE_LOSS_REPORT") &&
    en(["EXPIRED", "SUPERSEDED", "REVOKED"] as const, v.lossReason)
  );
}
export function conversionCapabilitySupports(
  cap: ConversionWorkerCapability,
  need: {
    converterId: string;
    version: string;
    artifactKind: string;
    mimeType: string;
    outputFormat: string;
  },
): boolean {
  return (
    cap.supportedConverters.some(
      (c) => c.converterId === need.converterId && c.versions.includes(need.version),
    ) &&
    cap.acceptedArtifactKinds.includes(need.artifactKind as ArtifactKind) &&
    cap.acceptedMimePatterns.some((p) => mimePatternMatches(p, need.mimeType)) &&
    cap.supportedOutputFormats.includes(need.outputFormat as ConversionOutputFormat)
  );
}
export function isConversionLeaseActive(lease: ConversionLease, at: string): boolean {
  const t = Date.parse(at);
  return (
    lease.status === "ACTIVE" && Date.parse(lease.issuedAt) <= t && t < Date.parse(lease.expiresAt)
  );
}
export function isConversionLeaseExpired(lease: ConversionLease, at: string): boolean {
  return lease.status === "EXPIRED" || Date.parse(at) >= Date.parse(lease.expiresAt);
}
export function canRenewConversionLease(lease: ConversionLease, at: string): boolean {
  const t = Date.parse(at);
  return isConversionLeaseActive(lease, at) && t < Date.parse(lease.renewableUntil);
}
export function reportMatchesLease(report: RuntimeReportBase, lease: ConversionLease): boolean {
  return (
    report.workspaceId === lease.workspaceId &&
    report.workerId === lease.workerId &&
    report.conversionRunId === lease.conversionRunId &&
    report.conversionAttemptId === lease.conversionAttemptId &&
    report.conversionLeaseId === lease.id &&
    report.leaseGeneration === lease.generation &&
    report.leaseTokenReference === lease.tokenReference &&
    report.leaseTokenDigest === lease.tokenDigest
  );
}
export function authorizeRuntimeReport(
  report: RuntimeReportBase,
  lease: ConversionLease,
  currentStatus: ConversionRunStatus,
  at: string,
): "AUTHORIZED" | "REJECTED" {
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(currentStatus)) return "REJECTED";
  if (report.expectedCurrentStatus !== currentStatus) return "REJECTED";
  if (!reportMatchesLease(report, lease)) return "REJECTED";
  return isConversionLeaseActive(lease, at) ? "AUTHORIZED" : "REJECTED";
}
export function grantsMatchAttempt(
  read: RawArtifactReadGrant,
  upload: StagingOutputUploadGrant,
  attempt: ConversionAttempt,
): boolean {
  return (
    read.workspaceId === attempt.workspaceId &&
    upload.workspaceId === attempt.workspaceId &&
    read.conversionRunId === attempt.conversionRunId &&
    upload.conversionRunId === attempt.conversionRunId &&
    read.conversionAttemptId === attempt.id &&
    upload.conversionAttemptId === attempt.id &&
    read.workerId === attempt.workerId &&
    upload.workerId === attempt.workerId
  );
}
export function normalizeStagingTargetPath(value: string): string | null {
  const p = value.replace(/\\+/g, "/").replace(/^\.\//, "");
  return path(p) ? p : null;
}
export function classifyConversionLeaseLoss(input: {
  lease: ConversionLease;
  attempt: ConversionAttempt;
  runStatus: ConversionRunStatus;
}): ConversionLeaseLossClassification {
  if (input.lease.status === "SUPERSEDED") return "SUPERSEDED";
  if (input.runStatus === "VERIFYING") return "VERIFYING_VERIFIER_OWNS_CONTINUATION";
  return input.attempt.startedAt === undefined
    ? "LOST_BEFORE_STARTED_RECLAIMABLE"
    : "LOST_AFTER_STARTED_FAIL_RUN";
}
export function resolveRuntimeIdempotency(
  previousPayloadJson: string | undefined,
  nextPayloadJson: string,
): "NEW" | "REPLAY" | "CONFLICT" {
  if (previousPayloadJson === undefined) return "NEW";
  return previousPayloadJson === nextPayloadJson ? "REPLAY" : "CONFLICT";
}

export function canUseRawArtifactReadGrant(
  grant: RawArtifactReadGrant,
  expected: {
    workspaceId: string;
    rawArtifactId: string;
    conversionRunId: string;
    conversionAttemptId: string;
    workerId: string;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
  },
  at: string,
): boolean {
  return (
    isRawArtifactReadGrant(grant) &&
    Date.parse(at) < Date.parse(grant.expiresAt) &&
    grant.readsUsed < grant.maximumReads &&
    grant.workspaceId === expected.workspaceId &&
    grant.rawArtifactId === expected.rawArtifactId &&
    grant.conversionRunId === expected.conversionRunId &&
    grant.conversionAttemptId === expected.conversionAttemptId &&
    grant.workerId === expected.workerId &&
    grant.expectedSha256 === expected.sha256 &&
    grant.expectedBytes === expected.sizeBytes &&
    grant.expectedMime === expected.mimeType
  );
}
export function canUseStagingOutputUploadGrant(
  grant: StagingOutputUploadGrant,
  expected: {
    workspaceId: string;
    conversionRunId: string;
    conversionAttemptId: string;
    workerId: string;
    targetPath: string;
  },
  at: string,
): boolean {
  return (
    isStagingOutputUploadGrant(grant) &&
    Date.parse(at) < Date.parse(grant.expiresAt) &&
    grant.workspaceId === expected.workspaceId &&
    grant.conversionRunId === expected.conversionRunId &&
    grant.conversionAttemptId === expected.conversionAttemptId &&
    grant.workerId === expected.workerId &&
    grant.normalizedTargetPath === expected.targetPath
  );
}
function canonicalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!rec(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = canonicalize(value[key]);
    if (child !== undefined) out[key] = child;
  }
  return out;
}
export function canonicalRuntimePayload(value: unknown): string | null {
  if (forbidden(value)) return null;
  const serialized = JSON.stringify(canonicalize(value));
  return serialized.length <= CONVERSION_RUNTIME_LIMITS.maxCanonicalPayloadBytes
    ? serialized
    : null;
}
export function resolveRuntimeReportIdempotency(
  previous: { key: string; canonicalPayload: string } | undefined,
  next: { key: string; payload: unknown },
): "NEW" | "REPLAY" | "CONFLICT" | "REJECTED" {
  if (!KEY.test(next.key)) return "REJECTED";
  const payload = canonicalRuntimePayload(next.payload);
  if (payload === null) return "REJECTED";
  if (previous === undefined || previous.key !== next.key) return "NEW";
  return previous.canonicalPayload === payload ? "REPLAY" : "CONFLICT";
}
export function verifierCanComplete(input: {
  verifierId?: string;
  runStatus: ConversionRunStatus;
  descriptor: {
    status: string;
    workspaceId?: string;
    conversionRunId: string;
    rawArtifactId?: string;
    targetPath?: string;
    contentHash?: { algorithm: string; value: string };
    sizeBytes?: number;
    converter: RuntimeConverterRef;
    provenance?: { conversionAttemptId: string; workerId: string };
  };
  workspaceId?: string;
  runId: string;
  rawArtifactId?: string;
  targetPath?: string;
  converter: RuntimeConverterRef;
  attemptId?: string;
  workerId?: string;
}): boolean {
  return (
    !!input.verifierId &&
    input.runStatus === "VERIFYING" &&
    input.descriptor.status === "READY" &&
    input.descriptor.conversionRunId === input.runId &&
    (input.workspaceId === undefined || input.descriptor.workspaceId === input.workspaceId) &&
    (input.rawArtifactId === undefined || input.descriptor.rawArtifactId === input.rawArtifactId) &&
    (input.targetPath === undefined || input.descriptor.targetPath === input.targetPath) &&
    (input.attemptId === undefined ||
      input.descriptor.provenance?.conversionAttemptId === input.attemptId) &&
    (input.workerId === undefined || input.descriptor.provenance?.workerId === input.workerId) &&
    input.descriptor.contentHash?.algorithm === "SHA-256" &&
    typeof input.descriptor.contentHash.value === "string" &&
    SHA.test(input.descriptor.contentHash.value) &&
    pos(input.descriptor.sizeBytes) &&
    input.descriptor.converter.converterId === input.converter.converterId &&
    input.descriptor.converter.version === input.converter.version
  );
}
