import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coreContentTransportReadiness,
  HttpCoreContentTransport,
} from "../core-content-http-transport";

const intakeUrl = "http://127.0.0.1:4101/internal/knowledge/ready-packages/intakes";
const intakeId = "01900000-0000-7000-8000-000000000001";
const readyPackageId = "rdp_01H00000000000000000000001";
const exportSha256 = "a".repeat(64);
const requestJson = '{"frozen":true}';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Core content HTTP transport", () => {
  it("reports content readiness from destination and auth without requiring a workspace binding", () => {
    vi.stubEnv("MARKORBIT_CORE_INTAKE_URL", intakeUrl);
    vi.stubEnv("MARKORBIT_CORE_INTERNAL_SECRET", "secret");
    expect(coreContentTransportReadiness()).toEqual({ configured: true, issueCode: null });
  });

  it("reports missing content auth without exposing the secret or destination", () => {
    vi.stubEnv("MARKORBIT_CORE_INTAKE_URL", intakeUrl);
    vi.stubEnv("MARKORBIT_CORE_INTERNAL_SECRET", "");
    expect(coreContentTransportReadiness()).toEqual({
      configured: false,
      issueCode: "CORE_CONTENT_TRANSPORT_AUTH_NOT_CONFIGURED",
    });
  });

  it("posts the exact frozen JSON to the intake content endpoint with internal auth", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toBe(`${intakeUrl}/${intakeId}/content`);
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(requestJson);
      expect(init?.headers).toMatchObject({
        "content-type": "application/json",
        "x-markorbit-internal-authorization": "secret",
      });
      return response({ intakeId, readyPackageId, status: "ACCEPTED", exportSha256 });
    });
    const transport = new HttpCoreContentTransport(intakeUrl, "secret", fetchImpl as typeof fetch);
    await expect(
      transport.submit(intakeId, requestJson, { readyPackageId, exportSha256 }),
    ).resolves.toEqual({ intakeId, readyPackageId, status: "ACCEPTED", exportSha256 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects a Core result that does not match the frozen export fingerprint", async () => {
    const transport = new HttpCoreContentTransport(intakeUrl, "secret", (async () =>
      response({
        intakeId,
        readyPackageId,
        status: "ACCEPTED",
        exportSha256: "b".repeat(64),
      })) as typeof fetch);
    await expect(
      transport.submit(intakeId, requestJson, { readyPackageId, exportSha256 }),
    ).rejects.toMatchObject({ code: "CORE_CONTENT_TRANSPORT_RESULT_MISMATCH", httpStatus: 502 });
  });

  it("maps an aborted request to a bounded timeout error", async () => {
    const transport = new HttpCoreContentTransport(
      intakeUrl,
      "secret",
      (async () => {
        throw new DOMException("aborted", "AbortError");
      }) as typeof fetch,
      10,
    );
    await expect(
      transport.submit(intakeId, requestJson, { readyPackageId, exportSha256 }),
    ).rejects.toMatchObject({ code: "CORE_CONTENT_TRANSPORT_TIMEOUT", httpStatus: 504 });
  });
});
