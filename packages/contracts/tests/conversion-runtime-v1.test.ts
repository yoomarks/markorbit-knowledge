import { describe, expect, it } from "vitest";
import {
  authorizeRuntimeReport,
  canonicalRuntimePayload,
  canRenewConversionLease,
  canUseRawArtifactReadGrant,
  canUseStagingOutputUploadGrant,
  classifyConversionLeaseLoss,
  conversionCapabilitySupports,
  grantsMatchAttempt,
  isConversionAttempt,
  isConversionClaimRequest,
  isConversionClaimResult,
  isConversionFailedReport,
  isConversionLease,
  isConversionLeaseActive,
  isConversionLeaseExpired,
  isConversionLeaseLossReport,
  isConversionLeaseReleaseRequest,
  isConversionLeaseRenewalRequest,
  isConversionLeaseRenewalResult,
  isConversionOutputReadyReport,
  isConversionProgressReport,
  isConversionStartedReport,
  isConversionVerificationReadyReport,
  isConversionWorkerCapability,
  isRawArtifactReadGrant,
  isStagingOutputUploadGrant,
  normalizeStagingTargetPath,
  reportMatchesLease,
  resolveRuntimeIdempotency,
  resolveRuntimeReportIdempotency,
  verifierCanComplete,
  type ConversionAttempt,
  type ConversionLease,
  type ConversionWorkerCapability,
  type RawArtifactReadGrant,
  type RuntimeReportBase,
  type StagingOutputUploadGrant,
} from "../src/conversion-runtime-v1";

const A = "01HZY3Q4R5S6T7V8W9X0Y1Z2A3";
const B = "01HZY3Q4R5S6T7V8W9X0Y1Z2B4";
const now = "2026-07-17T00:00:00Z";
const mid = "2026-07-17T00:05:00Z";
const later = "2026-07-17T00:10:00Z";
const renew = "2026-07-17T01:00:00Z";
const sha = "a".repeat(64);
const shaB = "b".repeat(64);
const converter = { converterId: "builtin-text-markdown", version: "1.0.0" };

const capability = (): ConversionWorkerCapability => ({
  contractVersion: "1.0",
  objectType: "CONVERSION_WORKER_CAPABILITY",
  id: `cwc_${A}`,
  workerId: `wrk_${A}`,
  capabilityRevision: 1,
  supportedConverters: [{ converterId: "builtin-text-markdown", versions: ["1.0.0", "1.0.1"] }],
  acceptedArtifactKinds: ["TEXT"],
  acceptedMimePatterns: ["text/plain"],
  supportedOutputFormats: ["MARKDOWN"],
  runtime: { runtimeId: "fixture-runtime", version: "1.0.0" },
  createdAt: now,
});
const lease = (): ConversionLease => ({
  contractVersion: "1.0",
  objectType: "CONVERSION_LEASE",
  id: `cvl_${A}`,
  workspaceId: `wsp_${A}`,
  conversionRunId: `cvr_${A}`,
  workerId: `wrk_${A}`,
  conversionAttemptId: `cva_${A}`,
  converter,
  generation: 1,
  tokenReference: "rtk_conversion_lease_reference",
  tokenDigest: sha,
  status: "ACTIVE",
  issuedAt: now,
  expiresAt: later,
  renewableUntil: renew,
});
const attempt = (): ConversionAttempt => ({
  contractVersion: "1.0",
  objectType: "CONVERSION_ATTEMPT",
  id: `cva_${A}`,
  workspaceId: `wsp_${A}`,
  conversionRunId: `cvr_${A}`,
  workerId: `wrk_${A}`,
  conversionLeaseId: `cvl_${A}`,
  ordinal: 1,
  converter,
  createdAt: now,
  status: "CLAIMED",
});
const readGrant = (): RawArtifactReadGrant => ({
  contractVersion: "1.0",
  objectType: "RAW_ARTIFACT_READ_GRANT",
  id: `rag_${A}`,
  workspaceId: `wsp_${A}`,
  rawArtifactId: `art_${A}`,
  conversionRunId: `cvr_${A}`,
  conversionAttemptId: `cva_${A}`,
  workerId: `wrk_${A}`,
  expectedSha256: sha,
  expectedBytes: 42,
  expectedMime: "text/plain",
  accessRef: "artifact-read-reference",
  issuedAt: now,
  expiresAt: later,
  maximumReads: 1,
  readsUsed: 0,
  usagePolicy: "CONVERSION_INPUT_ONLY",
  tokenReference: "rtk_read_grant_reference",
  tokenDigest: sha,
});
const uploadGrant = (): StagingOutputUploadGrant => ({
  contractVersion: "1.0",
  objectType: "STAGING_OUTPUT_UPLOAD_GRANT",
  id: `sug_${A}`,
  workspaceId: `wsp_${A}`,
  conversionRunId: `cvr_${A}`,
  conversionAttemptId: `cva_${A}`,
  workerId: `wrk_${A}`,
  normalizedTargetPath: "notes/example.md",
  allowedMediaType: "text/markdown",
  maximumBytes: 1000,
  requiredDigestAlgorithm: "SHA-256",
  uploadSessionRef: "staging-upload-reference",
  issuedAt: now,
  expiresAt: later,
  tokenReference: "rtk_upload_grant_reference",
  tokenDigest: sha,
  allowedContentCount: 1,
  expectedProvenancePolicy: "CONVERSION_ATTEMPT_BOUND",
});
const reportBase = (): Omit<RuntimeReportBase, "objectType" | "expectedCurrentStatus"> => ({
  contractVersion: "1.0",
  id: `rpt_${A}`,
  workspaceId: `wsp_${A}`,
  workerId: `wrk_${A}`,
  workerCredentialId: "worker-credential-ref",
  conversionRunId: `cvr_${A}`,
  conversionAttemptId: `cva_${A}`,
  conversionLeaseId: `cvl_${A}`,
  leaseGeneration: 1,
  leaseTokenReference: "rtk_conversion_lease_reference",
  leaseTokenDigest: sha,
  idempotencyKey: "idem-1",
  occurredAt: now,
});
const claimedResult = () => ({
  contractVersion: "1.0" as const,
  objectType: "CONVERSION_CLAIM_RESULT" as const,
  id: `ccs_${A}`,
  workspaceId: `wsp_${A}`,
  workerId: `wrk_${A}`,
  result: "CLAIMED" as const,
  idempotencyKey: "claim-1",
  lease: lease(),
  converter,
  executionSummary: {
    conversionRunId: `cvr_${A}`,
    rawArtifactId: `art_${A}`,
    artifactKind: "TEXT",
    mimeType: "text/plain",
    sha256: sha,
    sizeBytes: 42,
    requestedOutputFormat: "MARKDOWN",
    targetPathTemplate: "notes/example.md",
  },
  rawArtifactReadGrant: readGrant(),
  stagingOutputUploadGrant: uploadGrant(),
});
const patch = <T extends object>(value: T, updates: Record<string, unknown>): T =>
  ({ ...value, ...updates }) as T;

