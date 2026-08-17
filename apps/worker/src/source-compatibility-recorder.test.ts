import { describe, expect, it } from "vitest";
import { recordRepresentativeLiveCanarySummary } from "./source-compatibility-recorder";

describe("source compatibility recorder", () => {
  it("posts the summary with the worker bearer credential", async () => {
    const summary = {
      version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
      observedAt: "2026-08-18T00:00:00.000Z",
      observations: [],
    };
    let url = "";
    let options: RequestInit | undefined;
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      options = init;
      return new Response(
        JSON.stringify({
          version: "SOURCE_COMPATIBILITY_WORKER_INTAKE_V1",
          recorded: 0,
          observedAt: null,
          states: { PASS: 0, DEGRADED: 0, BLOCKED: 0 },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await recordRepresentativeLiveCanarySummary(
      {
        controlPlaneUrl: "https://knowledge.example.test/",
        workerId: "worker-1",
        workerCredential: "secret-credential",
      },
      summary,
      fakeFetch,
    );

    expect(url).toBe(
      "https://knowledge.example.test/api/worker/v1/source-compatibility-observations",
    );
    expect(options?.method).toBe("POST");
    expect(options?.headers).toMatchObject({
      authorization: "Bearer secret-credential",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(options?.body))).toEqual({ workerId: "worker-1", summary });
    expect(result.recorded).toBe(0);
  });

  it("fails closed when the control plane rejects the worker identity", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { code: "WORKER_AUTHENTICATION_FAILED" } }), {
        status: 401,
      })) as typeof fetch;

    await expect(
      recordRepresentativeLiveCanarySummary(
        {
          controlPlaneUrl: "https://knowledge.example.test",
          workerId: "worker-1",
          workerCredential: "wrong",
        },
        {},
        fakeFetch,
      ),
    ).rejects.toThrow("Source compatibility observation intake failed (401)");
  });
});
