import { describe, expect, it } from "vitest";
import {
  isWorkspacePrivateCaseEvidenceReadGrantV1,
  isWorkspacePrivateCaseEvidenceReadRequestV1,
} from "../src/workspace-private-case-evidence-read-v1";

const grant = {
  protocolVersion: "1.0",
  objectType: "WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_GRANT",
  bindingId: "018f0000-0000-7000-8000-000000000001",
  bindingVersion: 2,
  workspaceId: "018f0000-0000-7000-8000-000000000002",
  userId: "018f0000-0000-7000-8000-000000000003",
  membershipId: "018f0000-0000-7000-8000-000000000004",
  knowledgeWorkspaceId: "wsp_private_001",
  readyPackageId: "rdp_private_001",
  readyPackageDigest: "1".repeat(64),
  coreIntakeId: "intake_private_001",
  contentExportSha256: "2".repeat(64),
  stagingDocumentId: "std_private_001",
  stagingSha256: "3".repeat(64),
  rawArtifactId: "art_private_001",
  rawArtifactSha256: "4".repeat(64),
  caseId: "formal-matter_private_001",
  caseVersion: 1,
  caseSnapshotSha256: "5".repeat(64),
  sourceLocators: ["rch_private_001"],
  authoritySnapshot: { workspaceVersion: 1, userVersion: 1, membershipVersion: 1 },
  currentness: {
    workspaceAuthority: "CURRENT",
    formalMatter: "CURRENT",
    coreKnowledgeEvidence: "CURRENT",
    knowledgeRetrieval: "MUST_VERIFY",
  },
  consequences: {
    officialTruthCreated: false,
    filingAuthorized: false,
    externalActionAuthorized: false,
  },
  verifiedAt: "2026-10-02T10:00:00.000Z",
  expiresAt: "2026-10-02T10:01:00.000Z",
} as const;

describe("WorkspacePrivateCaseEvidenceReadGrantV1", () => {
  it("accepts only an exact binding/version read request", () => {
    expect(
      isWorkspacePrivateCaseEvidenceReadRequestV1({
        bindingId: grant.bindingId,
        expectedVersion: grant.bindingVersion,
      }),
    ).toBe(true);
    expect(
      isWorkspacePrivateCaseEvidenceReadRequestV1({
        bindingId: grant.bindingId,
        expectedVersion: grant.bindingVersion,
        grant,
      }),
    ).toBe(false);
  });

  it("accepts the exact current Core grant wire shape", () => {
    expect(isWorkspacePrivateCaseEvidenceReadGrantV1(grant)).toBe(true);
  });

  it("fails closed for extra fields and authority/consequence drift", () => {
    expect(isWorkspacePrivateCaseEvidenceReadGrantV1({ ...grant, unreviewed: true })).toBe(false);
    expect(
      isWorkspacePrivateCaseEvidenceReadGrantV1({
        ...grant,
        consequences: { ...grant.consequences, filingAuthorized: true },
      }),
    ).toBe(false);
    expect(
      isWorkspacePrivateCaseEvidenceReadGrantV1({
        ...grant,
        currentness: { ...grant.currentness, knowledgeRetrieval: "CURRENT" },
      }),
    ).toBe(false);
  });
});
