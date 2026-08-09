import { describe, expect, it } from "vitest";
import { prepareUsFoundationalAutoConversion } from "../src/source-supply-conversion";
import type { CoverageTarget } from "../src/source-coverage-bootstrap";

const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAA";

function target(
  id: string,
  options: { fetchAttachments?: boolean; artifactKinds?: string[] } = {},
): CoverageTarget {
  return {
    id,
    jurisdiction: "US",
    authorityName: "United States Patent and Trademark Office",
    authorityBasis: "EXPLICIT_CURATED",
    family: "EXAMINATION_MANUAL",
    displayName: id,
    canonicalUri: "https://www.uspto.gov/trademarks",
    entrypoints: [{ uri: "https://www.uspto.gov/trademarks", label: id }],
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: ["en-US"],
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: options.fetchAttachments ?? false,
      expectedArtifactKinds: options.artifactKinds ?? ["HTML", "MARKDOWN"],
    },
    protocolVersion: "1.0",
  };
}

function mockControlPlane(coverageTarget: CoverageTarget) {
  const manifests: Array<Record<string, unknown>> = [];
  const profiles: Array<Record<string, unknown>> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/source-coverage" && method === "GET") {
      return Response.json({
        targets: [coverageTarget],
        registration: [
          { targetId: coverageTarget.id, state: "REGISTERED", sourceIds: [SOURCE_ID] },
        ],
      });
    }
    if (url.pathname === "/api/converters" && method === "GET") {
      const q = url.searchParams.get("q");
      return Response.json({
        items: manifests
          .filter((manifest) => manifest.converterId === q)
          .map((manifest) => ({ manifest })),
      });
    }
    if (url.pathname === "/api/converters" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      manifests.push(body);
      return Response.json({ manifest: body }, { status: 201 });
    }
    if (url.pathname === "/api/conversion-profiles" && method === "GET") {
      const converterId = url.searchParams.get("converterId");
      return Response.json({
        items: profiles.filter((profile) => {
          const converter = profile.converter as Record<string, unknown>;
          return converter.converterId === converterId;
        }),
      });
    }
    if (url.pathname === "/api/conversion-profiles" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const profile = {
        ...body,
        id: `cvp_01ARZ3NDEKTSV4RRFFQ69G5F${String(profiles.length).padStart(2, "0")}`,
      };
      profiles.push(profile);
      return Response.json({ profile }, { status: 201 });
    }
    throw new Error(`Unexpected request ${method} ${url.pathname}`);
  };
  return { fetchImpl, manifests, profiles };
}

describe("US foundational automatic conversion preparation", () => {
  it("auto-converts the paired MARKDOWN page artifact while retaining HTML as raw evidence", async () => {
    const control = mockControlPlane(target("us-uspto-trademarks-root"));
    const result = await prepareUsFoundationalAutoConversion({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: WORKSPACE_ID,
      fetchImpl: control.fetchImpl,
    });

    expect(result.manifestCount).toBe(4);
    expect(result.profileCount).toBe(1);
    expect(control.profiles).toHaveLength(1);
    expect(control.profiles[0]).toMatchObject({
      sourceId: SOURCE_ID,
      autoConvert: true,
      converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
      input: { artifactKinds: ["MARKDOWN"], mimePatterns: ["text/markdown"] },
    });
    expect(result.automaticPolicy.html).toBe("RAW_EVIDENCE_ONLY");
  });

  it("creates explicit attachment profiles without silently routing PDFs to OCR", async () => {
    const control = mockControlPlane(
      target("us-uspto-tmep-current", {
        fetchAttachments: true,
        artifactKinds: ["HTML", "MARKDOWN", "PDF", "DOCX", "IMAGE"],
      }),
    );
    const result = await prepareUsFoundationalAutoConversion({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: WORKSPACE_ID,
      fetchImpl: control.fetchImpl,
    });

    expect(result.profileCount).toBe(4);
    const byConverter = new Map(
      control.profiles.map((profile) => [
        (profile.converter as Record<string, unknown>).converterId,
        profile,
      ]),
    );
    expect(byConverter.get("builtin-pdf-markdown")).toMatchObject({
      input: { artifactKinds: ["PDF"], mimePatterns: ["application/pdf"] },
      autoConvert: true,
    });
    expect(byConverter.get("local-rich-document-markdown")).toMatchObject({
      input: {
        artifactKinds: ["DOCX"],
        mimePatterns: [
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
      },
    });
    expect(byConverter.get("local-ocr-markdown")).toMatchObject({
      input: { artifactKinds: ["IMAGE"], mimePatterns: ["image/*"] },
    });
    expect(result.automaticPolicy.pdf).toBe("TEXT_LAYER_ONLY_NO_OCR_FALLBACK");
    expect(result.automaticPolicy.scannedPdf).toBe("EXPLICIT_OCR_REQUIRED");
  });
});