describe("capability guards", () => {
  it("accepts one exact converter version and multiple exact versions", () => {
    expect(
      isConversionWorkerCapability(
        patch(capability(), {
          supportedConverters: [{ converterId: "builtin-text-markdown", versions: ["1.0.0"] }],
        }),
      ),
    ).toBe(true);
    expect(isConversionWorkerCapability(capability())).toBe(true);
  });

  it("rejects duplicate, wildcard, range, latest/any and malformed versions", () => {
    for (const versions of [
      ["1.0.0", "1.0.0"],
      ["*"],
      ["latest"],
      ["any"],
      ["^1.0.0"],
      ["~1.0.0"],
      [">=1.0.0"],
      ["1"],
    ]) {
      expect(
        isConversionWorkerCapability(
          patch(capability(), {
            supportedConverters: [{ converterId: "builtin-text-markdown", versions }],
          }),
        ),
      ).toBe(false);
    }
  });

  it("rejects excessive entries, revision and unsafe runtime metadata", () => {
    expect(
      isConversionWorkerCapability(
        patch(capability(), {
          supportedConverters: Array.from({ length: 51 }, (_, index) => ({
            converterId: `conv-${index}`,
            versions: ["1.0.0"],
          })),
        }),
      ),
    ).toBe(false);
    expect(
      isConversionWorkerCapability(
        patch(capability(), {
          supportedConverters: [
            {
              converterId: "builtin-text-markdown",
              versions: Array.from({ length: 51 }, (_, index) => `1.0.${index}`),
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isConversionWorkerCapability(
        patch(capability(), { acceptedArtifactKinds: Array.from({ length: 21 }, () => "TEXT") }),
      ),
    ).toBe(false);
    expect(
      isConversionWorkerCapability(patch(capability(), { capabilityRevision: 1_000_001 })),
    ).toBe(false);
    expect(
      isConversionWorkerCapability({
        ...capability(),
        runtime: { runtimeId: "fixture-runtime", version: "1.0.0", executablePath: "/bin/run" },
      }),
    ).toBe(false);
    expect(isConversionWorkerCapability({ ...capability(), command: "node converter.js" })).toBe(
      false,
    );
    expect(
      isConversionWorkerCapability({
        ...capability(),
        extensions: { "x-safe": "ok", "x-secret": "no" },
      }),
    ).toBe(false);
  });
});

describe("lease guards", () => {
  it("accepts active, released, expired and superseded leases with canonical token reference/digest", () => {
    expect(isConversionLease(lease())).toBe(true);
    expect(isConversionLease({ ...lease(), status: "RELEASED", releasedAt: mid })).toBe(true);
    expect(isConversionLease({ ...lease(), status: "EXPIRED", expiredAt: later })).toBe(true);
    expect(
      isConversionLease({ ...lease(), status: "SUPERSEDED", supersededAt: mid, generation: 2 }),
    ).toBe(true);
  });

  it("rejects plaintext token fields, unknown nested fields and invalid IDs", () => {
    expect(isConversionLease({ ...lease(), token: "plaintext" })).toBe(false);
    expect(isConversionLease({ ...lease(), bearerToken: "plaintext" })).toBe(false);
    expect(isConversionLease({ ...lease(), credential: "secret" })).toBe(false);
    expect(isConversionLease({ ...lease(), converter: { ...converter, command: "run" } })).toBe(
      false,
    );
    expect(isConversionLease({ ...lease(), workerId: `wrk_${B}` })).toBe(true);
    expect(isConversionLease({ ...lease(), workerId: "worker-plain" })).toBe(false);
  });

  it("enforces status/timestamp consistency and renewal windows", () => {
    expect(isConversionLease(patch(lease(), { expiresAt: "2026-07-16T00:00:00Z" }))).toBe(false);
    expect(isConversionLease({ ...lease(), status: "ACTIVE", releasedAt: mid })).toBe(false);
    expect(isConversionLease({ ...lease(), status: "RELEASED" })).toBe(false);
    expect(
      isConversionLease({ ...lease(), status: "EXPIRED", expiredAt: "2026-07-16T00:00:00Z" }),
    ).toBe(false);
    expect(
      isConversionLease({ ...lease(), status: "SUPERSEDED", supersededAt: mid, expiredAt: later }),
    ).toBe(false);
    expect(isConversionLeaseActive(lease(), mid)).toBe(true);
    expect(isConversionLeaseExpired(lease(), "2026-07-17T00:11:00Z")).toBe(true);
    expect(canRenewConversionLease(lease(), mid)).toBe(true);
    expect(canRenewConversionLease(lease(), "2026-07-17T01:01:00Z")).toBe(false);
  });
});

describe("attempt guards", () => {
  it("accepts each execution-attempt state without granting completed authority", () => {
    for (const status of [
      "CLAIMED",
      "STARTED",
      "OUTPUT_REPORTED",
      "FAILED",
      "ABANDONED",
      "LEASE_LOST",
    ] as const) {
      expect(isConversionAttempt({ ...attempt(), status })).toBe(true);
    }
    expect(isConversionAttempt({ ...attempt(), status: "COMPLETED" })).toBe(false);
  });

  it("rejects illegal timestamps, success-like outcomes, unknown fields, content and secrets", () => {
    expect(isConversionAttempt({ ...attempt(), createdAt: "not-time" })).toBe(false);
    expect(isConversionAttempt({ ...attempt(), outcome: "COMPLETED" })).toBe(false);
    expect(
      isConversionAttempt({
        ...attempt(),
        failure: { code: "FAIL", message: "bad", retryable: true },
      }),
    ).toBe(false);
    expect(isConversionAttempt({ ...attempt(), markdown: "# content" })).toBe(false);
    expect(isConversionAttempt({ ...attempt(), extensions: { "x-command": "run" } })).toBe(false);
  });
});

describe("claim guards", () => {
  it("accepts valid no-work and claimed-work results", () => {
    expect(
      isConversionClaimRequest({
        contractVersion: "1.0",
        objectType: "CONVERSION_CLAIM_REQUEST",
        id: `ccr_${A}`,
        workspaceId: `wsp_${A}`,
        workerId: `wrk_${A}`,
        workerCredentialId: "worker-credential-ref",
        capabilityRevision: 1,
        supportedConverters: capability().supportedConverters,
        maxAcceptedWork: 1,
        idempotencyKey: "claim-1",
        requestedLeaseDurationSeconds: 300,
      }),
    ).toBe(true);
    expect(
      isConversionClaimResult({
        contractVersion: "1.0",
        objectType: "CONVERSION_CLAIM_RESULT",
        id: `ccs_${A}`,
        workspaceId: `wsp_${A}`,
        workerId: `wrk_${A}`,
        result: "NO_COMPATIBLE_WORK",
        idempotencyKey: "claim-1",
      }),
    ).toBe(true);
    expect(isConversionClaimResult(claimedResult())).toBe(true);
  });

  it("rejects no-work with grants and claimed-work identity/evidence mismatches", () => {
    expect(
      isConversionClaimResult({
        contractVersion: "1.0",
        objectType: "CONVERSION_CLAIM_RESULT",
        id: `ccs_${A}`,
        workspaceId: `wsp_${A}`,
        workerId: `wrk_${A}`,
        result: "NO_COMPATIBLE_WORK",
        idempotencyKey: "claim-1",
        lease: lease(),
      }),
    ).toBe(false);
    expect(
      isConversionClaimResult({
        ...claimedResult(),
        rawArtifactReadGrant: { ...readGrant(), workerId: `wrk_${B}` },
      }),
    ).toBe(false);
    expect(
      isConversionClaimResult({
        ...claimedResult(),
        stagingOutputUploadGrant: { ...uploadGrant(), conversionAttemptId: `cva_${B}` },
      }),
    ).toBe(false);
    expect(
      isConversionClaimResult({
        ...claimedResult(),
        converter: { converterId: "builtin-text-markdown", version: "2.0.0" },
      }),
    ).toBe(false);
    expect(
      isConversionClaimResult({
        ...claimedResult(),
        executionSummary: { ...claimedResult().executionSummary, sha256: shaB },
      }),
    ).toBe(false);
  });

  it("rejects embedded credentials, provider config, RawArtifact bytes, Markdown and unknown fields", () => {
    expect(
      isConversionClaimResult({
        ...claimedResult(),
        sourceConfig: { url: "https://example.test", tokenValue: "secret" },
      }),
    ).toBe(false);
    expect(isConversionClaimResult({ ...claimedResult(), rawArtifactBytes: "abc" })).toBe(false);
    expect(isConversionClaimResult({ ...claimedResult(), markdown: "# generated" })).toBe(false);
    expect(
      isConversionClaimResult({
        ...claimedResult(),
        rawArtifactReadGrant: { ...readGrant(), accessRef: "https://example.test?token=plaintext" },
      }),
    ).toBe(false);
  });
});

describe("report guards", () => {
  const started = () => ({
    ...reportBase(),
    objectType: "CONVERSION_STARTED_REPORT" as const,
    expectedCurrentStatus: "PENDING" as const,
    converter,
  });
  const progress = () => ({
    ...reportBase(),
    objectType: "CONVERSION_PROGRESS_REPORT" as const,
    expectedCurrentStatus: "RUNNING" as const,
    progress: { percent: 50, message: "half" },
  });
  const output = () => ({
    ...reportBase(),
    objectType: "CONVERSION_OUTPUT_READY_REPORT",
    expectedCurrentStatus: "RUNNING",
    output: {
      uploadGrantId: `sug_${A}`,
      targetPath: "notes/example.md",
      sha256: sha,
      sizeBytes: 12,
      mediaType: "text/markdown",
    },
  });
  const verify = () => ({
    ...reportBase(),
    objectType: "CONVERSION_VERIFICATION_READY_REPORT",
    expectedCurrentStatus: "RUNNING",
    stagingDescriptorRef: "descriptor-ref",
    outputGrantId: `sug_${A}`,
  });
  const failed = () => ({
    ...reportBase(),
    objectType: "CONVERSION_FAILED_REPORT",
    expectedCurrentStatus: "RUNNING",
    failure: {
      code: "LEASE_EXPIRED_DURING_CONVERSION",
      message: "Lease expired",
      retryable: false,
    },
  });

  it("validates started reports and rejects wrong identity, generation, stale status and terminal/expired authorization", () => {
    expect(isConversionStartedReport(started())).toBe(true);
    expect(reportMatchesLease(started(), lease())).toBe(true);
    expect(reportMatchesLease({ ...started(), workerId: `wrk_${B}` }, lease())).toBe(false);
    expect(reportMatchesLease({ ...started(), conversionAttemptId: `cva_${B}` }, lease())).toBe(
      false,
    );
    expect(reportMatchesLease({ ...started(), conversionLeaseId: `cvl_${B}` }, lease())).toBe(
      false,
    );
    expect(reportMatchesLease({ ...started(), leaseGeneration: 2 }, lease())).toBe(false);
    expect(isConversionStartedReport({ ...started(), expectedCurrentStatus: "RUNNING" })).toBe(
      false,
    );
    expect(authorizeRuntimeReport(started(), lease(), "PENDING", mid)).toBe("AUTHORIZED");
    expect(authorizeRuntimeReport(started(), lease(), "COMPLETED", mid)).toBe("REJECTED");
    expect(authorizeRuntimeReport(started(), lease(), "PENDING", "2026-07-17T00:11:00Z")).toBe(
      "REJECTED",
    );
  });

  it("validates progress bounds and content isolation", () => {
    expect(isConversionProgressReport(progress())).toBe(true);
    expect(isConversionProgressReport({ ...progress(), progress: { percent: -1 } })).toBe(false);
    expect(isConversionProgressReport({ ...progress(), progress: { percent: 101 } })).toBe(false);
    expect(
      isConversionProgressReport({
        ...progress(),
        progress: { percent: 1, message: "x".repeat(301) },
      }),
    ).toBe(false);
    expect(isConversionProgressReport({ ...progress(), expectedCurrentStatus: "PENDING" })).toBe(
      false,
    );
    expect(isConversionProgressReport({ ...progress(), body: "large content" })).toBe(false);
  });

  it("validates output-ready evidence without verification authority", () => {
    expect(isConversionOutputReadyReport(output())).toBe(true);
    expect(
      isConversionOutputReadyReport({
        ...output(),
        output: { ...output().output, uploadGrantId: `sug_${B}` },
      }),
    ).toBe(true);
    expect(
      canUseStagingOutputUploadGrant(
        uploadGrant(),
        {
          workspaceId: `wsp_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          targetPath: output().output.targetPath,
        },
        mid,
      ),
    ).toBe(true);
    expect(
      canUseStagingOutputUploadGrant(
        uploadGrant(),
        {
          workspaceId: `wsp_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          targetPath: "notes/other.md",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      isConversionOutputReadyReport({ ...output(), output: { ...output().output, sha256: "bad" } }),
    ).toBe(false);
    expect(
      isConversionOutputReadyReport({ ...output(), output: { ...output().output, sizeBytes: 0 } }),
    ).toBe(false);
    expect(
      isConversionOutputReadyReport({
        ...output(),
        output: { ...output().output, targetPath: "../x.md" },
      }),
    ).toBe(false);
    expect(
      isConversionOutputReadyReport({
        ...output(),
        output: { ...output().output, markdown: "# pass" },
      }),
    ).toBe(false);
  });

  it("keeps verification-ready as verifier-input metadata, not PASS/READY/COMPLETED authority", () => {
    expect(isConversionVerificationReadyReport(verify())).toBe(true);
    expect(isConversionVerificationReadyReport({ ...verify(), verification: "PASS" })).toBe(false);
    expect(isConversionVerificationReadyReport({ ...verify(), status: "READY" })).toBe(false);
    expect(
      isConversionVerificationReadyReport({ ...verify(), expectedCurrentStatus: "VERIFYING" }),
    ).toBe(false);
  });

  it("validates failed reports and lease maintenance/loss messages", () => {
    expect(isConversionFailedReport(failed())).toBe(true);
    expect(
      isConversionFailedReport({ ...failed(), failure: { message: "missing", retryable: false } }),
    ).toBe(false);
    expect(
      isConversionFailedReport({
        ...failed(),
        failure: { code: "FAIL", message: "x".repeat(1001), retryable: false },
      }),
    ).toBe(false);
    expect(
      isConversionFailedReport({
        ...failed(),
        failure: { code: "FAIL", message: "secret", retryable: false, secret: "x" },
      }),
    ).toBe(false);
    expect(isConversionFailedReport({ ...failed(), expectedCurrentStatus: "COMPLETED" })).toBe(
      false,
    );
    expect(
      isConversionLeaseRenewalRequest({
        ...reportBase(),
        objectType: "CONVERSION_LEASE_RENEWAL_REQUEST",
        expectedCurrentStatus: "RUNNING",
        requestedDurationSeconds: 300,
      }),
    ).toBe(true);
    expect(
      isConversionLeaseRenewalResult({
        contractVersion: "1.0",
        objectType: "CONVERSION_LEASE_RENEWAL_RESULT",
        id: `rnr_${A}`,
        workspaceId: `wsp_${A}`,
        conversionLeaseId: `cvl_${A}`,
        conversionAttemptId: `cva_${A}`,
        workerId: `wrk_${A}`,
        granted: true,
        generation: 2,
        idempotencyKey: "renew-1",
        occurredAt: now,
        expiresAt: later,
        renewableUntil: renew,
      }),
    ).toBe(true);
    expect(
      isConversionLeaseReleaseRequest({
        ...reportBase(),
        objectType: "CONVERSION_LEASE_RELEASE_REQUEST",
        expectedCurrentStatus: "RUNNING",
        reason: "NO_LONGER_NEEDED",
      }),
    ).toBe(true);
    expect(
      isConversionLeaseLossReport({
        ...reportBase(),
        objectType: "CONVERSION_LEASE_LOSS_REPORT",
        expectedCurrentStatus: "RUNNING",
        lossReason: "EXPIRED",
      }),
    ).toBe(true);
  });
});

describe("read grant guards", () => {
  it("accepts a scoped valid grant and read-use helper", () => {
    expect(isRawArtifactReadGrant(readGrant())).toBe(true);
    expect(
      canUseRawArtifactReadGrant(
        readGrant(),
        {
          workspaceId: `wsp_${A}`,
          rawArtifactId: `art_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          sha256: sha,
          sizeBytes: 42,
          mimeType: "text/plain",
        },
        mid,
      ),
    ).toBe(true);
  });

  it("rejects scope/evidence mismatches, expiry and read exhaustion", () => {
    expect(
      canUseRawArtifactReadGrant(
        readGrant(),
        {
          workspaceId: `wsp_${B}`,
          rawArtifactId: `art_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          sha256: sha,
          sizeBytes: 42,
          mimeType: "text/plain",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseRawArtifactReadGrant(
        readGrant(),
        {
          workspaceId: `wsp_${A}`,
          rawArtifactId: `art_${B}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          sha256: sha,
          sizeBytes: 42,
          mimeType: "text/plain",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseRawArtifactReadGrant(
        readGrant(),
        {
          workspaceId: `wsp_${A}`,
          rawArtifactId: `art_${A}`,
          conversionRunId: `cvr_${B}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          sha256: sha,
          sizeBytes: 42,
          mimeType: "text/plain",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseRawArtifactReadGrant(
        readGrant(),
        {
          workspaceId: `wsp_${A}`,
          rawArtifactId: `art_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${B}`,
          workerId: `wrk_${A}`,
          sha256: sha,
          sizeBytes: 42,
          mimeType: "text/plain",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseRawArtifactReadGrant(
        readGrant(),
        {
          workspaceId: `wsp_${A}`,
          rawArtifactId: `art_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${B}`,
          sha256: sha,
          sizeBytes: 42,
          mimeType: "text/plain",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseRawArtifactReadGrant(
        readGrant(),
        {
          workspaceId: `wsp_${A}`,
          rawArtifactId: `art_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          sha256: shaB,
          sizeBytes: 42,
          mimeType: "text/plain",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseRawArtifactReadGrant(
        readGrant(),
        {
          workspaceId: `wsp_${A}`,
          rawArtifactId: `art_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          sha256: sha,
          sizeBytes: 43,
          mimeType: "text/plain",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseRawArtifactReadGrant(
        readGrant(),
        {
          workspaceId: `wsp_${A}`,
          rawArtifactId: `art_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          sha256: sha,
          sizeBytes: 42,
          mimeType: "text/html",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseRawArtifactReadGrant(
        { ...readGrant(), readsUsed: 1 },
        {
          workspaceId: `wsp_${A}`,
          rawArtifactId: `art_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          sha256: sha,
          sizeBytes: 42,
          mimeType: "text/plain",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseRawArtifactReadGrant(
        readGrant(),
        {
          workspaceId: `wsp_${A}`,
          rawArtifactId: `art_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          sha256: sha,
          sizeBytes: 42,
          mimeType: "text/plain",
        },
        "2026-07-17T00:11:00Z",
      ),
    ).toBe(false);
  });

  it("rejects plaintext bearer tokens, unsafe references, content and unknown fields", () => {
    expect(isRawArtifactReadGrant({ ...readGrant(), maximumReads: 0 })).toBe(false);
    expect(isRawArtifactReadGrant({ ...readGrant(), readsUsed: 2 })).toBe(false);
    expect(
      isRawArtifactReadGrant({
        ...readGrant(),
        accessRef: "https://example.test/download?token=plain",
      }),
    ).toBe(false);
    expect(isRawArtifactReadGrant({ ...readGrant(), bearerToken: "plain" })).toBe(false);
    expect(isRawArtifactReadGrant({ ...readGrant(), content: "raw bytes" })).toBe(false);
    expect(isRawArtifactReadGrant({ ...readGrant(), nested: { ok: true } })).toBe(false);
  });
});

describe("upload grant guards", () => {
  it("accepts valid relative markdown path and helper scope", () => {
    expect(isStagingOutputUploadGrant(uploadGrant())).toBe(true);
    expect(
      canUseStagingOutputUploadGrant(
        uploadGrant(),
        {
          workspaceId: `wsp_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          targetPath: "notes/example.md",
        },
        mid,
      ),
    ).toBe(true);
    expect(normalizeStagingTargetPath("./notes/example.md")).toBe("notes/example.md");
  });

  it("rejects unsafe paths and normalized path changes", () => {
    for (const normalizedTargetPath of [
      "/abs.md",
      "C:\\vault\\x.md",
      "../x.md",
      "x.txt",
      "report.txt.md",
      "bad\u0000.md",
      "vault/x.md",
      ".obsidian/config.md",
    ]) {
      expect(isStagingOutputUploadGrant({ ...uploadGrant(), normalizedTargetPath })).toBe(false);
    }
    expect(normalizeStagingTargetPath("../x.md")).toBeNull();
  });

  it("rejects unsupported media, size, expiry, scope, plaintext tokens and content", () => {
    expect(isStagingOutputUploadGrant({ ...uploadGrant(), allowedMediaType: "text/plain" })).toBe(
      false,
    );
    expect(isStagingOutputUploadGrant({ ...uploadGrant(), maximumBytes: 0 })).toBe(false);
    expect(isStagingOutputUploadGrant({ ...uploadGrant(), maximumBytes: 5_000_001 })).toBe(false);
    expect(
      canUseStagingOutputUploadGrant(
        uploadGrant(),
        {
          workspaceId: `wsp_${B}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          targetPath: "notes/example.md",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseStagingOutputUploadGrant(
        uploadGrant(),
        {
          workspaceId: `wsp_${A}`,
          conversionRunId: `cvr_${B}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          targetPath: "notes/example.md",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseStagingOutputUploadGrant(
        uploadGrant(),
        {
          workspaceId: `wsp_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${B}`,
          workerId: `wrk_${A}`,
          targetPath: "notes/example.md",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseStagingOutputUploadGrant(
        uploadGrant(),
        {
          workspaceId: `wsp_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${B}`,
          targetPath: "notes/example.md",
        },
        mid,
      ),
    ).toBe(false);
    expect(
      canUseStagingOutputUploadGrant(
        uploadGrant(),
        {
          workspaceId: `wsp_${A}`,
          conversionRunId: `cvr_${A}`,
          conversionAttemptId: `cva_${A}`,
          workerId: `wrk_${A}`,
          targetPath: "notes/example.md",
        },
        "2026-07-17T00:11:00Z",
      ),
    ).toBe(false);
    expect(
      isStagingOutputUploadGrant({
        ...uploadGrant(),
        uploadSessionRef: "https://example.test?token=plain",
      }),
    ).toBe(false);
    expect(isStagingOutputUploadGrant({ ...uploadGrant(), allowedContentCount: 2 })).toBe(false);
    expect(isStagingOutputUploadGrant({ ...uploadGrant(), markdown: "# content" })).toBe(false);
    expect(isStagingOutputUploadGrant({ ...uploadGrant(), unknown: true })).toBe(false);
  });
});

describe("authorization helpers", () => {
  it("matches exact converter capability and rejects incompatible work", () => {
    expect(
      conversionCapabilitySupports(capability(), {
        converterId: "builtin-text-markdown",
        version: "1.0.0",
        artifactKind: "TEXT",
        mimeType: "text/plain",
        outputFormat: "MARKDOWN",
      }),
    ).toBe(true);
    expect(
      conversionCapabilitySupports(capability(), {
        converterId: "builtin-text-markdown",
        version: "2.0.0",
        artifactKind: "TEXT",
        mimeType: "text/plain",
        outputFormat: "MARKDOWN",
      }),
    ).toBe(false);
    expect(
      conversionCapabilitySupports(capability(), {
        converterId: "builtin-text-markdown",
        version: "1.0.0",
        artifactKind: "PDF",
        mimeType: "application/pdf",
        outputFormat: "MARKDOWN",
      }),
    ).toBe(false);
    expect(
      conversionCapabilitySupports(capability(), {
        converterId: "builtin-text-markdown",
        version: "1.0.0",
        artifactKind: "TEXT",
        mimeType: "text/html",
        outputFormat: "MARKDOWN",
      }),
    ).toBe(false);
  });

  it("matches read/upload grants to one attempt", () => {
    expect(grantsMatchAttempt(readGrant(), uploadGrant(), attempt())).toBe(true);
    expect(
      grantsMatchAttempt({ ...readGrant(), workerId: `wrk_${B}` }, uploadGrant(), attempt()),
    ).toBe(false);
    expect(
      grantsMatchAttempt(readGrant(), { ...uploadGrant(), conversionRunId: `cvr_${B}` }, attempt()),
    ).toBe(false);
  });
});

describe("lease-loss helpers", () => {
  it("classifies reclaim, fail, superseded and verifier-owned continuation without retry", () => {
    expect(
      classifyConversionLeaseLoss({ lease: lease(), attempt: attempt(), runStatus: "RUNNING" }),
    ).toBe("LOST_BEFORE_STARTED_RECLAIMABLE");
    expect(
      classifyConversionLeaseLoss({
        lease: lease(),
        attempt: { ...attempt(), startedAt: now, status: "STARTED" },
        runStatus: "RUNNING",
      }),
    ).toBe("LOST_AFTER_STARTED_FAIL_RUN");
    expect(
      classifyConversionLeaseLoss({
        lease: { ...lease(), status: "SUPERSEDED", supersededAt: mid },
        attempt: attempt(),
        runStatus: "RUNNING",
      }),
    ).toBe("SUPERSEDED");
    expect(
      classifyConversionLeaseLoss({
        lease: lease(),
        attempt: { ...attempt(), startedAt: now, status: "OUTPUT_REPORTED" },
        runStatus: "VERIFYING",
      }),
    ).toBe("VERIFYING_VERIFIER_OWNS_CONTINUATION");
  });
});

describe("idempotency helpers", () => {
  it("preserves legacy payload replay/conflict semantics", () => {
    expect(resolveRuntimeIdempotency(undefined, "payload")).toBe("NEW");
    expect(resolveRuntimeIdempotency("payload", "payload")).toBe("REPLAY");
    expect(resolveRuntimeIdempotency("payload", "different")).toBe("CONFLICT");
  });

  it("canonicalizes reordered object keys and ignores undefined fields", () => {
    const one = canonicalRuntimePayload({ b: 2, a: 1, c: undefined });
    const two = canonicalRuntimePayload({ a: 1, b: 2 });
    expect(one).toBe(two);
    expect(
      resolveRuntimeReportIdempotency(
        { key: "k-1", canonicalPayload: one ?? "" },
        { key: "k-1", payload: { a: 1, b: 2 } },
      ),
    ).toBe("REPLAY");
  });

  it("conflicts on changed payload or array order and rejects forbidden, oversized or malformed keys", () => {
    const payload = canonicalRuntimePayload({ a: [1, 2] }) ?? "";
    expect(
      resolveRuntimeReportIdempotency(
        { key: "k-1", canonicalPayload: payload },
        { key: "k-1", payload: { a: [2, 1] } },
      ),
    ).toBe("CONFLICT");
    expect(
      resolveRuntimeReportIdempotency(
        { key: "k-1", canonicalPayload: payload },
        { key: "k-1", payload: { secret: "x" } },
      ),
    ).toBe("REJECTED");
    expect(resolveRuntimeReportIdempotency(undefined, { key: "bad key", payload: { a: 1 } })).toBe(
      "REJECTED",
    );
    expect(
      resolveRuntimeReportIdempotency(undefined, {
        key: "k-1",
        payload: { message: "x".repeat(20_001) },
      }),
    ).toBe("REJECTED");
  });
});

describe("verifier authority", () => {
  const descriptor = {
    status: "READY",
    workspaceId: `wsp_${A}`,
    conversionRunId: `cvr_${A}`,
    rawArtifactId: `art_${A}`,
    targetPath: "notes/example.md",
    contentHash: { algorithm: "SHA-256", value: sha },
    sizeBytes: 12,
    converter,
    provenance: { conversionAttemptId: `cva_${A}`, workerId: `wrk_${A}` },
  };

  it("requires verifier identity, VERIFYING run and READY matching descriptor", () => {
    expect(
      verifierCanComplete({
        verifierId: "verifier-1",
        runStatus: "VERIFYING",
        descriptor,
        workspaceId: `wsp_${A}`,
        runId: `cvr_${A}`,
        rawArtifactId: `art_${A}`,
        targetPath: "notes/example.md",
        converter,
        attemptId: `cva_${A}`,
        workerId: `wrk_${A}`,
      }),
    ).toBe(true);
    expect(
      verifierCanComplete({ runStatus: "VERIFYING", descriptor, runId: `cvr_${A}`, converter }),
    ).toBe(false);
    expect(
      verifierCanComplete({
        verifierId: "worker-actor",
        runStatus: "RUNNING",
        descriptor,
        runId: `cvr_${A}`,
        converter,
      }),
    ).toBe(false);
    for (const status of ["GENERATED", "BLOCKED", "ARCHIVED"]) {
      expect(
        verifierCanComplete({
          verifierId: "verifier-1",
          runStatus: "VERIFYING",
          descriptor: { ...descriptor, status },
          runId: `cvr_${A}`,
          converter,
        }),
      ).toBe(false);
    }
  });

  it("rejects descriptor mismatches and terminal duplicate completion", () => {
    expect(
      verifierCanComplete({
        verifierId: "verifier-1",
        runStatus: "VERIFYING",
        descriptor: { ...descriptor, workspaceId: `wsp_${B}` },
        workspaceId: `wsp_${A}`,
        runId: `cvr_${A}`,
        converter,
      }),
    ).toBe(false);
    expect(
      verifierCanComplete({
        verifierId: "verifier-1",
        runStatus: "VERIFYING",
        descriptor: { ...descriptor, converter: { ...converter, version: "2.0.0" } },
        runId: `cvr_${A}`,
        converter,
      }),
    ).toBe(false);
    expect(
      verifierCanComplete({
        verifierId: "verifier-1",
        runStatus: "VERIFYING",
        descriptor: { ...descriptor, contentHash: { algorithm: "SHA-256", value: "bad" } },
        runId: `cvr_${A}`,
        converter,
      }),
    ).toBe(false);
    expect(
      verifierCanComplete({
        verifierId: "verifier-1",
        runStatus: "COMPLETED",
        descriptor,
        runId: `cvr_${A}`,
        converter,
      }),
    ).toBe(false);
  });

  it("allows verifier continuation after worker lease expiry but rejects new worker reports", () => {
    expect(
      verifierCanComplete({
        verifierId: "verifier-1",
        runStatus: "VERIFYING",
        descriptor,
        runId: `cvr_${A}`,
        converter,
      }),
    ).toBe(true);
    expect(
      authorizeRuntimeReport(
        {
          ...reportBase(),
          objectType: "CONVERSION_PROGRESS_REPORT",
          expectedCurrentStatus: "RUNNING",
        },
        lease(),
        "RUNNING",
        "2026-07-17T00:11:00Z",
      ),
    ).toBe("REJECTED");
  });
});

describe("security and bounds", () => {
  it("rejects overlarge metadata and content-shaped metadata values", () => {
    expect(
      isConversionWorkerCapability({
        ...capability(),
        extensions: Object.fromEntries(
          Array.from({ length: 26 }, (_, index) => [`x-k${index}`, "v"]),
        ),
      }),
    ).toBe(false);
    expect(
      isConversionWorkerCapability({ ...capability(), extensions: { "x-note": "#".repeat(501) } }),
    ).toBe(false);
    expect(
      isConversionProgressReport({
        ...reportBase(),
        objectType: "CONVERSION_PROGRESS_REPORT",
        expectedCurrentStatus: "RUNNING",
        progress: { percent: 1 },
        metadata: { "x-body": "content" },
      }),
    ).toBe(false);
  });
});
