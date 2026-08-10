import { describe, expect, it, vi } from "vitest";
import type { CoreIntakeRequest } from "@markorbit/contracts";
import { configuredCoreIntakeTransport } from "../core-intake-http-transport";

function request(): CoreIntakeRequest {
  return {
    readyPackageId: "rdp_lazy_config",
    workspaceId: "wsp_lazy_config",
    digest: "a".repeat(64),
    evidence: {
      artifactIds: ["art_lazy_config"],
      stagingDocumentId: "stg_lazy_config",
    },
    submittedAt: "2026-08-10T11:10:00.000Z",
  };
}

describe("configured Core intake transport", () => {
  it("defers missing endpoint configuration until an outbound submit is actually required", async () => {
    const originalUrl = process.env.MARKORBIT_CORE_INTAKE_URL;
    delete process.env.MARKORBIT_CORE_INTAKE_URL;
    const fetchImpl = vi.fn<typeof fetch>();

    try {
      const transport = configuredCoreIntakeTransport(fetchImpl);

      expect(fetchImpl).not.toHaveBeenCalled();
      await expect(
        transport.submit(request(), "core-intake:cis_lazy_config"),
      ).rejects.toMatchObject({
        code: "CORE_INTAKE_TRANSPORT_NOT_CONFIGURED",
        httpStatus: 503,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      if (originalUrl === undefined) delete process.env.MARKORBIT_CORE_INTAKE_URL;
      else process.env.MARKORBIT_CORE_INTAKE_URL = originalUrl;
    }
  });
});
