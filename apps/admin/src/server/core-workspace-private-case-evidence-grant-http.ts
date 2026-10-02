import {
  isWorkspacePrivateCaseEvidenceReadGrantV1,
  type WorkspacePrivateCaseEvidenceReadGrantV1,
  type WorkspacePrivateCaseEvidenceReadRequestV1,
} from "@markorbit/contracts";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface CoreWorkspacePrivateCaseEvidenceGrantTransport {
  issue(
    request: WorkspacePrivateCaseEvidenceReadRequestV1,
    principalHeader: string,
    workspaceId: string,
  ): Promise<WorkspacePrivateCaseEvidenceReadGrantV1>;
}

export class CoreWorkspacePrivateCaseEvidenceGrantTransportError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: 403 | 404 | 409 | 503,
    message: string,
  ) {
    super(message);
    this.name = "CoreWorkspacePrivateCaseEvidenceGrantTransportError";
  }
}

function baseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
      "CORE_WORKSPACE_PRIVATE_EVIDENCE_URL_INVALID",
      503,
      "MARKORBIT_CORE_URL must be a complete HTTP(S) URL.",
    );
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
      "CORE_WORKSPACE_PRIVATE_EVIDENCE_URL_INVALID",
      503,
      "MARKORBIT_CORE_URL must be an HTTP(S) URL without embedded credentials.",
    );
  }
  url.search = "";
  url.hash = "";
  return url;
}

function secret(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
      "CORE_WORKSPACE_PRIVATE_EVIDENCE_AUTH_NOT_CONFIGURED",
      503,
      "MARKORBIT_CORE_INTERNAL_SECRET is not configured.",
    );
  }
  return normalized;
}

function destination(base: URL, bindingId: string): string {
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/internal/v1/workspace-private-case-evidence/${encodeURIComponent(bindingId)}/read-grants`;
  return url.toString();
}

function timeoutFailure(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

function statusError(status: number): CoreWorkspacePrivateCaseEvidenceGrantTransportError {
  if (status === 401 || status === 403) {
    return new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_GRANT_FORBIDDEN",
      403,
      "Core denied the Workspace-private Case evidence read grant.",
    );
  }
  if (status === 404) {
    return new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_NOT_FOUND",
      404,
      "Core did not find the Workspace-private Case evidence binding.",
    );
  }
  if (status === 409) {
    return new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_STALE",
      409,
      "Core reports that the Workspace-private Case evidence binding is stale.",
    );
  }
  return new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
    "WORKSPACE_PRIVATE_CASE_EVIDENCE_SOURCE_UNAVAILABLE",
    503,
    "Core Workspace-private Case evidence authority is temporarily unavailable.",
  );
}

export class HttpCoreWorkspacePrivateCaseEvidenceGrantTransport implements CoreWorkspacePrivateCaseEvidenceGrantTransport {
  private readonly coreBaseUrl: URL;
  private readonly internalSecret: string;

  constructor(
    coreBaseUrl: string,
    internalSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.coreBaseUrl = baseUrl(coreBaseUrl);
    this.internalSecret = secret(internalSecret);
  }

  async issue(
    request: WorkspacePrivateCaseEvidenceReadRequestV1,
    principalHeader: string,
    workspaceId: string,
  ): Promise<WorkspacePrivateCaseEvidenceReadGrantV1> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(destination(this.coreBaseUrl, request.bindingId), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-markorbit-internal-authorization": this.internalSecret,
          "x-markorbit-principal": principalHeader,
          "x-markorbit-workspace-id": workspaceId,
        },
        body: JSON.stringify({ expectedVersion: request.expectedVersion }),
        signal,
      });
    } catch (error) {
      if (timeoutFailure(error, signal)) {
        throw new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
          "CORE_WORKSPACE_PRIVATE_EVIDENCE_TIMEOUT",
          503,
          "Core Workspace-private Case evidence authority timed out.",
        );
      }
      throw new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
        "WORKSPACE_PRIVATE_CASE_EVIDENCE_SOURCE_UNAVAILABLE",
        503,
        "Core Workspace-private Case evidence authority is temporarily unavailable.",
      );
    }
    if (!response.ok) throw statusError(response.status);
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
        "CORE_WORKSPACE_PRIVATE_EVIDENCE_RESPONSE_INVALID",
        503,
        "Core returned an invalid Workspace-private Case evidence grant.",
      );
    }
    if (!isWorkspacePrivateCaseEvidenceReadGrantV1(value)) {
      throw new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
        "CORE_WORKSPACE_PRIVATE_EVIDENCE_RESPONSE_INVALID",
        503,
        "Core returned an invalid Workspace-private Case evidence grant.",
      );
    }
    if (value.bindingId !== request.bindingId || value.bindingVersion !== request.expectedVersion) {
      throw new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
        "WORKSPACE_PRIVATE_CASE_EVIDENCE_STALE",
        409,
        "Core returned a different Workspace-private Case evidence binding version.",
      );
    }
    return value;
  }
}

export function configuredCoreWorkspacePrivateCaseEvidenceGrantTransport(
  fetchImpl: typeof fetch = fetch,
): CoreWorkspacePrivateCaseEvidenceGrantTransport {
  const url = process.env.MARKORBIT_CORE_URL?.trim();
  if (!url) {
    throw new CoreWorkspacePrivateCaseEvidenceGrantTransportError(
      "CORE_WORKSPACE_PRIVATE_EVIDENCE_NOT_CONFIGURED",
      503,
      "MARKORBIT_CORE_URL is not configured.",
    );
  }
  return new HttpCoreWorkspacePrivateCaseEvidenceGrantTransport(
    url,
    secret(process.env.MARKORBIT_CORE_INTERNAL_SECRET),
    fetchImpl,
  );
}
