import { describe, expect, it, vi } from "vitest";
import type { ArtifactBackedExecutionContext } from "../src/artifact-backed-collection-executor";
import {
  ApiArtifactAcquirer,
  type ApiTransportRequest,
  CollectionAcquisitionError,
  parseApiEndpointBindings,
} from "../src/index";

function context(
  connectorConfig: Record<string, unknown> = {
    endpointBinding: "public-api",
    resourcePath: "/v1/items",
    query: { page: "1", q: "marks" },
  },
): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_00000000000000000000000000",
    leaseToken: "lease-token",
    lease: { id: "lse_00000000000000000000000000" },
    job: {
      jobType: "API_COLLECTION",
      connector: { connectorId: "api-worker", version: "1.0.0" },
      sourceSnapshot: {
        sourceType: "API",
        connectorConfig,
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function environment(auth: Record<string, unknown> = { kind: "NONE" }): NodeJS.ProcessEnv {
  return {
    MARKORBIT_API_ENDPOINT_BINDINGS: JSON.stringify({
      "public-api": {
        baseUrl: "https://api.example.test",
        auth,
      },
    }),
  };
}

function response(
  body = '{"ok":true}',
  contentType = "application/json; charset=utf-8",
  statusCode = 200,
) {
  return {
    statusCode,
    headers: { "content-type": contentType },
    body: Buffer.from(body),
  };
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

describe("ApiArtifactAcquirer", () => {
  it("collects a bounded JSON response without leaking the endpoint locator", async () => {
    let captured: ApiTransportRequest | null = null;
    const acquirer = new ApiArtifactAcquirer({
      environment: environment(),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async (request) => {
        captured = request;
        return response();
      },
    });

    const artifacts = await acquirer.acquire(context());

    expect(captured).not.toBeNull();
    expect(captured!.hostname).toBe("api.example.test");
    expect(captured!.resolvedAddress).toBe("93.184.216.34");
    expect(captured!.servername).toBe("api.example.test");
    expect(captured!.path).toBe("/v1/items?page=1&q=marks");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.artifactKind).toBe("JSON");
    expect(artifacts[0]?.mimeType).toBe("application/json");
    expect(Buffer.from(artifacts[0]!.content).toString("utf8")).toBe('{"ok":true}');
    expect(artifacts[0]?.sourceUri).toMatch(/^api:\/\/public-api\/[a-f0-9]{64}$/);
    expect(artifacts[0]?.sourceUri).not.toContain("api.example.test");
    expect(artifacts[0]?.sourceUri).not.toContain("v1/items");
    expect(artifacts[0]?.originalName).toMatch(/^api-response-[a-f0-9]{16}\.json$/);
  });

  it("injects bearer credentials only into the outbound request", async () => {
    const secret = "super-sensitive-api-value";
    let authorization = "";
    const acquirer = new ApiArtifactAcquirer({
      environment: {
        ...environment({ kind: "BEARER", secretEnv: "PUBLIC_API_TOKEN" }),
        PUBLIC_API_TOKEN: secret,
      },
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async (request) => {
        authorization = request.headers.authorization ?? "";
        return response();
      },
    });

    const artifacts = await acquirer.acquire(context());
    expect(authorization).toBe(`Bearer ${secret}`);
    expect(JSON.stringify(artifacts)).not.toContain(secret);
    expect(JSON.stringify(artifacts)).not.toContain("PUBLIC_API_TOKEN");
  });

  it("supports custom header auth without persisting the credential", async () => {
    let headerValue = "";
    const acquirer = new ApiArtifactAcquirer({
      environment: {
        ...environment({ kind: "HEADER", headerName: "x-api-key", secretEnv: "PUBLIC_API_KEY" }),
        PUBLIC_API_KEY: "key-123",
      },
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async (request) => {
        headerValue = request.headers["x-api-key"] ?? "";
        return response();
      },
    });
    const artifacts = await acquirer.acquire(context());
    expect(headerValue).toBe("key-123");
    expect(JSON.stringify(artifacts)).not.toContain("key-123");
  });

  it("rejects credential-like query parameters", async () => {
    const acquirer = new ApiArtifactAcquirer({ environment: environment() });
    const error = await acquisitionError(
      acquirer.acquire(
        context({
          endpointBinding: "public-api",
          resourcePath: "/v1/items",
          query: { access_token: "must-not-be-persisted" },
        }),
      ),
    );
    expect(error.code).toBe("API_QUERY_INVALID");
    expect(error.retryable).toBe(false);
  });

  it("rejects non-HTTPS endpoint bindings", async () => {
    const acquirer = new ApiArtifactAcquirer({
      environment: {
        MARKORBIT_API_ENDPOINT_BINDINGS: JSON.stringify({
          "public-api": { baseUrl: "http://api.example.test", auth: { kind: "NONE" } },
        }),
      },
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("API_BINDINGS_INVALID");
  });

  it("rejects resource paths that could change authority or escape path semantics", async () => {
    const acquirer = new ApiArtifactAcquirer({ environment: environment() });
    for (const resourcePath of ["//evil.example/path", "/safe/%2e%2e/private", "/safe%2fescape"]) {
      const error = await acquisitionError(
        acquirer.acquire(context({ endpointBinding: "public-api", resourcePath })),
      );
      expect(error.code).toBe("API_RESOURCE_PATH_INVALID");
    }
  });

  it("rejects literal and DNS-resolved non-public targets before transport", async () => {
    const transport = vi.fn(async () => response());
    const literal = new ApiArtifactAcquirer({
      environment: {
        MARKORBIT_API_ENDPOINT_BINDINGS: JSON.stringify({
          "public-api": { baseUrl: "https://127.0.0.1", auth: { kind: "NONE" } },
        }),
      },
      transport,
    });
    expect((await acquisitionError(literal.acquire(context()))).code).toBe(
      "API_NETWORK_TARGET_REJECTED",
    );

    const dns = new ApiArtifactAcquirer({
      environment: environment(),
      resolver: async () => [{ address: "10.1.2.3", family: 4 }],
      transport,
    });
    expect((await acquisitionError(dns.acquire(context()))).code).toBe(
      "API_NETWORK_TARGET_REJECTED",
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it("fails closed when DNS returns a mixed public/private answer set", async () => {
    const transport = vi.fn(async () => response());
    const acquirer = new ApiArtifactAcquirer({
      environment: environment(),
      resolver: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.20", family: 4 },
      ],
      transport,
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("API_NETWORK_TARGET_REJECTED");
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects redirects and classifies HTTP retryability", async () => {
    for (const [status, code, retryable] of [
      [302, "API_REDIRECT_REJECTED", false],
      [401, "API_HTTP_STATUS_REJECTED", false],
      [429, "API_HTTP_STATUS_REJECTED", true],
      [503, "API_HTTP_STATUS_REJECTED", true],
    ] as const) {
      const acquirer = new ApiArtifactAcquirer({
        environment: environment(),
        resolver: async () => [{ address: "93.184.216.34", family: 4 }],
        transport: async () => response("error", "text/plain", status),
      });
      const error = await acquisitionError(acquirer.acquire(context()));
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(retryable);
    }
  });

  it("rejects unsupported or unauthorized MIME types", async () => {
    const unsupported = new ApiArtifactAcquirer({
      environment: environment(),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async () => response("binary", "application/octet-stream"),
    });
    expect((await acquisitionError(unsupported.acquire(context()))).code).toBe(
      "API_CONTENT_TYPE_REJECTED",
    );

    const unauthorized = new ApiArtifactAcquirer({
      environment: environment(),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async () => response("hello", "text/plain"),
    });
    expect(
      (
        await acquisitionError(
          unauthorized.acquire(
            context({
              endpointBinding: "public-api",
              resourcePath: "/v1/items",
              acceptedMimeTypes: ["application/json"],
            }),
          ),
        )
      ).code,
    ).toBe("API_CONTENT_TYPE_REJECTED");
  });

  it("double-checks the response byte bound even for injected transports", async () => {
    const acquirer = new ApiArtifactAcquirer({
      environment: environment(),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async () => response("123456", "text/plain"),
    });
    const error = await acquisitionError(
      acquirer.acquire(
        context({
          endpointBinding: "public-api",
          resourcePath: "/v1/items",
          maxResponseBytes: 5,
        }),
      ),
    );
    expect(error.code).toBe("API_RESPONSE_TOO_LARGE");
  });

  it("produces deterministic safe identity with canonical query ordering", async () => {
    const acquirer = new ApiArtifactAcquirer({
      environment: environment(),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async () => response(),
    });
    const first = await acquirer.acquire(
      context({
        endpointBinding: "public-api",
        resourcePath: "/v1/items",
        query: { b: "2", a: "1" },
      }),
    );
    const second = await acquirer.acquire(
      context({
        endpointBinding: "public-api",
        resourcePath: "/v1/items",
        query: { a: "1", b: "2" },
      }),
    );
    const changed = await acquirer.acquire(
      context({
        endpointBinding: "public-api",
        resourcePath: "/v1/items",
        query: { a: "different", b: "2" },
      }),
    );
    expect(first[0]?.sourceUri).toBe(second[0]?.sourceUri);
    expect(first[0]?.sourceUri).not.toBe(changed[0]?.sourceUri);
  });

  it("fails safely when a credential environment binding is missing", async () => {
    const acquirer = new ApiArtifactAcquirer({
      environment: environment({ kind: "BEARER", secretEnv: "PUBLIC_API_TOKEN" }),
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async () => response(),
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("API_CREDENTIAL_UNAVAILABLE");
    expect(error.message).not.toContain("PUBLIC_API_TOKEN");
  });

  it("parses only reviewed auth binding shapes", () => {
    expect(
      parseApiEndpointBindings(
        JSON.stringify({
          public: {
            baseUrl: "https://api.example.test",
            auth: { kind: "HEADER", headerName: "X-Api-Key", secretEnv: "PUBLIC_API_KEY" },
          },
        }),
      ).public,
    ).toEqual({
      baseUrl: "https://api.example.test",
      auth: { kind: "HEADER", headerName: "x-api-key", secretEnv: "PUBLIC_API_KEY" },
    });
    expect(() =>
      parseApiEndpointBindings(
        JSON.stringify({
          public: {
            baseUrl: "https://api.example.test/v1",
            auth: { kind: "NONE" },
          },
        }),
      ),
    ).toThrow(/origin without a path prefix/);
  });
});
