import { describe, expect, it, vi } from "vitest";
import type { CoreIntakeRequest } from "@markorbit/contracts";
import {
  configuredCoreIntakeTransport,
  coreIntakeTransportReadiness,
} from "../core-intake-http-transport";

const CORE_WORKSPACE_ID = "123e4567-e89b-12d3-a456-426614174000";

function request(): CoreIntakeRequest {
  return {
    readyPackageId: "rdp_lazy_config",
    workspaceId: CORE_WORKSPACE_ID,
    digest: "a".repeat(64),
    evidence: { artifactIds: ["art_lazy_config"], stagingDocumentId: "stg_lazy_config" },
    submittedAt: "2026-08-10T11:10:00.000Z",
  };
}

describe("configured Core intake transport", () => {
  it("requires URL, secret, and canonical binding before outbound HTTP is eligible", () => {
    const originalUrl = process.env.MARKORBIT_CORE_INTAKE_URL;
    const originalSecret = process.env.MARKORBIT_CORE_INTERNAL_SECRET;
    try {
      delete process.env.MARKORBIT_CORE_INTAKE_URL;
      delete process.env.MARKORBIT_CORE_INTERNAL_SECRET;
      expect(coreIntakeTransportReadiness(CORE_WORKSPACE_ID)).toEqual({
        configured: false,
        issueCode: "CORE_INTAKE_TRANSPORT_NOT_CONFIGURED",
      });

      process.env.MARKORBIT_CORE_INTAKE_URL =
        "https://knowledge.internal.example/v1/ready-package-intake";
      expect(coreIntakeTransportReadiness(CORE_WORKSPACE_ID)).toEqual({
        configured: false,
        issueCode: "CORE_INTAKE_TRANSPORT_AUTH_NOT_CONFIGURED",
      });

      process.env.MARKORBIT_CORE_INTERNAL_SECRET = "test-secret";
      expect(coreIntakeTransportReadiness()).toEqual({
        configured: false,
        issueCode: "CORE_WORKSPACE_NOT_BOUND",
      });
      expect(coreIntakeTransportReadiness("wsp_local")).toEqual({
        configured: false,
        issueCode: "CORE_WORKSPACE_BINDING_INVALID",
      });
      expect(coreIntakeTransportReadiness(CORE_WORKSPACE_ID)).toEqual({
        configured: true,
        issueCode: null,
      });
    } finally {
      if (originalUrl === undefined) delete process.env.MARKORBIT_CORE_INTAKE_URL;
      else process.env.MARKORBIT_CORE_INTAKE_URL = originalUrl;
      if (originalSecret === undefined) delete process.env.MARKORBIT_CORE_INTERNAL_SECRET;
      else process.env.MARKORBIT_CORE_INTERNAL_SECRET = originalSecret;
    }
  });

  it("does not call HTTP when the configured secret is missing", async () => {
    const originalUrl = process.env.MARKORBIT_CORE_INTAKE_URL;
    const originalSecret = process.env.MARKORBIT_CORE_INTERNAL_SECRET;
    const fetchImpl = vi.fn<typeof fetch>();
    try {
      process.env.MARKORBIT_CORE_INTAKE_URL =
        "https://knowledge.internal.example/v1/ready-package-intake";
      delete process.env.MARKORBIT_CORE_INTERNAL_SECRET;
      await expect(
        configuredCoreIntakeTransport(fetchImpl).submit(request(), "core-intake:cis_lazy_config"),
      ).rejects.toMatchObject({
        code: "CORE_INTAKE_TRANSPORT_AUTH_NOT_CONFIGURED",
        httpStatus: 503,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      if (originalUrl === undefined) delete process.env.MARKORBIT_CORE_INTAKE_URL;
      else process.env.MARKORBIT_CORE_INTAKE_URL = originalUrl;
      if (originalSecret === undefined) delete process.env.MARKORBIT_CORE_INTERNAL_SECRET;
      else process.env.MARKORBIT_CORE_INTERNAL_SECRET = originalSecret;
    }
  });

  it("surfaces invalid destination configuration without exposing the URL", () => {
    const originalUrl = process.env.MARKORBIT_CORE_INTAKE_URL;
    const originalSecret = process.env.MARKORBIT_CORE_INTERNAL_SECRET;
    process.env.MARKORBIT_CORE_INTAKE_URL = "not-a-url";
    process.env.MARKORBIT_CORE_INTERNAL_SECRET = "test-secret";
    try {
      expect(coreIntakeTransportReadiness(CORE_WORKSPACE_ID)).toEqual({
        configured: false,
        issueCode: "CORE_INTAKE_TRANSPORT_URL_INVALID",
      });
    } finally {
      if (originalUrl === undefined) delete process.env.MARKORBIT_CORE_INTAKE_URL;
      else process.env.MARKORBIT_CORE_INTAKE_URL = originalUrl;
      if (originalSecret === undefined) delete process.env.MARKORBIT_CORE_INTERNAL_SECRET;
      else process.env.MARKORBIT_CORE_INTERNAL_SECRET = originalSecret;
    }
  });
});
