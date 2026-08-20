import { describe, expect, it } from "vitest";
import { parseDocumentChangeEvidenceFeedRequest } from "../document-change-evidence-feed-service";

describe("document change evidence feed service", () => {
  it("normalizes supported feed query parameters", () => {
    expect(
      parseDocumentChangeEvidenceFeedRequest(
        "https://knowledge.example/api/changes/evidence/feed?workspaceId=%20workspace-1%20&cursor=%20ce_12%20&sourceId=%20source-1%20&documentId=%20document-1%20&limit=25",
      ),
    ).toEqual({
      workspaceId: "workspace-1",
      cursor: "ce_12",
      sourceId: "source-1",
      documentId: "document-1",
      limit: 25,
    });
  });

  it("requires an explicit workspace scope", () => {
    expect(() =>
      parseDocumentChangeEvidenceFeedRequest(
        "https://knowledge.example/api/changes/evidence/feed?sourceId=source-1",
      ),
    ).toThrow("workspaceId query parameter is required");
  });

  it.each(["0", "-1", "1.5", "abc"])("rejects invalid limit %s", (limit) => {
    expect(() =>
      parseDocumentChangeEvidenceFeedRequest(
        `https://knowledge.example/api/changes/evidence/feed?workspaceId=workspace-1&limit=${limit}`,
      ),
    ).toThrow("limit query parameter must be a positive integer");
  });
});
