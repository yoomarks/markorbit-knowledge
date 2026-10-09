import { describe, expect, it, vi } from "vitest";
import { isConnectorManifest } from "@markorbit/contracts";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import { CollectionAcquisitionError } from "./artifact-backed-collection-executor";
import {
  WIPO_MGS_AUTOMATED_ACCESS_APPROVAL_ENV,
  WIPO_MGS_CONNECTOR_MANIFEST,
  WIPO_MGS_ENDPOINT,
  WipoMgsArtifactAcquirer,
  type WipoMgsTransportRequest,
  type WipoMgsTransportResponse,
} from "./wipo-mgs-artifact-acquirer";

function context(
  connectorConfig: Record<string, unknown> = {
    requestLanguage: "en",
    localeCode: "en",
    niceClass: 1,
    sourceVersion: "NCL13-2026",
  },
): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_00000000000000000000000000",
    leaseToken: "lease-token",
    lease: { id: "lse_00000000000000000000000000" },
    job: {
      jobType: "API_COLLECTION",
      connector: { connectorId: "wipo-mgs-worker", version: "0.1.0" },
      sourceSnapshot: {
        sourceType: "API",
        connectorConfig,
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function response(
  body: string,
  statusCode = 200,
  contentType = "text/html;charset=UTF-8",
): WipoMgsTransportResponse {
  return {
    statusCode,
    headers: { "content-type": contentType },
    body: Buffer.from(body),
  };
}

function enabledEnvironment(): NodeJS.ProcessEnv {
  return { [WIPO_MGS_AUTOMATED_ACCESS_APPROVAL_ENV]: "true" };
}

async function acquisitionError(promise: Promise<unknown>): Promise<CollectionAcquisitionError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CollectionAcquisitionError);
    return error as CollectionAcquisitionError;
  }
  throw new Error("Expected CollectionAcquisitionError");
}

