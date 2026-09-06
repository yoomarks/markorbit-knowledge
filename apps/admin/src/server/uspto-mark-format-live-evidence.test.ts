import { describe, expect, it } from "vitest";
import {
  USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1,
  assessUsptoMarkFormatSourceEvidenceV1,
} from "@markorbit/contracts";
import { attestUsptoMarkFormatSource } from "./uspto-mark-format-source-attestation";
import {
  getRawArtifactRepository,
  getRetrievalIndexRepository,
  getSourceRepository,
  getStagingContentRepository,
} from "./source-registry";

const LIVE = process.env.MARKORBIT_USPTO_MARK_FORMAT_LIVE_EVIDENCE === "1";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for live USPTO mark-format evidence`);
  return value;
}

const liveDescribe = LIVE ? describe : describe.skip;

liveDescribe("live USPTO mark-format governed reference evidence", () => {
  it("attests both exact official pages and emits the bounded #903 handoff", async () => {
    const workspaceId = required("MARKORBIT_WORKSPACE_ID");
    const sourceIds = {
      DRAWINGS_AND_SPECIMENS: required("MARKORBIT_USPTO_MARK_FORMAT_DRAWINGS_SPECIMENS_SOURCE_ID"),
      MARK_DRAWINGS: required("MARKORBIT_USPTO_MARK_FORMAT_MARK_DRAWINGS_SOURCE_ID"),
    } as const;
    const dependencies = {
      sources: getSourceRepository(),
      rawArtifacts: getRawArtifactRepository(),
      retrieval: getRetrievalIndexRepository(),
      staging: getStagingContentRepository(),
    };

    const evidence = await Promise.all(
      USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources.map((source) =>
        attestUsptoMarkFormatSource({
          workspaceId,
          sourceId: sourceIds[source.sourceKey],
          sourceKey: source.sourceKey,
          dependencies,
        }),
      ),
    );

    for (const item of evidence) {
      const assessment = assessUsptoMarkFormatSourceEvidenceV1(item);
      expect(assessment.state).toBe("CURRENT");
      expect(assessment.reasonCodes).toEqual([]);
      expect(item.documentContentSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(item.httpBodySha256).toMatch(/^[a-f0-9]{64}$/u);
      const source = USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.sources.find(
        (candidate) => candidate.sourceKey === item.sourceKey,
      )!;
      expect(item.chunks.length).toBeGreaterThanOrEqual(source.evidenceQueries.length);
      expect(new Set(item.chunks.map((chunk) => chunk.factId))).toEqual(
        new Set(source.evidenceQueries.map((query) => query.factId)),
      );
      for (const chunk of item.chunks) {
        expect(chunk.chunkId.length).toBeGreaterThan(0);
        expect(chunk.chunkContentSha256).toMatch(/^[a-f0-9]{64}$/u);
      }
    }
    const factIds = new Set(evidence.flatMap((item) => item.chunks.map((chunk) => chunk.factId)));
    expect([...factIds].sort()).toEqual(
      [...USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.scope.factIds].sort(),
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          event: "knowledge.uspto-mark-format-reference.v1.accepted",
          issue: "yoomarks/markorbit-knowledge#730",
          downstream: "yoomarks/markorbit#903",
          profileId: USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.profileId,
          currentnessPolicy: USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.currentnessPolicy,
          tmepCorroboration: USPTO_MARK_FORMAT_REFERENCE_PROFILE_V1.tmepCorroboration,
          sources: evidence.map((item) => ({
            sourceKey: item.sourceKey,
            sourceId: item.sourceId,
            sourceVersion: item.sourceVersion,
            canonicalUri: item.canonicalUri,
            documentId: item.documentId,
            rawArtifactId: item.rawArtifactId,
            artifactVersion: item.artifactVersion,
            documentContentSha256: item.documentContentSha256,
            capturedAt: item.capturedAt,
            indexedAt: item.indexedAt,
            chunks: item.chunks,
          })),
        },
        null,
        2,
      )}\n`,
    );
  });
});
