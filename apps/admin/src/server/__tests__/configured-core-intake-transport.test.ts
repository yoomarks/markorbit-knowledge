import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoreIntakeRequest } from "@markorbit/contracts";
import {
  configuredCoreIntakeTransport,
  coreIntakeTransportReadiness,
} from "../core-intake-http-transport";

const ENV_KEYS = [
  "MARKORBIT_CORE_INTAKE_URL",
  "MARKORBIT_CORE_INTERNAL_SERVICE_SECRET",
  "MARKORBIT_CORE_WORKSPACE_BINDINGS",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const CORE_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const INTERNAL_SECRET = "knowledge-to-core-internal-secret-123456";

function request(): CoreIntakeRequest {
  return {
    readyPackageId: "rdp_lazy_config",
    workspaceId: CORE_WORKSPACE_ID,
    digest: "a".repeat(64),
    evidence: {
      artifactIds: ["art_lazy_config"],
      stagingDocumentId: "stg_lazy_config",
    },
    submittedAt: "2026-08-10T11:10:00.000Z",
  };
}

function configureReceiver() {
  process.env.MARKORBIT_CORE_INTAKE_URL =
    "https://core.internal.example/internal/knowledge/ready-packages/intakes";
  process.env.MARKORBIT_CORE_INTERNAL_SERVICE_SECRET = INTERNAL_SECRET;
  process.env.MARKORBIT_CORE_WORKSPACE_BINDINGS = JSON.stringify({
    wsp_lazy_config: CORE_WORKSPACE_ID,
  });
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("configured Core intake transport", () => {
  it("reports missing destination without constructing or calling outbound HTTP", async () => {
    delete process.env.MARKORBIT_CORE_INTAKE_URL;
    const fetchImpl = vi.fn<typeof fetch>();

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
  });

  it("requires Core internal service authorization without exposing the secret", () => {
    process.env.MARKORBIT_CORE_INTAKE_URL =
      "https://core.internal.example/internal/knowledge/ready-packages/intakes";
    delete process.env.MARKORBIT_CORE_INTERNAL_SERVICE_SECRET;

    expect(coreIntakeTransportReadiness()).toEqual({
      configured: false,
      issueCode: "CORE_INTAKE_TRANSPORT_AUTH_NOT_CONFIGURED",
    });
  });

  it("reports URL, auth and workspace binding readiness for a Knowledge workspace", () => {
    configureReceiver();

    expect(coreIntakeTransportReadiness("wsp_lazy_config")).toEqual({
      configured: true,
      issueCode: null,
    });
    expect(coreIntakeTransportReadiness("wsp_unbound")).toEqual({
      configured: false,
      issueCode: "CORE_INTAKE_WORKSPACE_BINDING_NOT_CONFIGURED",
    });
  });

  it("uses a frozen Core workspace without consulting current workspace bindings", () => {
    configureReceiver();
    delete process.env.MARKORBIT_CORE_WORKSPACE_BINDINGS;

    expect(coreIntakeTransportReadiness("wsp_lazy_config", CORE_WORKSPACE_ID)).toEqual({
      configured: true,
      issueCode: null,
    });
  });

  it("sends the configured internal authorization header only on outbound submit", async () => {
    configureReceiver();
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.headers).toEqual({
        "content-type": "application/json",
        "idempotency-key": "core-intake:cis_lazy_config",
        "x-markorbit-internal-authorization": INTERNAL_SECRET,
      });
      return new Response(
        JSON.stringify({
          intakeId: "22222222-2222-4222-8222-222222222222",
          status: "RECEIVED",
          readyPackageId: "rdp_lazy_config",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    const transport = configuredCoreIntakeTransport(fetchImpl);

    expect(transport.resolveDestinationWorkspaceId?.("wsp_lazy_config")).toBe(CORE_WORKSPACE_ID);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(transport.submit(request(), "core-intake:cis_lazy_config")).resolves.toMatchObject({
      status: "RECEIVED",
      readyPackageId: "rdp_lazy_config",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces invalid local destination configuration without exposing the URL", () => {
    process.env.MARKORBIT_CORE_INTAKE_URL = "not-a-url";

    expect(coreIntakeTransportReadiness()).toEqual({
      configured: false,
      issueCode: "CORE_INTAKE_TRANSPORT_URL_INVALID",
    });
  });
});
