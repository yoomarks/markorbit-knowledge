import { describe, expect, it } from "vitest";
import {
  resolveUsptoFeeEvidence,
  USPTO_FEE_TEMPORAL_AUTHORITY_URI,
} from "./uspto-fee-evidence-normalization";
import { getRetrievalIndexRepository } from "./source-registry";

const LIVE = process.env.MARKORBIT_USPTO_FEE_NORMALIZATION_LIVE_EVIDENCE === "1";
const NUMERIC_URI =
  "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule";
const APPLICABILITY_URI = "https://www.uspto.gov/trademarks/trademark-fee-information";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for live USPTO fee normalization evidence`);
  return value;
}

function search(sourceId: string, query: string) {
  return getRetrievalIndexRepository().search({
    workspaceId: required("MARKORBIT_WORKSPACE_ID"),
    query,
    sourceId,
    jurisdiction: "US",
    authorityLevel: "PRIMARY_OFFICIAL",
    limit: 10,
  }).items;
}

const liveDescribe = LIVE ? describe : describe.skip;

liveDescribe("Phase 2 live USPTO fee value and temporal normalization", () => {
  it("extracts the real value/date from retrieved source text with deterministic evidence identity", () => {
    const numericSourceId = required("MARKORBIT_NUMERIC_SOURCE_ID");
    const temporalSourceId = required("MARKORBIT_TEMPORAL_SOURCE_ID");
    const applicabilitySourceId = required("MARKORBIT_APPLICABILITY_SOURCE_ID");

    const numeric = search(numericSourceId, "base application fee 7017 trademark").find(
      (hit) =>
        hit.document.sourceUri === NUMERIC_URI &&
        hit.chunk.text.includes("7017") &&
        hit.chunk.text.includes("2.6(a)(1)(iii)") &&
        hit.chunk.text.toLowerCase().includes("base application"),
    );
    expect(numeric).toBeDefined();
    if (!numeric) return;

    const temporalHits = [
      ...search(temporalSourceId, "effective January 18 2025 fees paid USPTO"),
      ...search(temporalSourceId, "Sections 1 44 base application fee per class"),
    ].filter((hit) => hit.document.sourceUri === USPTO_FEE_TEMPORAL_AUTHORITY_URI);
    const temporalDocument = temporalHits[0]?.document;
    expect(temporalDocument).toBeDefined();
    if (!temporalDocument) return;
    const temporalChunks = [
      ...new Map(temporalHits.map((hit) => [hit.chunk.chunkId, hit.chunk])).values(),
    ];

    const applicability = search(
      applicabilitySourceId,
      "Section 1 Section 44 base application fee per class",
    ).find((hit) => hit.document.sourceUri === APPLICABILITY_URI);
    expect(applicability).toBeDefined();
    if (!applicability) return;

    const input = {
      numericDocument: numeric.document,
      numericChunk: numeric.chunk,
      temporalDocument,
      temporalChunks,
      applicabilityDocument: applicability.document,
      applicabilityChunk: applicability.chunk,
      asOf: new Date().toISOString(),
    };
    const first = resolveUsptoFeeEvidence(input);
    const replay = resolveUsptoFeeEvidence(input);
    expect(first).toEqual(replay);
    expect(first.status).toBe("RESOLVED");
    if (first.status !== "RESOLVED") return;

    expect(first.bundle.amountMinor).toBeGreaterThan(0);
    expect(first.bundle.effectiveAt).toMatch(/^20\d{2}-\d{2}-\d{2}T/);
    expect(first.bundle.numericEvidence.sourceId).toBe(numericSourceId);
    expect(first.bundle.temporalEvidence.length).toBeGreaterThan(0);
    expect(first.bundle.applicabilityEvidence.sourceId).toBe(applicabilitySourceId);

    process.stdout.write(
      `${JSON.stringify(
        {
          event: "phase2.uspto-fee-normalization.live-evidence.accepted",
          bundle: first.bundle,
          replayIdentical: true,
        },
        null,
        2,
      )}\n`,
    );
  });
});
