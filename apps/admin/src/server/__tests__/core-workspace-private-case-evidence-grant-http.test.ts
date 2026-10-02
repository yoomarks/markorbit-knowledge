import { describe, expect, it, vi } from "vitest";
import {
  CoreWorkspacePrivateCaseEvidenceGrantTransportError,
  HttpCoreWorkspacePrivateCaseEvidenceGrantTransport,
} from "../core-workspace-private-case-evidence-grant-http";

const bindingId = "018f0000-0000-7000-8000-000000000001";
const grant = {
  protocolVersion: "1.0",
  objectType: "WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_GRANT",
  bindingId,
  bindingVersion: 2,
  workspaceId: "018f0000-0000-7000-8000-000000000002",
  userId: "018f0000-0000-7000-8000-000000000003",
  membershipId: "018f0000-0000-7000-8000-000000000004",
  knowledgeWorkspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAW",
  readyPackageId: "rdp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  readyPackageDigest: "1".repeat(64),
  coreIntakeId: "intake_private_001",
  contentExportSha256: "2".repeat(64),
  stagingDocumentId: "std_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  stagingSha256: "3".repeat(64),
  rawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
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

describe("Core Workspace-private Case evidence grant HTTP transport", () => {
  it("forwards the exact Principal and binding version and validates the Core grant", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        `http://core.local/internal/v1/workspace-private-case-evidence/${bindingId}/read-grants`,
      );
      expect(init?.headers).toMatchObject({
        "x-markorbit-internal-authorization": "core-secret",
        "x-markorbit-principal": "principal-envelope",
        "x-markorbit-workspace-id": grant.workspaceId,
      });
      expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 2 });
      return Response.json(grant);
    });
    const transport = new HttpCoreWorkspacePrivateCaseEvidenceGrantTransport(
      "http://core.local",
      "core-secret",
      fetchImpl,
    );
    await expect(
      transport.issue({ bindingId, expectedVersion: 2 }, "principal-envelope", grant.workspaceId),
    ).resolves.toEqual(grant);
  });

  it.each([
    [401, 403],
    [403, 403],
    [404, 404],
    [409, 409],
    [500, 503],
  ] as const)("maps Core HTTP %s to private-read status %s", async (coreStatus, expectedStatus) => {
    const transport = new HttpCoreWorkspacePrivateCaseEvidenceGrantTransport(
      "http://core.local",
      "core-secret",
      async () => new Response(null, { status: coreStatus }),
    );
    await expect(
      transport.issue({ bindingId, expectedVersion: 2 }, "principal-envelope", grant.workspaceId),
    ).rejects.toMatchObject({ httpStatus: expectedStatus });
  });

  it("fails closed for malformed or different-version Core grants", async () => {
    const malformed = new HttpCoreWorkspacePrivateCaseEvidenceGrantTransport(
      "http://core.local",
      "core-secret",
      async () => Response.json({ bindingId }),
    );
    await expect(
      malformed.issue({ bindingId, expectedVersion: 2 }, "principal-envelope", grant.workspaceId),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CoreWorkspacePrivateCaseEvidenceGrantTransportError>>({
        httpStatus: 503,
      }),
    );

    const stale = new HttpCoreWorkspacePrivateCaseEvidenceGrantTransport(
      "http://core.local",
      "core-secret",
      async () => Response.json({ ...grant, bindingVersion: 3 }),
    );
    await expect(
      stale.issue({ bindingId, expectedVersion: 2 }, "principal-envelope", grant.workspaceId),
    ).rejects.toMatchObject({ httpStatus: 409 });
  });
});
