import { describe, expect, it } from "vitest";
import type { CoverageTarget } from "../src/source-coverage-bootstrap";
import { prepareWipoFoundationalSupply } from "../src/source-coverage-operations";
import { prepareWipoFoundationalAutoConversion } from "../src/source-supply-conversion";

const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FWO";

function target(): CoverageTarget {
  return {
    id: "wo-wipo-madrid-legal-texts",
    jurisdiction: "WO",
    authorityName: "World Intellectual Property Organization",
    authorityBasis: "EXPLICIT_CURATED",
    family: "POLICY_NOTICES",
    displayName: "WIPO Madrid System Legal Texts",
    canonicalUri: "https://www.wipo.int/en/web/madrid-system/legal_texts/index",
    entrypoints: [
      {
        uri: "https://www.wipo.int/en/web/madrid-system/legal_texts/index",
        label: "Madrid legal texts",
      },
    ],
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: ["en"],
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: false,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    },
    protocolVersion: "1.0",
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object");
  }
  return value as Record<string, unknown>;
}

describe("WIPO foundational source supply", () => {
  it("prepares a MANUAL plan through the WO coverage filter without dispatching a run", async () => {
    const coverageTarget = target();
    let observedJurisdiction: string | null = null;
    let createdPlan: Record<string, unknown> | null = null;

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/source-coverage" && method === "GET") {
        observedJurisdiction = url.searchParams.get("jurisdiction");
        return Response.json({
          targets: [coverageTarget],
          registration: [
            { targetId: coverageTarget.id, state: "REGISTERED", sourceIds: [SOURCE_ID] },
          ],
        });
      }
      if (url.pathname === "/api/plans" && method === "GET") {
        return Response.json({ items: [] });
      }
      if (url.pathname === "/api/plans" && method === "POST") {
        createdPlan = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          plan: {
            plan: {
              id: "pln_01ARZ3NDEKTSV4RRFFQ69G5FWO",
              name: String(createdPlan.name),
              status: "ACTIVE",
              schedule: { mode: "MANUAL" },
            },
          },
        });
      }
      throw new Error(`Unexpected request ${method} ${url.pathname}`);
    };

    const result = await prepareWipoFoundationalSupply({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: WORKSPACE_ID,
      fetchImpl,
    });

    expect(observedJurisdiction).toBe("WO");
    expect(result.jurisdiction).toBe("WO");
    expect(result.preparedPlanCount).toBe(1);
    expect(result.runs).toEqual([]);
    expect(result.collectionAuthorization).toBe("NONE");
    expect(record(createdPlan?.schedule)).toEqual({ mode: "MANUAL" });
    expect(record(createdPlan?.policy)).toMatchObject({
      fetchAttachments: true,
      respectRobots: true,
    });
    expect(record(createdPlan?.output)).toEqual({
      artifactKinds: ["HTML", "MARKDOWN", "PDF"],
    });
  });

  it("creates WIPO-scoped automatic normalization profiles without changing acquisition authority", async () => {
    const coverageTarget = target();
    const manifests: Array<Record<string, unknown>> = [];
    const profiles: Array<Record<string, unknown>> = [];
    let observedJurisdiction: string | null = null;

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/source-coverage" && method === "GET") {
        observedJurisdiction = url.searchParams.get("jurisdiction");
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
        return Response.json({ items: [] });
      }
      if (url.pathname === "/api/conversion-profiles" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const profile = {
          ...body,
          id: `cvp_01ARZ3NDEKTSV4RRFFQ69G5${String(profiles.length).padStart(3, "0")}`,
        };
        profiles.push(profile);
        return Response.json({ profile }, { status: 201 });
      }
      throw new Error(`Unexpected request ${method} ${url.pathname}`);
    };

    const result = await prepareWipoFoundationalAutoConversion({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: WORKSPACE_ID,
      fetchImpl,
    });

    expect(observedJurisdiction).toBe("WO");
    expect(result.jurisdiction).toBe("WO");
    expect(result.profileCount).toBe(2);
    expect(profiles).toHaveLength(2);
    expect(profiles.every((profile) => profile.sourceId === SOURCE_ID)).toBe(true);
    expect(profiles.every((profile) => profile.autoConvert === true)).toBe(true);
    expect(profiles.every((profile) => profile.targetPathTemplate === "sources/wipo/{artifactId}.md")).toBe(
      true,
    );
    const converterIds = profiles.map(
      (profile) => (profile.converter as Record<string, unknown>).converterId,
    );
    expect(converterIds).toEqual(["builtin-markdown-staging", "builtin-pdf-markdown"]);
  });
});
