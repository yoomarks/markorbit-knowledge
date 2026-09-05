import { describe, expect, it } from "vitest";
import {
  knowledgeEvidenceContextHref,
  knowledgeLocationHref,
  resolveKnowledgeReturnHref,
} from "./knowledge-navigation-model";

describe("Knowledge evidence workspace navigation", () => {
  it("captures the current result context without nesting an older return target", () => {
    expect(
      knowledgeLocationHref(
        "/knowledge/search",
        "workspaceId=wsp-a&q=section+8&status=READY&offset=25&returnTo=%2Fdashboard",
      ),
    ).toBe("/knowledge/search?workspaceId=wsp-a&q=section+8&status=READY&offset=25");
  });

  it("opens evidence with workspace and a restorable result context", () => {
    const href = knowledgeEvidenceContextHref(
      "/knowledge/doc_123#evidence-change-review",
      "wsp-a",
      "/knowledge/search?workspaceId=wsp-a&q=section+8&offset=25",
    );
    const parsed = new URL(href, "https://markorbit.local");

    expect(parsed.pathname).toBe("/knowledge/doc_123");
    expect(parsed.searchParams.get("workspaceId")).toBe("wsp-a");
    expect(parsed.searchParams.get("returnTo")).toBe(
      "/knowledge/search?workspaceId=wsp-a&q=section+8&offset=25",
    );
    expect(parsed.hash).toBe("#evidence-change-review");
  });

  it("fails closed when a return target points at another workspace", () => {
    expect(resolveKnowledgeReturnHref("/knowledge/search?workspaceId=wsp-b&q=alpha", "wsp-a")).toBe(
      "/knowledge?workspaceId=wsp-a",
    );
  });

  it("rejects external or protocol-relative return targets", () => {
    expect(resolveKnowledgeReturnHref("https://example.com", "wsp-a")).toBe(
      "/knowledge?workspaceId=wsp-a",
    );
    expect(resolveKnowledgeReturnHref("//example.com/path", "wsp-a")).toBe(
      "/knowledge?workspaceId=wsp-a",
    );
  });

  it("adds the active workspace to a Knowledge return target when it is absent", () => {
    expect(resolveKnowledgeReturnHref("/knowledge/search?q=alpha&offset=25", "wsp-a")).toBe(
      "/knowledge/search?q=alpha&offset=25&workspaceId=wsp-a",
    );
  });
});
