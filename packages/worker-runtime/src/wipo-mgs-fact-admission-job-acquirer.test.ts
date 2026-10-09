import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { WipoMgsSnapshot } from "@markorbit/contracts";
import type {
  AcquiredCollectionArtifact,
  ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import { FactAdmissionHttpError, type FactAdmissionClient } from "./fact-admission-http-client";
import { buildWipoMgsDataEngineAdmissionRequest } from "./wipo-mgs-data-engine-handoff";
import {
  WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_ID,
  WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  WIPO_MGS_FACT_ADMISSION_JOB_SOURCE,
  WipoMgsFactAdmissionJobAcquirer,
  wipoMgsFactAdmissionJobRuntimeDescriptor,
} from "./wipo-mgs-fact-admission-job-acquirer";

const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function snapshot(): WipoMgsSnapshot {
  return {
    schemaVersion: "WIPO_MGS_SNAPSHOT_V1",
    source: "WIPO_MGS",
    requestLanguage: "en",
    localeCode: "en",
    niceClass: 1,
    sourceVersion: null,
    responseSha256: "b".repeat(64),
    recordCount: 1,
    records: [
      {
        sourceTermId: "768723",
        niceClass: 1,
        language: "en",
        termText: "2-naphthol",
        seq: 15,
        src: "NICE",
        prf: null,
        accRaw: "AU",
        rejRaw: null,
        acceptedJurisdictions: ["AU"],
        rejectedJurisdictions: [],
        jurisdictionStatuses: [{ jurisdictionCode: "AU", status: "accepted" }],
        contentHash: "a".repeat(64),
        rawPayload: { id: 768723, cls: 1, lng: "en", txt: "2-naphthol" },
      },
    ],
    anomalies: [],
  };
}

function requestArtifact(): AcquiredCollectionArtifact {
  return buildWipoMgsDataEngineAdmissionRequest({
    snapshot: snapshot(),
    observedAt: "2026-10-09T12:00:00.000Z",
    sourceUri: "https://webaccess.wipo.int/mgs/process.jsp#action=load&lang=en&class=1",
    evidenceCanonicalUri: "wipo-mgs://en/class/01/raw",
    projectionCanonicalUri: "wipo-mgs://en/class/01/normalized",
  });
}

function reference(artifact: AcquiredCollectionArtifact) {
  return {
    artifactId: ARTIFACT_ID,
    canonicalUri: artifact.canonicalUri!,
    sha256: createHash("sha256").update(artifact.content).digest("hex"),
    sizeBytes: artifact.content.byteLength,
  };
}

function context(ref: ReturnType<typeof reference>): ArtifactBackedExecutionContext {
  const connector = {
    connectorId: WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_ID,
    version: WIPO_MGS_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  };
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      connector,
      sourceSnapshot: {
        sourceType: "DATABASE",
        connector,
        connectorConfig: {
          intent: "PUBLISH_DURABLE_REQUEST",
          requestArtifactRef: ref,
        },
        canonicalUri: WIPO_MGS_FACT_ADMISSION_JOB_SOURCE,
      },
      planSnapshot: { output: { artifactKinds: ["JSON"] } },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

class FakeClient implements FactAdmissionClient {
  readonly calls: Array<{ path: string; payload: object }> = [];

  constructor(private readonly response: Record<string, unknown> | Error) {}

  async post<TPayload extends object>(path: string, payload: TPayload) {
    this.calls.push({ path, payload });
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

const receipt = {
  contract_version: "WIPO_MGS_STRUCTURED_ADMISSION_V1",
  outcome: "WIPO_MGS_SNAPSHOT_ADMITTED",
  source_id: "WIPO_MGS",
  request_language: "en",
  language: "en",
  nice_class: 1,
  source_response_sha256: "b".repeat(64),
  evidence_sha256: "b".repeat(64),
  storage_placement: "hot_global",
  record_count: 1,
  inserted_count: 1,
  replayed: false,
};

describe("WipoMgsFactAdmissionJobAcquirer", () => {
  it("publishes only verified durable Knowledge bytes and emits a lineage receipt", async () => {
    const request = requestArtifact();
    const reads: string[] = [];
    const client = new FakeClient(receipt);
    const artifacts = await new WipoMgsFactAdmissionJobAcquirer({
      reader: {
        async read(id) {
          reads.push(id);
          return request;
        },
      },
      client,
      clock: () => "2026-10-09T12:01:00.000Z",
    }).acquire(context(reference(request)));

    expect(reads).toEqual([ARTIFACT_ID]);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toMatchObject({
      path: "/api/admin/v2/fact-admissions/reference/wipo-mgs/snapshots",
      payload: {
        contract_version: "WIPO_MGS_STRUCTURED_ADMISSION_V1",
        source_owner: "MARKORBIT_KNOWLEDGE",
        source_id: "WIPO_MGS",
      },
    });
    expect(artifacts[0]?.parentArtifactIds).toEqual([ARTIFACT_ID]);
    const body = JSON.parse(new TextDecoder().decode(artifacts[0]!.content));
    expect(body.receipt).toEqual(receipt);
    expect(body.requestArtifactId).toBe(ARTIFACT_ID);
  });

  it("fails before Data Engine access when durable bytes differ from the frozen reference", async () => {
    const request = requestArtifact();
    const altered = { ...request, content: new TextEncoder().encode("{}") };
    const client = new FakeClient(receipt);
    await expect(
      new WipoMgsFactAdmissionJobAcquirer({
        reader: { read: async () => altered },
        client,
      }).acquire(context(reference(request))),
    ).rejects.toMatchObject({ code: "WIPO_MGS_DURABLE_REQUEST_MISMATCH", retryable: false });
    expect(client.calls).toEqual([]);
  });

  it("rejects endpoint injection and a receipt that does not prove Data Engine storage", async () => {
    const request = requestArtifact();
    const parsed = JSON.parse(new TextDecoder().decode(request.content));
    parsed.path = "/api/admin/v2/fact-admissions/global/observations";
    const injected = { ...request, content: new TextEncoder().encode(JSON.stringify(parsed)) };
    const client = new FakeClient(receipt);
    await expect(
      new WipoMgsFactAdmissionJobAcquirer({
        reader: { read: async () => injected },
        client,
      }).acquire(context(reference(injected))),
    ).rejects.toMatchObject({ code: "WIPO_MGS_PUBLISH_JOB_CONFIG_INVALID" });

    const badClient = new FakeClient({ ...receipt, storage_placement: "knowledge_sqlite" });
    await expect(
      new WipoMgsFactAdmissionJobAcquirer({
        reader: { read: async () => request },
        client: badClient,
      }).acquire(context(reference(request))),
    ).rejects.toMatchObject({ code: "WIPO_MGS_ADMISSION_RECEIPT_INVALID" });
  });

  it("preserves retryability from authenticated Data Engine admission", async () => {
    const request = requestArtifact();
    const client = new FakeClient(
      new FactAdmissionHttpError(503, "WIPO_MGS_STORAGE_UNAVAILABLE", "not ready", true),
    );
    await expect(
      new WipoMgsFactAdmissionJobAcquirer({
        reader: { read: async () => request },
        client,
      }).acquire(context(reference(request))),
    ).rejects.toMatchObject({ code: "WIPO_MGS_STORAGE_UNAVAILABLE", retryable: true });
  });

  it("keeps source access and Data Engine write authority on separate workers", () => {
    expect(wipoMgsFactAdmissionJobRuntimeDescriptor()).toMatchObject({
      sourceType: "DATABASE",
      inputMustBeDurableRawArtifact: true,
      sourceNetworkAccessRequired: false,
      factAdmissionOnly: true,
      dataEngineStorageRequired: true,
    });
  });
});
