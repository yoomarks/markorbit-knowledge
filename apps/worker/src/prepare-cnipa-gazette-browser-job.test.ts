import { describe, expect, it } from "vitest";
import {
  cnipaGazetteBrowserConnectorManifest,
  cnipaGazetteBrowserPlanPayload,
  cnipaGazetteBrowserSourcePayload,
  cnipaGazetteBrowserWorkerPayload,
  CNIPA_GAZETTE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
} from "@markorbit/worker-runtime";
import {
  parseCnipaGazetteBrowserJobArguments,
  prepareCnipaGazetteBrowserJob,
} from "./prepare-cnipa-gazette-browser-job";

const WSP = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SRC = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PLN = "pln_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const WRK = "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RUN = "run_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const JOB = "job_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bodyOf(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}
function controlPlane() {
  let connector: Record<string, unknown> | null = null;
  let source: Record<string, unknown> | null = null;
  let plan: Record<string, unknown> | null = null;
  let worker: Record<string, unknown> | null = null;
  const creates: string[] = [];

  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    if (
      url.pathname ===
        `/api/connectors/${CNIPA_GAZETTE_JOB_CONNECTOR_ID}/${CNIPA_GAZETTE_JOB_CONNECTOR_VERSION}` &&
      method === "GET"
    ) {
      return connector ? json(200, { connector }) : json(404, { error: { message: "not found" } });
    }
    if (url.pathname === "/api/connectors" && method === "POST") {
      creates.push("connector");
      connector = bodyOf(init);
      return json(201, { connector });
    }
    if (url.pathname === "/api/sources" && method === "GET") {
      return json(200, { items: source ? [source] : [] });
    }
    if (url.pathname === "/api/sources" && method === "POST") {
      creates.push("source");
      source = { ...bodyOf(init), id: SRC };
      return json(201, { source });
    }
    if (url.pathname === "/api/plans" && method === "GET") {
      return json(200, { items: plan ? [{ plan }] : [] });
    }
    if (url.pathname === "/api/plans" && method === "POST") {
      creates.push("plan");
      plan = { ...bodyOf(init), id: PLN };
      return json(201, { plan: { plan } });
    }
    if (url.pathname === "/api/workers" && method === "GET") {
      return json(200, { items: worker ? [{ worker }] : [] });
    }
    if (url.pathname === "/api/workers" && method === "POST") {
      creates.push("worker");
      worker = { ...bodyOf(init), id: WRK };
      return json(201, { view: { worker }, credential: "worker-secret-once" });
    }
    if (url.pathname === "/api/runs" && method === "POST") {
      creates.push("run");
      if (!source || !plan) throw new Error("source/plan must exist before dispatch");
      const job = {
        id: JOB,
        runId: RUN,
        workspaceId: WSP,
        sourceId: SRC,
        planId: PLN,
        jobType: "API_COLLECTION",
        connector: {
          connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
          version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
        },
        sourceSnapshot: source,
        planSnapshot: plan,
      };
      return json(201, { replayed: false, record: { run: { id: RUN }, jobs: [job] } });
    }
    throw new Error(`unexpected ${method} ${url.pathname}`);
  };

  return { fetcher, creates, current: () => ({ connector, source, plan, worker }) };
}
describe("CNIPA Gazette browser Job preparation", () => {
  it("parses prepare-only defaults and explicit dispatch", () => {
    expect(parseCnipaGazetteBrowserJobArguments(["--workspace", WSP, "--issue", "75"])).toEqual({
      workspaceId: WSP,
      announcementIssue: 75,
      targetLogicalPagesPerCheckpoint: 24,
      maxRuntimeSeconds: 21600,
      dispatch: false,
    });
    expect(
      parseCnipaGazetteBrowserJobArguments(["--workspace", WSP, "--issue", "75", "--dispatch"])
        .dispatch,
    ).toBe(true);
  });

  it("creates governed resources once, then reuses them and returns the exact dispatched jobId", async () => {
    const cp = controlPlane();
    const args = parseCnipaGazetteBrowserJobArguments(["--workspace", WSP, "--issue", "75"]);
    const prepared = await prepareCnipaGazetteBrowserJob(args, {
      baseUrl: "https://knowledge.example.test",
      fetcher: cp.fetcher,
    });
    expect(prepared).toMatchObject({
      sourceId: SRC,
      planId: PLN,
      workerId: WRK,
      workerCredential: "worker-secret-once",
      dispatched: false,
      runId: null,
      jobId: null,
      historicalReplayActivated: false,
    });
    expect(cp.creates).toEqual(["connector", "source", "plan", "worker"]);

    const dispatched = await prepareCnipaGazetteBrowserJob(
      { ...args, dispatch: true },
      { baseUrl: "https://knowledge.example.test", fetcher: cp.fetcher },
    );
    expect(dispatched).toMatchObject({
      sourceId: SRC,
      planId: PLN,
      workerId: WRK,
      workerCredential: null,
      dispatched: true,
      runId: RUN,
      jobId: JOB,
      replayed: false,
      historicalReplayActivated: false,
    });
    expect(cp.creates).toEqual(["connector", "source", "plan", "worker", "run"]);

    const state = cp.current();
    expect(state.connector).toEqual(cnipaGazetteBrowserConnectorManifest());
    expect(state.source).toEqual({ ...cnipaGazetteBrowserSourcePayload(WSP), id: SRC });
    expect(state.plan).toEqual({
      ...cnipaGazetteBrowserPlanPayload({ workspaceId: WSP, sourceId: SRC, announcementIssue: 75 }),
      id: PLN,
    });
    expect(state.worker).toEqual({ ...cnipaGazetteBrowserWorkerPayload(WSP), id: WRK });
  });

  it("fails closed if an existing connector uses the same id/version without the browser contract", async () => {
    const badFetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/api/connectors/")) {
        return json(200, {
          connector: {
            ...cnipaGazetteBrowserConnectorManifest(),
            extensions: {},
          },
        });
      }
      throw new Error("should not continue after connector drift");
    };
    await expect(
      prepareCnipaGazetteBrowserJob(
        parseCnipaGazetteBrowserJobArguments(["--workspace", WSP, "--issue", "75"]),
        { baseUrl: "https://knowledge.example.test", fetcher: badFetcher },
      ),
    ).rejects.toThrow(/connector drifted/);
  });
});
