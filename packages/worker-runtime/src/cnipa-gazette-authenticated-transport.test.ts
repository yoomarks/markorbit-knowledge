import { describe, expect, it } from "vitest";
import type {
  CnipaAuthenticatedHttpSessionExecutorFactory,
  CnipaClosableAuthenticatedHttpSessionExecutor,
} from "./cnipa-artifact-acquirer";
import {
  CnipaGazetteAuthenticatedTransport,
  cnipaGazetteAuthenticatedTransportDescriptor,
} from "./cnipa-gazette-authenticated-transport";

describe("CnipaGazetteAuthenticatedTransport", () => {
  it("reuses one authorized session and forwards only POST JSON request material", async () => {
    const seen: unknown[] = [];
    let createCount = 0;
    let closeCount = 0;
    const session: CnipaClosableAuthenticatedHttpSessionExecutor = {
      async execute(request) {
        seen.push(request);
        return {
          status: 200,
          sourceUri: "https://pub.sbj.cnipa.gov.cn/example",
          contentType: "application/json;charset=UTF-8",
          observedAt: "2026-09-19T08:00:00.000Z",
          body: new TextEncoder().encode('{"code":0}'),
          securityState: "OK",
        };
      },
      async close() {
        closeCount += 1;
      },
    };
    const factory: CnipaAuthenticatedHttpSessionExecutorFactory = {
      async create() {
        createCount += 1;
        return session;
      },
    };
    const transport = new CnipaGazetteAuthenticatedTransport(factory);

    const first = await transport.postJson({
      path: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      body: { anncIssue: "75", anncType: "", pageIndex: 1, pageSize: 100 },
    });
    await transport.postJson({
      path: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      body: { anncIssue: "75", anncType: "", pageIndex: 2, pageSize: 100 },
    });
    await transport.close();

    expect(createCount).toBe(1);
    expect(closeCount).toBe(1);
    expect(seen[0]).toEqual({
      method: "POST",
      path: "/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      jsonBody: { anncIssue: "75", anncType: "", pageIndex: 1, pageSize: 100 },
    });
    expect(new TextDecoder().decode(first.rawBody)).toBe('{"code":0}');
    expect(first.contentType).toContain("application/json");
  });
  it("does not open a browser session when a job never sends a Gazette request", async () => {
    let createCount = 0;
    const factory: CnipaAuthenticatedHttpSessionExecutorFactory = {
      async create() {
        createCount += 1;
        throw new Error("should not create");
      },
    };
    const transport = new CnipaGazetteAuthenticatedTransport(factory);

    await transport.close();

    expect(createCount).toBe(0);
  });

  it("declares that session credentials never cross the transport port", () => {
    expect(cnipaGazetteAuthenticatedTransportDescriptor()).toEqual({
      transport: "CNIPA_AUTHENTICATED_BROWSER_SESSION",
      credentialsCrossPort: false,
      requestMethod: "POST",
      responseBytesSanitized: true,
      persistentSessionClosedAfterJob: true,
    });
  });
});
