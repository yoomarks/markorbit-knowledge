import { request as httpRequest } from "node:http";
import { describe, expect, it } from "vitest";
import type { CnipaGazetteBrowserPageCommit } from "./cnipa-gazette-browser-checkpoint-stream";
import {
  CNIPA_GAZETTE_LOOPBACK_PAGE_ACK_SCHEMA,
  CNIPA_GAZETTE_LOOPBACK_SESSION_ACK_SCHEMA,
  CNIPA_GAZETTE_LOOPBACK_SESSION_START_SCHEMA,
  CnipaGazetteLoopbackServer,
  createCnipaGazetteLoopbackToken,
} from "./cnipa-gazette-loopback-server";

const TOKEN = "b".repeat(48);
const EXTENSION_ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const SOURCE_URL =
  "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg";

function startBody(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: CNIPA_GAZETTE_LOOPBACK_SESSION_START_SCHEMA,
    sessionId: "gazette-loopback-75",
    announcementIssue: 75,
    sourceUrl: SOURCE_URL,
    capturedQuery: {
      anncIssue: "75",
      anncType: "",
      pageIndex: 1,
      pageSize: 30,
    },
    sourceTotal: 60,
    sourcePages: 2,
    announcementDate: "1983-08-15",
    startedAt: "2026-09-20T08:30:00.000Z",
    ...overrides,
  };
}

function authHeaders(extra: Record<string, string> = {}) {
  return {
    Origin: EXTENSION_ORIGIN,
    Authorization: `Bearer ${TOKEN}`,
    ...extra,
  };
}

type AcceptedPage = {
  requestedPageIndex: number;
  observedAt: string;
  httpStatus: number;
  rawBody: Uint8Array;
  contentType?: string;
};

function streamFactory(calls: AcceptedPage[]) {
  return () => {
    let nextSourcePageIndex = 1;
    const plans = [
      {
        logicalRange: { startPage: 1, endPage: 1 },
        sourceRange: { startPage: 1, endPage: 2 },
        terminal: true,
      },
    ];
    return {
      checkpointPlans: () => plans,
      snapshot: () =>
        ({
          nextSourcePageIndex,
          completed: nextSourcePageIndex > 2,
        }) as never,
      acceptSourcePage: async (input: AcceptedPage) => {
        calls.push({
          ...input,
          rawBody: new Uint8Array(input.rawBody),
        });
        const currentPage = input.requestedPageIndex;
        nextSourcePageIndex = currentPage + 1;
        return {
          sourcePageIndex: currentPage,
          state: {
            nextSourcePageIndex,
          },
          checkpoint: null,
          completed: nextSourcePageIndex > 2,
        } as unknown as CnipaGazetteBrowserPageCommit;
      },
    };
  };
}

async function startSession(baseUrl: string, body = startBody()) {
  return fetch(`${baseUrl}/v1/cnipa-gazette/sessions`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
}

async function sendPage(input: {
  baseUrl: string;
  fingerprint: string;
  pageIndex: number;
  body: Uint8Array;
  extraHeaders?: Record<string, string>;
}) {
  return fetch(
    `${input.baseUrl}/v1/cnipa-gazette/sessions/gazette-loopback-75/pages/${input.pageIndex}`,
    {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/octet-stream",
        "X-MO-Session-Fingerprint": input.fingerprint,
        "X-MO-Observed-At": `2026-09-20T08:${String(input.pageIndex).padStart(2, "0")}:00.000Z`,
        "X-MO-Source-HTTP-Status": "200",
        "X-MO-Source-Content-Type": "application/json;charset=UTF-8",
        ...(input.extraHeaders ?? {}),
      }),
      body: input.body as unknown as BodyInit,
    },
  );
}

async function spoofedHostStatus(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/healthz",
        method: "GET",
        headers: { Host: "evil.example" },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.on("error", reject);
    request.end();
  });
}

