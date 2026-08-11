import { describe, expect, it, vi } from "vitest";
import type { CoreIntakeRequest } from "@markorbit/contracts";
import { CoreIntakeTransportError, HttpCoreIntakeTransport } from "../core-intake-http-transport";

const CORE_WORKSPACE_ID = "123e4567-e89b-12d3-a456-426614174000";
const SECRET = "test-internal-secret";

function request(): CoreIntakeRequest {
  return {
    readyPackageId: "rdp_test",
    workspaceId: CORE_WORKSPACE_ID,
    digest: "a".repeat(64),
    evidence: {
      artifactIds: ["art_test"],
      stagingDocumentId: "stg_test",
    },
    submittedAt: "2026-08-10T05:10:00.000Z",
  };
}

describe("R1-K01 Core intake HTTP transport", () => {
  it("posts the exact envelope, idempotency key, and internal authorization header", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            intakeId: "intake_test",
            status: "RECEIVED",
            readyPackageId: "rdp_test",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const transport = new HttpCoreIntakeTransport(
      "https://knowledge.internal.example/v1/ready-package-intake",
      SECRET,
      fetchImpl as typeof fetch,
    );

    const result = await transport.submit(request(), "core-intake:cis_test");

    expect(result).toEqual({
      intakeId: "intake_test",
      status: "RECEIVED",
      readyPackageId: "rdp_test",
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://knowledge.internal.example/v1/ready-package-intake");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "idempotency-key": "core-intake:cis_test",
      "x-markorbit-internal-authorization": SECRET,
    });
    expect(JSON.parse(String(init.body))).toEqual(request());
  });

  it("blocks non-UUID Core workspace IDs before HTTP", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const transport = new HttpCoreIntakeTransport(
      "https://knowledge.internal.example/intake",
      SECRET,
      fetchImpl as typeof fetch,
    );
    await expect(
      transport.submit({ ...request(), workspaceId: "wsp_local" }, "core-intake:cis_bad"),
    ).rejects.toMatchObject({
      code: "CORE_WORKSPACE_BINDING_INVALID",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("aborts a hung downstream request at the bounded delivery timeout", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return reject(new Error("expected transport abort signal"));
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    );
    const transport = new HttpCoreIntakeTransport(
      "https://knowledge.internal.example/intake",
      SECRET,
      fetchImpl as typeof fetch,
      20,
    );
    await expect(transport.submit(request(), "core-intake:cis_timeout")).rejects.toMatchObject({
      code: "CORE_INTAKE_TRANSPORT_TIMEOUT",
      httpStatus: 504,
    });
  });

  it("rejects mismatched or structurally invalid downstream results", async () => {
    const mismatch = new HttpCoreIntakeTransport(
      "https://knowledge.internal.example/intake",
      SECRET,
      (async () =>
        new Response(
          JSON.stringify({
            intakeId: "intake_other",
            status: "ACCEPTED",
            readyPackageId: "rdp_other",
          }),
          { status: 200 },
        )) as typeof fetch,
    );
    await expect(mismatch.submit(request(), "core-intake:cis_test")).rejects.toMatchObject({
      code: "CORE_INTAKE_TRANSPORT_PACKAGE_MISMATCH",
    });

    const extraField = new HttpCoreIntakeTransport(
      "https://knowledge.internal.example/intake",
      SECRET,
      (async () =>
        new Response(
          JSON.stringify({
            intakeId: "intake_test",
            status: "RECEIVED",
            readyPackageId: "rdp_test",
            accepted: true,
          }),
          { status: 200 },
        )) as typeof fetch,
    );
    await expect(extraField.submit(request(), "core-intake:cis_test")).rejects.toBeInstanceOf(
      CoreIntakeTransportError,
    );
  });

  it("never exposes the internal secret in transport errors", async () => {
    const transport = new HttpCoreIntakeTransport(
      "https://knowledge.internal.example/intake",
      SECRET,
      (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
    );
    let caught: unknown;
    try {
      await transport.submit(request(), "core-intake:cis_test");
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "CORE_INTAKE_TRANSPORT_HTTP_ERROR", httpStatus: 502 });
    expect(String(caught)).not.toContain(SECRET);
  });
});