describe("WipoMgsArtifactAcquirer", () => {
  it("ships a valid but disabled connector registration template", () => {
    expect(isConnectorManifest(WIPO_MGS_CONNECTOR_MANIFEST)).toBe(true);
    expect(WIPO_MGS_CONNECTOR_MANIFEST.status).toBe("DISABLED");
  });

  it("fails closed before DNS or transport when automated access is not approved", async () => {
    const resolver = vi.fn(async () => [{ address: "93.184.216.34", family: 4 as const }]);
    const transport = vi.fn(async () => response("[]"));
    const acquirer = new WipoMgsArtifactAcquirer({ environment: {}, resolver, transport });

    const error = await acquisitionError(acquirer.acquire(context()));

    expect(error).toMatchObject({
      code: "MGS_AUTOMATED_ACCESS_NOT_APPROVED",
      retryable: false,
    });
    expect(resolver).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("posts one bounded unit and emits raw, normalized, admission, and report artifacts", async () => {
    let captured: WipoMgsTransportRequest | null = null;
    const acquirer = new WipoMgsArtifactAcquirer({
      environment: enabledEnvironment(),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      clock: () => "2026-10-09T12:00:00.000Z",
      transport: async (request) => {
        captured = request;
        return response(
          JSON.stringify([
            {
              id: 768723,
              cls: 1,
              lng: "en",
              seq: 15,
              src: "NICE",
              txt: "2-naphthol",
              acc: "AT,AU",
              rej: "US",
              prf: "sample",
              futureField: { preserved: true },
            },
          ]),
        );
      },
    });

    const artifacts = await acquirer.acquire(context());

    expect(WIPO_MGS_ENDPOINT).toBe("https://webaccess.wipo.int/mgs/process.jsp");
    expect(Buffer.from(captured!.body).toString("utf8")).toBe("action=load&lang=en&class=1");
    expect(captured).toMatchObject({
      resolvedAddress: "93.184.216.34",
      family: 4,
      timeoutMs: 30_000,
      maxResponseBytes: 20 * 1024 * 1024,
    });
    expect(artifacts).toHaveLength(4);
    expect(artifacts.map((artifact) => artifact.originalName)).toEqual([
      "wipo-mgs-en-01-raw.json",
      "wipo-mgs-en-01-normalized.json",
      "wipo-mgs-en-01-fact-admission-request.json",
      "wipo-mgs-en-01-report.json",
    ]);
    expect(artifacts[0]?.mimeType).toBe("text/html;charset=UTF-8");
    expect(artifacts[1]?.parentCanonicalUris).toEqual(["wipo-mgs://en/class/01/raw"]);
    const normalized = JSON.parse(Buffer.from(artifacts[1]!.content).toString("utf8"));
    expect(normalized).toMatchObject({
      requestLanguage: "en",
      localeCode: "en",
      niceClass: 1,
      sourceVersion: "NCL13-2026",
      recordCount: 1,
    });
    expect(normalized.records[0]).toMatchObject({
      sourceTermId: "768723",
      acceptedJurisdictions: ["AT", "AU"],
      rejectedJurisdictions: ["US"],
      rawPayload: { futureField: { preserved: true } },
    });
    const request = JSON.parse(Buffer.from(artifacts[2]!.content).toString("utf8"));
    expect(request).toMatchObject({
      schemaVersion: "WIPO_MGS_FACT_ADMISSION_REQUEST_V1",
      method: "POST",
      path: "/api/admin/v2/fact-admissions/reference/wipo-mgs/snapshots",
      status: "PREPARED_NOT_DISPATCHED",
      payload: {
        contract_version: "WIPO_MGS_STRUCTURED_ADMISSION_V1",
        source_owner: "MARKORBIT_KNOWLEDGE",
        source_id: "WIPO_MGS",
        observed_at: "2026-10-09T12:00:00.000Z",
      },
    });
    expect(artifacts[2]?.parentCanonicalUris).toEqual([
      "wipo-mgs://en/class/01/raw",
      "wipo-mgs://en/class/01/normalized",
    ]);
  });

  it.each([
    [403, "MGS_ACCESS_RESTRICTED", false],
    [429, "MGS_ACCESS_RESTRICTED", false],
    [503, "MGS_HTTP_STATUS_REJECTED", true],
  ])("classifies HTTP %i without an internal retry loop", async (status, code, retryable) => {
    const transport = vi.fn(async () => response("unavailable", status));
    const acquirer = new WipoMgsArtifactAcquirer({
      environment: enabledEnvironment(),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport,
    });

    const error = await acquisitionError(acquirer.acquire(context()));

    expect(error).toMatchObject({ code, retryable });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("rejects an HTML challenge even when the response content type is historically ambiguous", async () => {
    const acquirer = new WipoMgsArtifactAcquirer({
      environment: enabledEnvironment(),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async () => response("<html>captcha</html>"),
    });

    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error).toMatchObject({ code: "MGS_ACCESS_RESTRICTED", retryable: false });
  });

  it("rejects private resolution and incomplete class configuration before transport", async () => {
    const transport = vi.fn(async () => response("[]"));
    const privateTarget = new WipoMgsArtifactAcquirer({
      environment: enabledEnvironment(),
      resolver: async () => [{ address: "127.0.0.1", family: 4 }],
      transport,
    });
    const privateError = await acquisitionError(privateTarget.acquire(context()));
    expect(privateError.code).toBe("MGS_NETWORK_TARGET_REJECTED");
    expect(transport).not.toHaveBeenCalled();

    const missingClass = new WipoMgsArtifactAcquirer({
      environment: enabledEnvironment(),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport,
    });
    const configError = await acquisitionError(
      missingClass.acquire(context({ requestLanguage: "en" })),
    );
    expect(configError.code).toBe("MGS_CONFIG_INVALID");
    expect(transport).not.toHaveBeenCalled();
  });
});
