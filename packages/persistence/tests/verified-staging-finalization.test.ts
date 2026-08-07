import { describe, expect, it, vi } from "vitest";
import type { StagingDocumentDescriptor } from "@markorbit/contracts";
import type { ConversionRuntimeTransitionRepository } from "../src/conversion-runtime-transitions";
import type { StagingContentRegistryRepository } from "../src/staging-content-registry";
import {
  BUILTIN_STAGING_VERIFIER,
  type StagingVerificationEvidence,
  type StagingVerificationRepository,
} from "../src/staging-verification";
import { ControlPlaneVerifiedStagingFinalizer } from "../src/verified-staging-finalization";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const documentId = "std_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const runId = "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const digest = "a".repeat(64);

function descriptor(
  status: "READY" | "BLOCKED",
  outcome: "PASS" | "PASS_WITH_WARNINGS" | "FAIL",
): StagingDocumentDescriptor {
  const checkStatus =
    outcome === "FAIL" ? "FAIL" : outcome === "PASS_WITH_WARNINGS" ? "WARN" : "PASS";
  return {
    contractVersion: "1.0",
    objectType: "STAGING_DOCUMENT_DESCRIPTOR",
    id: documentId,
    workspaceId,
    sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    rawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    conversionRunId: runId,
    title: "Verified document",
    targetPath: "00_Inbox/verified.md",
    outputFormat: "MARKDOWN",
    contentHash: { algorithm: "SHA-256", value: digest },
    sizeBytes: 100,
    contentAddressedRef: `cas:sha256:${digest}`,
    frontmatterSummary: { fieldCount: 1, fields: [{ key: "title", valueType: "STRING" }] },
    converter: { converterId: "builtin-text-markdown", version: "1.0.0" },
    generatedAt: "2026-07-18T10:00:00Z",
    validation: {
      outcome,
      checks: [{ code: "FRONTMATTER_PARSE_VALID", status: checkStatus }],
      warnings: outcome === "PASS_WITH_WARNINGS" ? ["Optional metadata warning"] : [],
    },
    status,
  };
}

function evidence(
  item: StagingDocumentDescriptor,
  overrides: Partial<StagingVerificationEvidence> = {},
): StagingVerificationEvidence {
  return {
    id: "stv_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId,
    stagingDocumentId: item.id,
    conversionRunId: item.conversionRunId,
    verifier: BUILTIN_STAGING_VERIFIER,
    contentSha256: item.contentHash.value,
    outcome: item.validation.outcome,
    checks: item.validation.checks,
    warnings: item.validation.warnings,
    frontmatterSummary: item.frontmatterSummary,
    createdAt: "2026-07-18T10:01:00Z",
    ...overrides,
  };
}

function setup(item: StagingDocumentDescriptor, proof: StagingVerificationEvidence | null) {
  const staging = {
    getDocument: vi.fn(() => ({
      descriptor: item,
      createdAt: item.generatedAt,
      updatedAt: item.generatedAt,
    })),
  } as unknown as StagingContentRegistryRepository;
  const verifications = {
    getByDocument: vi.fn(() => proof),
  } as unknown as StagingVerificationRepository;
  const completeVerification = vi.fn(() => ({ marker: "completed" }));
  const failVerification = vi.fn(() => ({ marker: "failed" }));
  const transitions = {
    completeVerification,
    failVerification,
  } as unknown as ConversionRuntimeTransitionRepository;
  return {
    finalizer: new ControlPlaneVerifiedStagingFinalizer(staging, verifications, transitions),
    completeVerification,
    failVerification,
  };
}

describe("verified Staging finalization", () => {
  it("completes only from persisted READY/PASS evidence", () => {
    const item = descriptor("READY", "PASS");
    const env = setup(item, evidence(item));
    expect(
      env.finalizer.finalize({
        workspaceId,
        stagingDocumentId: documentId,
        idempotencyKey: "finish-1",
      }).decision,
    ).toBe("COMPLETED");
    expect(env.completeVerification).toHaveBeenCalledWith({
      workspaceId,
      verifierId: "builtin-staging-verifier",
      idempotencyKey: "finish-1:1.0.0",
      stagingDocument: item,
    });
    expect(env.failVerification).not.toHaveBeenCalled();
  });

  it("completes READY/PASS_WITH_WARNINGS evidence", () => {
    const item = descriptor("READY", "PASS_WITH_WARNINGS");
    const env = setup(item, evidence(item));
    expect(
      env.finalizer.finalize({
        workspaceId,
        stagingDocumentId: documentId,
        idempotencyKey: "finish-2",
      }).decision,
    ).toBe("COMPLETED");
  });

  it("fails from persisted BLOCKED/FAIL evidence", () => {
    const item = descriptor("BLOCKED", "FAIL");
    const env = setup(item, evidence(item));
    expect(
      env.finalizer.finalize({
        workspaceId,
        stagingDocumentId: documentId,
        idempotencyKey: "finish-3",
      }).decision,
    ).toBe("FAILED");
    expect(env.failVerification).toHaveBeenCalledWith({
      workspaceId,
      verifierId: "builtin-staging-verifier",
      idempotencyKey: "finish-3:1.0.0",
      conversionRunId: runId,
      code: "STAGING_VERIFICATION_FAILED",
      message: "Staging verification stv_01ARZ3NDEKTSV4RRFFQ69G5FAV blocked the generated document",
    });
  });

  it("rejects missing or mismatched persisted evidence", () => {
    const item = descriptor("READY", "PASS");
    expect(() =>
      setup(item, null).finalizer.finalize({
        workspaceId,
        stagingDocumentId: documentId,
        idempotencyKey: "finish-4",
      }),
    ).toThrow(/no persisted verification evidence/i);
    const wrongHash = setup(item, evidence(item, { contentSha256: "b".repeat(64) }));
    expect(() =>
      wrongHash.finalizer.finalize({
        workspaceId,
        stagingDocumentId: documentId,
        idempotencyKey: "finish-5",
      }),
    ).toThrow(/immutable descriptor/i);
    const wrongOutcome = setup(item, evidence(item, { outcome: "FAIL" }));
    expect(() =>
      wrongOutcome.finalizer.finalize({
        workspaceId,
        stagingDocumentId: documentId,
        idempotencyKey: "finish-6",
      }),
    ).toThrow(/decision does not match/i);
  });

  it("rejects undecided descriptors and malformed keys", () => {
    const item = { ...descriptor("READY", "PASS"), status: "GENERATED" as const };
    const env = setup(item, evidence(item));
    expect(() =>
      env.finalizer.finalize({
        workspaceId,
        stagingDocumentId: documentId,
        idempotencyKey: "finish-7",
      }),
    ).toThrow(/requires READY\/PASS or BLOCKED\/FAIL/i);
    expect(() =>
      env.finalizer.finalize({
        workspaceId,
        stagingDocumentId: documentId,
        idempotencyKey: " bad key ",
      }),
    ).toThrow(/Invalid Staging finalization idempotency key/);
  });
});
