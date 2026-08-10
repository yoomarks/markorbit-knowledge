import { describe, expect, it, vi } from "vitest";
import type { CoreIntakeRequest } from "@markorbit/contracts";
import { CoreIntakeTransportError, HttpCoreIntakeTransport } from "../core-intake-http-transport";

function request(): CoreIntakeRequest {
  return {
    readyPackageId: "rdp_test",
    workspaceId: "wsp_test",
    digest: "a".repeat(64),
    evidence: {
      artifactIds: ["art_test"],
      stagingDocumentId: "stg_test",
    },
    submittedAt: "2026-08-10T05:10:00.000Z",
  };
}

describe("M36 Core intake HTTP transport", () => {
  it("posts the exact submission envelope with its stable idempotency key", async () => {
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
      fetchImpl as typeof fetch,
    );

    const result = await transport.submit(request(), "core-intake:cis_test");

    expect(result).toEqual({
      intakeId: "intake_test",
      status: "RECEIVED",
      readyPackageId: "rdp_test",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://knowledge.internal.example/v1/ready-package-intake");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "idempotency-key": "core-intake:cis_test",
    });
    expect(JSON.parse(String(init.body))).toEqual(request());
  });

  it("rejects mismatched or structurally invalid downstream results", async () => {
    const mismatch = new HttpCoreIntakeTransport(
      "https://knowledge.internal.example/intake",
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

  it("does not turn transport failures into Core intake results", async () => {
    const transport = new HttpCoreIntakeTransport(
      "https://knowledge.internal.example/intake",
      (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
    );

    await expect(transport.submit(request(), "core-intake:cis_test")).rejects.toMatchObject({
      code: "CORE_INTAKE_TRANSPORT_HTTP_ERROR",
      httpStatus: 502,
    });
  });
});
