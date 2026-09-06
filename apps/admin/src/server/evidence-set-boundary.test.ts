import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function apiRoute(path: string): string {
  return readFileSync(new URL(`../app/api/evidence-sets/${path}route.ts`, import.meta.url), "utf8");
}

function appSource(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Evidence Set Admin boundaries", () => {
  it("uses canonical workspace read access for every Evidence Set read route", () => {
    for (const path of ["", "[id]/", "[id]/export/"]) {
      const source = apiRoute(path);
      expect(source).toMatch(/resolveAdminBrowserApiReadAccess/);
      expect(source).toMatch(/requiredKnowledgeWorkspaceId/);
    }
  });

  it("uses canonical mutation access and derives creator identity from the principal", () => {
    const source = apiRoute("");
    expect(source).toMatch(/resolveAdminBrowserApiMutationAccess/);
    expect(source).toMatch(/userId:\s*principal\.userId/);
    expect(source).toMatch(/membershipId:\s*principal\.membershipId/);
    expect(source).toMatch(/role:\s*principal\.role/);
    expect(source).not.toMatch(/userId:\s*body\./);
  });

  it("uses the canonical browser CSRF helper for client creation", () => {
    const source = appSource("components/knowledge/evidence-set-selection-bar.tsx");
    expect(source).toMatch(/adminBrowserWorkspaceMutationHeaders/);
    expect(source).toMatch(/method:\s*"POST"/);
    expect(source).not.toMatch(/x-markorbit-csrf-token/);
  });

  it("keeps Review Package as an inspection surface over the existing Evidence Workspace", () => {
    const source = appSource("components/knowledge/evidence-set-review-package.tsx");
    expect(source).toMatch(/knowledgeEvidenceContextHref/);
    expect(source).toMatch(/stagingDocumentId/);
    expect(source).toMatch(/currentStagingDocumentId/);
    expect(source).not.toMatch(/ContentReader/);
    expect(source).not.toMatch(/readContent/);
  });
});
