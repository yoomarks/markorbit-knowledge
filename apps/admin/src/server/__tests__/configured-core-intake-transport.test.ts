import { describe, expect, it, vi } from "vitest";
import type { CoreIntakeRequest } from "@markorbit/contracts";
import {
  configuredCoreIntakeTransport,
  coreIntakeTransportReadiness,
} from "../core-intake-http-transport";

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
  it("reports missing configuration without constructing or calling outbound HTTP", async () => {
    const originalUrl = process.env.MARKORBIT_CORE_INTAKE_URL;
    delete process.env.MARKORBIT_CORE_INTAKE_URL;
    const fetchImpl = vi.fn<typeof fetch>();

    try {
      expect(coreIntakeTransportReadiness()).toEqual({
        configured: false,
        issueCode: "CORE_INTAKE_TRANSPORT_NOT_CONFIGURED",
      });

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

  it("reports only local destination configuration readiness", () => {
    const originalUrl = process.env.MARKORBIT_CORE_INTAKE_URL;
    process.env.MARKORBIT_CORE_INTAKE_URL =
      "https://knowledge.internal.example/v1/ready-package-intake";

    try {
      expect(coreIntakeTransportReadiness()).toEqual({
        configured: true,
        issueCode: null,
      });
    } finally {
      if (originalUrl === undefined) delete process.env.MARKORBIT_CORE_INTAKE_URL;
      else process.env.MARKORBIT_CORE_INTAKE_URL = originalUrl;
    }
  });

  it("surfaces invalid local destination configuration without exposing the URL", () => {
    const originalUrl = process.env.MARKORBIT_CORE_INTAKE_URL;
    process.env.MARKORBIT_CORE_INTAKE_URL = "not-a-url";

    try {
      expect(coreIntakeTransportReadiness()).toEqual({
        configured: false,
        issueCode: "CORE_INTAKE_TRANSPORT_URL_INVALID",
      });
    } finally {
      if (originalUrl === undefined) delete process.env.MARKORBIT_CORE_INTAKE_URL;
      else process.env.MARKORBIT_CORE_INTAKE_URL = originalUrl;
    }
  });
});
