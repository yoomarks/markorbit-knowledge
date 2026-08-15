import { RegistryError, RegistryValidationError } from "@markorbit/persistence";

const DEFAULT_TIMEOUT_MS = 45_000;

export type CapabilityConnectionStatus = {
  capability: string;
  configured: boolean;
  endpoint?: string;
};

function configuredTimeoutMs(): number {
  const configured = process.env.MARKORBIT_CAPABILITY_TIMEOUT_MS?.trim();
  if (!configured) return DEFAULT_TIMEOUT_MS;
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 180_000) {
    throw new RegistryValidationError(
      "MARKORBIT_CAPABILITY_TIMEOUT_MS must be an integer from 1000 to 180000",
    );
  }
  return value;
}

function requestTimeoutMs(value: number | undefined): number {
  if (value === undefined) return configuredTimeoutMs();
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 180_000) {
    throw new RegistryValidationError(
      "Capability timeoutMs must be an integer from 1000 to 180000",
    );
  }
  return value;
}

function bearerHeaders(): Record<string, string> {
  const token = process.env.MARKORBIT_CAPABILITY_API_KEY?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function capabilityEndpoint(capabilityId: string): string | null {
  const base = process.env.MARKORBIT_CAPABILITY_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/v1/capabilities/${encodeURIComponent(capabilityId)}`;
}

export function capabilityConnectionStatus(capabilityId: string): CapabilityConnectionStatus {
  const endpoint = capabilityEndpoint(capabilityId);
  return {
    capability: capabilityId,
    configured: Boolean(endpoint),
    ...(endpoint ? { endpoint } : {}),
  };
}

export async function invokeCapability<TRequest, TResponse>(input: {
  capabilityId: string;
  request: TRequest;
  validate: (value: unknown) => TResponse;
  errorCodePrefix: string;
  timeoutMs?: number;
}): Promise<TResponse> {
  const endpoint = capabilityEndpoint(input.capabilityId);
  if (!endpoint) {
    throw new RegistryError(
      `${input.errorCodePrefix}_NOT_CONFIGURED`,
      `Shared capability ${input.capabilityId} is not configured. Set MARKORBIT_CAPABILITY_BASE_URL to the reusable capability service.`,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs(input.timeoutMs));
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...bearerHeaders(),
      },
      body: JSON.stringify(input.request),
      signal: controller.signal,
    });
  } catch (error) {
    throw new RegistryError(
      `${input.errorCodePrefix}_UNAVAILABLE`,
      error instanceof Error
        ? error.message
        : `Shared capability ${input.capabilityId} is unavailable`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = (await response.text()).slice(0, 1000);
    throw new RegistryError(
      `${input.errorCodePrefix}_HTTP_ERROR`,
      `Shared capability ${input.capabilityId} returned HTTP ${response.status}${text ? `: ${text}` : ""}`,
    );
  }

  return input.validate((await response.json()) as unknown);
}
