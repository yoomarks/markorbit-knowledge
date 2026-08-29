import { describe, expect, it } from "vitest";
import type { CnipaAuthenticatedRequest } from "@markorbit/worker-runtime";
import {
  CnipaPlaywrightSessionExecutorFactory,
  type CnipaBrowserContext,
  type CnipaBrowserPage,
  type CnipaPersistentContextLauncher,
} from "./cnipa-playwright-session-executor";

class FakePage implements CnipaBrowserPage {
  readonly entries: string[] = [];
  readonly requests: unknown[] = [];
  result: Awaited<ReturnType<CnipaBrowserPage["fetch"]>> = {
    kind: "RESPONSE",
    status: 200,
    sourceUri: "https://cnipa.example/api",
    contentType: "application/json",
    bodyBase64: Buffer.from('{"ok":true}').toString("base64"),
  };

  async goto(url: string): Promise<void> {
    this.entries.push(url);
  }

  async fetch(input: unknown) {
    this.requests.push(input);
    return this.result;
  }
}

function fixture() {
  const page = new FakePage();
  let closes = 0;
  const context: CnipaBrowserContext = {
    pages: () => [page],
    async newPage() {
      return page;
    },
    async close() {
      closes += 1;
    },
  };
  const launcher: CnipaPersistentContextLauncher = async () => context;
  const factory = new CnipaPlaywrightSessionExecutorFactory(
    {
      baseUrl: "https://cnipa.example",
      sessionEntryUrl: "https://cnipa.example/portal",
      userDataDir: "/runtime-secret/cnipa-profile",
      executablePath: "/opt/chrome/chrome",
      workingDirectory: "/workspace/repo",
      minRequestIntervalMs: 0,
      maxRequestsPerRun: 2,
    },
    launcher,
  );
  return { page, factory, closes: () => closes };
}

const request: CnipaAuthenticatedRequest = {
  method: "POST",
  path: "/pubnotice/portal/tmscJudgment/queryPageList",
  documentKind: "REGISTRATION_EXAMINATION",
  surface: "LIST",
  jsonBody: { pageIndex: 1, pageSize: 10, regNo: "12345678" },
};

describe("CnipaPlaywrightSessionExecutorFactory", () => {
  it("opens the persistent session entry and caches identical in-run requests", async () => {
    const setup = fixture();
    const session = await setup.factory.create();
    const first = await session.execute(request);
    const second = await session.execute(request);

    expect(setup.page.entries).toEqual(["https://cnipa.example/portal"]);
    expect(setup.page.requests).toHaveLength(1);
    expect(new TextDecoder().decode(first.body)).toBe('{"ok":true}');
    expect(new TextDecoder().decode(second.body)).toBe('{"ok":true}');
    await session.close();
    expect(setup.closes()).toBe(1);
  });

  it("maps browser-side missing bearer state to operator reauthentication", async () => {
    const setup = fixture();
    setup.page.result = { kind: "REAUTH_REQUIRED" };
    const session = await setup.factory.create();
    await expect(session.execute(request)).resolves.toMatchObject({
      status: 401,
      securityState: "REAUTH_REQUIRED",
    });
    await session.close();
  });

  it("fails closed when the per-run request ceiling is reached", async () => {
    const setup = fixture();
    const session = await setup.factory.create();
    await session.execute(request);
    await session.execute({ ...request, jsonBody: { ...request.jsonBody, pageIndex: 2 } });
    await expect(
      session.execute({ ...request, jsonBody: { ...request.jsonBody, pageIndex: 3 } }),
    ).rejects.toMatchObject({ code: "CNIPA_COVERAGE_UNKNOWN", retryable: false });
    await session.close();
  });
});
