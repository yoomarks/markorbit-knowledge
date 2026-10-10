import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { TmclassSourceEvidenceV1 } from "@markorbit/contracts";
import type {
  AcquiredCollectionArtifact,
  ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import type { FactAdmissionClient } from "./fact-admission-http-client";
import {
  TMCLASS_FACT_ADMISSION_CONNECTOR_ID,
  TMCLASS_FACT_ADMISSION_CONNECTOR_VERSION,
  TMCLASS_FACT_ADMISSION_SOURCE,
  TmclassFactAdmissionJobAcquirer,
} from "./tmclass-fact-admission-job-acquirer";

const REQUEST_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RAW_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const CANONICAL = "markorbit://knowledge/tmclass/term/262/source-evidence";

function evidence(): TmclassSourceEvidenceV1 {
  return {
    contractVersion: "TMCLASS_SOURCE_EVIDENCE_V1",
    objectType: "TMCLASS_SOURCE_EVIDENCE",
    sourceOwner: "MARKORBIT_KNOWLEDGE",
    sourceId: "EUIPO_TMCLASS",
    observedAt: "2026-10-10T03:04:14.000Z",
    evidence: {
      workspaceId: "global-public",
      sourceDefinitionId: "src_tmclass",
      collectionRunId: "run_tmclass",
      rawArtifactId: RAW_ARTIFACT_ID,
      artifactVersion: 1,
      canonicalUri: "markorbit://knowledge/tmclass/raw/term/262",
      sourceUri: "https://euipo.europa.eu/ec2/term/262",
      sha256: "a".repeat(64),
    },
    page: {
      pageKind: "TERM",
      termId: "262",
      text: "Abrasives (Auxiliary fluids for use with -)",
      niceClass: 1,
      languageCode: "en",
      languageLabel: "English",
      acceptedBy: [{ name: "Israel Patent Office", code: "ILPO" }],
      taxonomy: [{ label: "Class 1", sourceNodeId: null }],
      translationTargets: [],
      sources: [{ conceptId: "11452493", sourceName: "ILPO Supplement", referenceId: "0024010" }],
    },
  };
}

function artifact(value = evidence()): AcquiredCollectionArtifact {
  return {
    artifactKind: "JSON",
    mimeType: "application/json",
    originalName: "tmclass-source-evidence.json",
    sourceUri: "markorbit://raw-artifact/" + RAW_ARTIFACT_ID,
    canonicalUri: CANONICAL,
    content: new TextEncoder().encode(JSON.stringify(value)),
  };
}

function context(value: AcquiredCollectionArtifact): ArtifactBackedExecutionContext {
  const ref = {
    artifactId: REQUEST_ARTIFACT_ID,
    canonicalUri: CANONICAL,
    sha256: createHash("sha256").update(value.content).digest("hex"),
    sizeBytes: value.content.byteLength,
  };
  const connector = {
    connectorId: TMCLASS_FACT_ADMISSION_CONNECTOR_ID,
    version: TMCLASS_FACT_ADMISSION_CONNECTOR_VERSION,
  };
  return {
    workerId: "wrk_test",
    leaseToken: "lease-token",
    lease: { id: "lease_test" },
    job: {
      sourceSnapshot: {
        sourceType: "DATABASE",
        canonicalUri: TMCLASS_FACT_ADMISSION_SOURCE,
        connector,
        connectorConfig: {
          intent: "PUBLISH_DURABLE_TMCLASS_EVIDENCE",
          evidenceArtifactRef: ref,
        },
      },
      connector,
      planSnapshot: { output: { artifactKinds: ["JSON"] } },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

describe("TMclass durable fact admission publisher", () => {
  it("publishes exact source evidence and parents a verified Data Engine receipt", async () => {
    const source = artifact();
    const calls: unknown[] = [];
    const client: FactAdmissionClient = {
      async post(_path, payload) {
        calls.push(payload);
        return {
          contract_version: "TMCLASS_SOURCE_EVIDENCE_V1",
          outcome: "TMCLASS_SOURCE_EVIDENCE_ADMITTED",
          source_id: "EUIPO_TMCLASS",
          raw_artifact_id: RAW_ARTIFACT_ID,
          page_kind: "TERM",
          replayed: false,
          facts: { terms: 1 },
        };
      },
    };
    const results = await new TmclassFactAdmissionJobAcquirer(
      { read: async () => source },
      client,
    ).acquire(context(source));

    expect(calls).toEqual([evidence()]);
    expect(results).toHaveLength(1);
    expect(results[0]?.parentArtifactIds).toEqual([REQUEST_ARTIFACT_ID]);
    expect(results[0]?.canonicalUri).toBe(CANONICAL + "/receipt");
  });

  it("rejects changed durable bytes before Data Engine write", async () => {
    const source = artifact();
    const frozen = context(source);
    const changed = { ...source, content: new TextEncoder().encode("{}") };
    const client: FactAdmissionClient = {
      async post() {
        throw new Error("must not write");
      },
    };

    await expect(
      new TmclassFactAdmissionJobAcquirer({ read: async () => changed }, client).acquire(frozen),
    ).rejects.toMatchObject({ code: "TMCLASS_DURABLE_EVIDENCE_MISMATCH" });
  });
});