describe("CNIPA Gazette loopback server", () => {
  it("binds only to loopback and enforces Host, Origin, token and PNA preflight", async () => {
    const calls: AcceptedPage[] = [];
    const server = new CnipaGazetteLoopbackServer({
      bridgeToken: TOKEN,
      allowedExtensionOrigins: [EXTENSION_ORIGIN],
      createStream: streamFactory(calls),
    });
    const address = await server.listen(0);
    try {
      expect(address.host).toBe("127.0.0.1");
      expect(address.baseUrl).toBe(`http://127.0.0.1:${address.port}`);

      const health = await fetch(`${address.baseUrl}/healthz`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: "ok" });
      expect(await spoofedHostStatus(address.port)).toBe(403);

      const badOrigin = await fetch(`${address.baseUrl}/v1/cnipa-gazette/sessions`, {
        method: "POST",
        headers: {
          Origin: `chrome-extension://${"c".repeat(32)}`,
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(startBody()),
      });
      expect(badOrigin.status).toBe(403);

      const badToken = await fetch(`${address.baseUrl}/v1/cnipa-gazette/sessions`, {
        method: "POST",
        headers: {
          Origin: EXTENSION_ORIGIN,
          Authorization: `Bearer ${"d".repeat(48)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(startBody()),
      });
      expect(badToken.status).toBe(401);

      const preflight = await fetch(`${address.baseUrl}/v1/cnipa-gazette/sessions`, {
        method: "OPTIONS",
        headers: {
          Origin: EXTENSION_ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Private-Network": "true",
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe(EXTENSION_ORIGIN);
      expect(preflight.headers.get("access-control-allow-private-network")).toBe("true");
    } finally {
      await server.close();
    }
  });

  it("creates an idempotent scoped session and permits authenticated cleanup", async () => {
    const calls: AcceptedPage[] = [];
    const server = new CnipaGazetteLoopbackServer({
      bridgeToken: TOKEN,
      allowedExtensionOrigins: [EXTENSION_ORIGIN],
      createStream: streamFactory(calls),
    });
    const address = await server.listen(0);
    try {
      const created = await startSession(address.baseUrl);
      expect(created.status).toBe(201);
      const ack = (await created.json()) as Record<string, unknown>;
      expect(ack).toMatchObject({
        schemaVersion: CNIPA_GAZETTE_LOOPBACK_SESSION_ACK_SCHEMA,
        sessionId: "gazette-loopback-75",
        nextSourcePageIndex: 1,
        sourcePages: 2,
      });
      const fingerprint = String(ack.sessionFingerprintSha256);

      const repeated = await startSession(address.baseUrl);
      expect(repeated.status).toBe(200);

      const conflicting = await startSession(
        address.baseUrl,
        startBody({ startedAt: "2026-09-20T08:31:00.000Z" }),
      );
      expect(conflicting.status).toBe(409);

      const wrongDelete = await fetch(
        `${address.baseUrl}/v1/cnipa-gazette/sessions/gazette-loopback-75`,
        {
          method: "DELETE",
          headers: authHeaders({
            "X-MO-Session-Fingerprint": "0".repeat(64),
          }),
        },
      );
      expect(wrongDelete.status).toBe(409);

      const deleted = await fetch(
        `${address.baseUrl}/v1/cnipa-gazette/sessions/gazette-loopback-75`,
        {
          method: "DELETE",
          headers: authHeaders({
            "X-MO-Session-Fingerprint": fingerprint,
          }),
        },
      );
      expect(deleted.status).toBe(204);

      const recreated = await startSession(address.baseUrl);
      expect(recreated.status).toBe(201);
    } finally {
      await server.close();
    }
  });

  it("forwards exact source bytes and makes the last page ACK idempotent", async () => {
    const calls: AcceptedPage[] = [];
    const server = new CnipaGazetteLoopbackServer({
      bridgeToken: TOKEN,
      allowedExtensionOrigins: [EXTENSION_ORIGIN],
      createStream: streamFactory(calls),
    });
    const address = await server.listen(0);
    try {
      const created = await startSession(address.baseUrl);
      const sessionAck = (await created.json()) as Record<string, unknown>;
      const fingerprint = String(sessionAck.sessionFingerprintSha256);
      const body = new TextEncoder().encode('{"code":0,"data":{"pageIndex":1}}');

      const first = await sendPage({
        baseUrl: address.baseUrl,
        fingerprint,
        pageIndex: 1,
        body,
      });
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({
        schemaVersion: CNIPA_GAZETTE_LOOPBACK_PAGE_ACK_SCHEMA,
        sourcePageIndex: 1,
        nextSourcePageIndex: 2,
        completed: false,
      });
      expect(calls).toHaveLength(1);
      expect(Array.from(calls[0]!.rawBody)).toEqual(Array.from(body));
      expect(calls[0]).toMatchObject({
        requestedPageIndex: 1,
        httpStatus: 200,
        contentType: "application/json;charset=UTF-8",
      });

      const retry = await sendPage({
        baseUrl: address.baseUrl,
        fingerprint,
        pageIndex: 1,
        body,
      });
      expect(retry.status).toBe(200);
      expect(calls).toHaveLength(1);

      const changedRetry = await sendPage({
        baseUrl: address.baseUrl,
        fingerprint,
        pageIndex: 1,
        body: new TextEncoder().encode('{"different":true}'),
      });
      expect(changedRetry.status).toBe(409);
      expect(calls).toHaveLength(1);

      const badFingerprint = await sendPage({
        baseUrl: address.baseUrl,
        fingerprint: "f".repeat(64),
        pageIndex: 2,
        body,
      });
      expect(badFingerprint.status).toBe(409);
      expect(calls).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
  it("rejects oversized bodies and invalid source MIME before the stream sees them", async () => {
    const calls: AcceptedPage[] = [];
    const server = new CnipaGazetteLoopbackServer({
      bridgeToken: TOKEN,
      allowedExtensionOrigins: [EXTENSION_ORIGIN],
      createStream: streamFactory(calls),
      maxBodyBytes: 1024,
    });
    const address = await server.listen(0);
    try {
      const created = await startSession(address.baseUrl);
      const sessionAck = (await created.json()) as Record<string, unknown>;
      const fingerprint = String(sessionAck.sessionFingerprintSha256);

      const oversized = await sendPage({
        baseUrl: address.baseUrl,
        fingerprint,
        pageIndex: 1,
        body: new Uint8Array(1025),
      });
      expect(oversized.status).toBe(413);

      const invalidMime = await sendPage({
        baseUrl: address.baseUrl,
        fingerprint,
        pageIndex: 1,
        body: new TextEncoder().encode('{"code":0}'),
        extraHeaders: {
          "X-MO-Source-Content-Type": "not a mime type",
        },
      });
      expect(invalidMime.status).toBe(400);
      expect(calls).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it("generates a header-safe in-memory bridge token", () => {
    const token = createCnipaGazetteLoopbackToken();
    expect(token).toMatch(/^[A-Za-z0-9._~-]{32,256}$/u);
  });
});
