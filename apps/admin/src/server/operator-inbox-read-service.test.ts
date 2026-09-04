import { describe, expect, it, vi } from "vitest";
import type { DocumentChangeEvidence } from "@markorbit/contracts";
import type { ExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import type { ReadyPackageV2DeliverySubmissionRepository } from "@markorbit/persistence/ready-package-v2-deliveries";
import type { ReadyPackageV2RegistryRepository } from "@markorbit/persistence/ready-packages-v2";
import type { SourceSupplyHealthRepository } from "@markorbit/persistence/source-supply-health";
import type { VaultInspectionRunRepository } from "@markorbit/persistence/vault-inspection-runs";
import {
  readOperatorInbox,
  type OperatorInboxReadDependencies,
} from "./operator-inbox-read-service";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function dependencies(): OperatorInboxReadDependencies {
  return {
    runs: {
      list: vi.fn(() => ({ items: [], total: 0, limit: 100, offset: 0, summary: {} })),
    } as unknown as ExecutionLedgerRepository,
    sourceSupply: {
      list: vi.fn(() => ({
        protocolVersion: "1.0",
        observedAt: "2026-09-04T10:00:00.000Z",
        items: [],
        summary: {},
      })),
    } as unknown as SourceSupplyHealthRepository,
    changeEvidence: {
      feed: vi.fn(() => ({ items: [], nextCursor: null })),
    },
    vaultInspection: {
      list: vi.fn(() => []),
    } as unknown as VaultInspectionRunRepository,
    readyPackages: {
      list: vi.fn(() => []),
    } as unknown as ReadyPackageV2RegistryRepository,
    deliveries: {
      getByReadyPackage: vi.fn(() => null),
      listAuditEvents: vi.fn(() => []),
    } as unknown as ReadyPackageV2DeliverySubmissionRepository,
  };
}

function categoryCount(result: ReturnType<typeof readOperatorInbox>, category: string): number {
  return result.categories.find((item) => item.category === category)?.count ?? -1;
}

describe("readOperatorInbox", () => {
  it("passes the authenticated workspace to every durable read and keeps counts workspace-scoped", () => {
    const deps = dependencies();
    const result = readOperatorInbox(workspaceId, deps, "2026-09-04T11:00:00.000Z");

    expect(deps.runs.list).toHaveBeenCalledWith({
      workspaceId,
      status: "FAILED",
      limit: 100,
      offset: 0,
    });
    expect(deps.sourceSupply.list).toHaveBeenCalledWith({ workspaceId });
    expect(deps.changeEvidence.feed).toHaveBeenCalledWith({
      workspaceId,
      cursor: undefined,
      limit: 100,
    });
    expect(deps.vaultInspection.list).toHaveBeenCalledWith(workspaceId, 1);
    expect(deps.readyPackages.list).toHaveBeenCalledWith(workspaceId, 100);
    expect(result.workspaceId).toBe(workspaceId);
    expect(result.evidenceState).toBe("COMPLETE");
    expect(result.total).toBe(0);
  });

  it("isolates a failed evidence source as PARTIAL instead of inventing unavailable counts", () => {
    const deps = dependencies();
    vi.mocked(deps.changeEvidence.feed).mockImplementation(() => {
      throw new Error("change evidence unavailable");
    });
    vi.mocked(deps.vaultInspection.list).mockImplementation(() => {
      throw new Error("vault unavailable");
    });

    const result = readOperatorInbox(workspaceId, deps, "2026-09-04T11:00:00.000Z");

    expect(result.evidenceState).toBe("PARTIAL");
    expect(result.unavailableEvidence).toEqual(["change-evidence", "vault-inspection"]);
    expect(categoryCount(result, "NEW_MATERIAL")).toBe(0);
    expect(categoryCount(result, "VAULT_CONFLICT")).toBe(0);
  });

  it("maps objective CREATED and UPDATED change evidence into exclusive queues", () => {
    const deps = dependencies();
    const base = {
      protocolVersion: "1.2",
      objectType: "DOCUMENT_CHANGE_EVIDENCE",
      eventId: "cf_1",
      sequence: 1,
      workspaceId,
      documentId: "doc_1",
      logicalDocumentId: null,
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      before: null,
      rawArtifacts: { before: null, after: null },
      attachments: { before: [], after: [], added: [], removed: [], modified: [] },
      dimensions: [],
      summary: { addedSections: 0, removedSections: 0, modifiedSections: 0, changedSections: 0 },
      sections: [],
      metadataChanges: [],
      links: { added: [], removed: [] },
      coverage: {
        documentMetadata: true,
        canonicalText: true,
        canonicalLinks: true,
        sectionStructure: true,
        rawArtifactBinary: false,
        linkedAttachments: false,
      },
    } as const;
    const after = {
      artifactVersion: 1,
      rawArtifactId: "art_1",
      stagingDocumentId: "stg_1",
      readyPackageId: "rdp_1",
      contentSha256: "a".repeat(64),
      capturedAt: "2026-09-04T09:00:00.000Z",
      sourceUri: "https://example.test/evidence",
    };
    const created = {
      ...base,
      id: "dcev_created",
      changeKind: "CREATED",
      observedAt: "2026-09-04T10:00:00.000Z",
      after,
    } as unknown as DocumentChangeEvidence;
    const updated = {
      ...base,
      id: "dcev_updated",
      eventId: "cf_2",
      sequence: 2,
      changeKind: "UPDATED",
      observedAt: "2026-09-04T10:30:00.000Z",
      after,
    } as unknown as DocumentChangeEvidence;
    vi.mocked(deps.changeEvidence.feed).mockReturnValue({
      items: [created, updated],
      nextCursor: null,
    });

    const result = readOperatorInbox(workspaceId, deps, "2026-09-04T11:00:00.000Z");

    expect(categoryCount(result, "NEW_MATERIAL")).toBe(1);
    expect(categoryCount(result, "MATERIAL_CHANGE")).toBe(1);
    const ids = result.categories.flatMap((category) => category.items.map((item) => item.id));
    expect(ids.filter((id) => id === "dcev_created")).toHaveLength(1);
    expect(ids.filter((id) => id === "dcev_updated")).toHaveLength(1);
    expect(
      result.categories.find((category) => category.category === "NEW_MATERIAL")?.items[0]?.href,
    ).toBe("/knowledge/stg_1");
    expect(
      result.categories.find((category) => category.category === "MATERIAL_CHANGE")?.items[0]?.href,
    ).toBe("/knowledge/stg_1#evidence-change-review");
  });

  it("links durable incidents and V2 delivery items to their governed record surfaces", () => {
    const deps = dependencies();
    vi.mocked(deps.runs.list).mockReturnValue({
      items: [
        {
          run: {
            id: "run_failed_1",
            sourceSnapshot: { name: "Example source" },
            updatedAt: "2026-09-04T10:10:00.000Z",
          },
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
      summary: {},
    } as unknown as ReturnType<ExecutionLedgerRepository["list"]>);
    vi.mocked(deps.vaultInspection.list).mockReturnValue([
      {
        id: "vinsp_1",
        observedAt: "2026-09-04T10:20:00.000Z",
        candidates: [
          {
            classification: "CONFLICT",
            vaultRelativePath: "folder/evidence.md",
          },
        ],
      },
    ] as unknown as ReturnType<VaultInspectionRunRepository["list"]>);
    vi.mocked(deps.readyPackages.list).mockReturnValue([
      {
        id: "rdp_v2_1",
        evidence: { canonicalDocumentId: "canonical_1" },
        createdAt: "2026-09-04T10:30:00.000Z",
      },
    ] as unknown as ReturnType<ReadyPackageV2RegistryRepository["list"]>);

    const result = readOperatorInbox(workspaceId, deps, "2026-09-04T11:00:00.000Z");

    expect(
      result.categories.find((category) => category.category === "ACQUISITION_FAILED")?.items[0]
        ?.href,
    ).toBe("/runs/run_failed_1");
    expect(
      result.categories.find((category) => category.category === "VAULT_CONFLICT")?.items[0]?.href,
    ).toBe("/vault?inspectionId=vinsp_1&path=folder%2Fevidence.md");
    expect(
      result.categories.find((category) => category.category === "READY_FOR_DELIVERY")?.items[0]
        ?.href,
    ).toBe("/vault?readyPackageId=rdp_v2_1");
  });
});
