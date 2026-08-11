from pathlib import Path


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


# 1) Extend the durable Core intake submission ledger with a second-stage content delivery.
path = Path("packages/persistence/src/ready-package-core-intake-submission.ts")
text = path.read_text()
text = text.replace(
    'import { randomBytes } from "node:crypto";',
    'import { createHash, randomBytes } from "node:crypto";',
    1,
)
marker = '''export type ReadyPackageCoreIntakeSubmissionResultEvidence = {
  intakeId: string;
  status: CoreIntakeResult["status"];
  recordedAt: string;
};
'''
addition = marker + '''
export type ReadyPackageCoreContentResult = {
  intakeId: string;
  readyPackageId: string;
  status: "ACCEPTED";
  exportSha256: string;
};

export type ReadyPackageCoreContentResultEvidence = ReadyPackageCoreContentResult & {
  recordedAt: string;
};

export type ReadyPackageCoreContentDelivery = {
  state: "PENDING" | "RESULT_RECORDED";
  coreIntakeId: string;
  requestJson: string;
  requestSha256: string;
  transportResult?: ReadyPackageCoreContentResultEvidence;
  result?: ReadyPackageCoreContentResultEvidence;
  preparedAt: string;
  updatedAt: string;
};

export type PrepareReadyPackageCoreContentDeliveryInput = {
  coreIntakeId: string;
  requestJson: string;
  requestSha256: string;
};

export type PrepareReadyPackageCoreContentDeliveryResult = {
  submission: ReadyPackageCoreIntakeSubmission;
  delivery: ReadyPackageCoreContentDelivery;
  replayed: boolean;
};
'''
if marker not in text:
    raise SystemExit("submission result evidence marker not found")
text = text.replace(marker, addition, 1)
text = text.replace(
    '  result?: ReadyPackageCoreIntakeSubmissionResultEvidence;\n  createdAt: string;',
    '  result?: ReadyPackageCoreIntakeSubmissionResultEvidence;\n  contentDelivery?: ReadyPackageCoreContentDelivery;\n  createdAt: string;',
    1,
)
interface_marker = '''  recordResult(
    submissionId: string,
    workspaceId: string,
    result: CoreIntakeResult,
  ): ReadyPackageCoreIntakeSubmission;
  list(readyPackageId: string, workspaceId: string): ReadyPackageCoreIntakeSubmission[];
'''
interface_replacement = '''  recordResult(
    submissionId: string,
    workspaceId: string,
    result: CoreIntakeResult,
  ): ReadyPackageCoreIntakeSubmission;
  prepareContentDelivery(
    submissionId: string,
    workspaceId: string,
    input: PrepareReadyPackageCoreContentDeliveryInput,
  ): PrepareReadyPackageCoreContentDeliveryResult;
  recordContentTransportResult(
    submissionId: string,
    workspaceId: string,
    result: ReadyPackageCoreContentResult,
  ): ReadyPackageCoreIntakeSubmission;
  recordContentResult(
    submissionId: string,
    workspaceId: string,
    result: ReadyPackageCoreContentResult,
  ): ReadyPackageCoreIntakeSubmission;
  list(readyPackageId: string, workspaceId: string): ReadyPackageCoreIntakeSubmission[];
'''
if interface_marker not in text:
    raise SystemExit("repository interface marker not found")
text = text.replace(interface_marker, interface_replacement, 1)
helper_marker = '''function parseSubmission(value: string): ReadyPackageCoreIntakeSubmission {
'''
helpers = '''function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateCoreContentResult(result: ReadyPackageCoreContentResult): void {
  if (
    !result ||
    typeof result !== "object" ||
    typeof result.intakeId !== "string" ||
    !result.intakeId.trim() ||
    typeof result.readyPackageId !== "string" ||
    !result.readyPackageId.trim() ||
    result.status !== "ACCEPTED" ||
    !SHA256.test(result.exportSha256)
  ) {
    throw new RegistryValidationError("Core content result is invalid");
  }
}

function validateCoreContentResultEvidence(
  evidence: ReadyPackageCoreContentResultEvidence | undefined,
  message: string,
): asserts evidence is ReadyPackageCoreContentResultEvidence {
  if (!evidence || Number.isNaN(Date.parse(evidence.recordedAt))) {
    throw new RegistryValidationError(message);
  }
  validateCoreContentResult(evidence);
}

function matchesCoreContentResult(
  evidence: ReadyPackageCoreContentResultEvidence | undefined,
  result: ReadyPackageCoreContentResult,
): boolean {
  return (
    evidence?.intakeId === result.intakeId &&
    evidence.readyPackageId === result.readyPackageId &&
    evidence.status === result.status &&
    evidence.exportSha256 === result.exportSha256
  );
}

function validateContentDelivery(
  delivery: ReadyPackageCoreContentDelivery,
  submission: ReadyPackageCoreIntakeSubmission,
): void {
  if (
    (delivery.state !== "PENDING" && delivery.state !== "RESULT_RECORDED") ||
    typeof delivery.coreIntakeId !== "string" ||
    !delivery.coreIntakeId.trim() ||
    typeof delivery.requestJson !== "string" ||
    !delivery.requestJson.trim() ||
    !SHA256.test(delivery.requestSha256) ||
    sha256(delivery.requestJson) !== delivery.requestSha256 ||
    Number.isNaN(Date.parse(delivery.preparedAt)) ||
    Number.isNaN(Date.parse(delivery.updatedAt))
  ) {
    throw new RegistryValidationError("Persisted Core content delivery is invalid");
  }
  try {
    JSON.parse(delivery.requestJson);
  } catch {
    throw new RegistryValidationError("Persisted Core content request JSON is invalid");
  }
  if (delivery.transportResult !== undefined) {
    validateCoreContentResultEvidence(
      delivery.transportResult,
      "Persisted Core content transport result is invalid",
    );
    if (
      delivery.transportResult.intakeId !== delivery.coreIntakeId ||
      delivery.transportResult.readyPackageId !== submission.readyPackageId ||
      delivery.transportResult.exportSha256 !== delivery.requestSha256
    ) {
      throw new RegistryValidationError("Persisted Core content transport result does not match its frozen request");
    }
  }
  if (delivery.state === "RESULT_RECORDED") {
    validateCoreContentResultEvidence(delivery.result, "Persisted Core content result is invalid");
    if (
      delivery.result.intakeId !== delivery.coreIntakeId ||
      delivery.result.readyPackageId !== submission.readyPackageId ||
      delivery.result.exportSha256 !== delivery.requestSha256 ||
      (delivery.transportResult &&
        !matchesCoreContentResult(delivery.transportResult, delivery.result))
    ) {
      throw new RegistryValidationError("Persisted Core content result does not match its frozen request");
    }
  } else if (delivery.result !== undefined) {
    throw new RegistryValidationError("Pending Core content delivery cannot contain a result");
  }
}

'''
if helper_marker not in text:
    raise SystemExit("parse submission marker not found")
text = text.replace(helper_marker, helpers + helper_marker, 1)
parse_return = '''  } else if (parsed.result !== undefined) {
    throw new RegistryValidationError("Pending Core intake submission cannot contain a result");
  }
  return parsed;
}
'''
parse_replacement = '''  } else if (parsed.result !== undefined) {
    throw new RegistryValidationError("Pending Core intake submission cannot contain a result");
  }
  if (parsed.contentDelivery !== undefined) {
    validateContentDelivery(parsed.contentDelivery, parsed);
  }
  return parsed;
}
'''
if parse_return not in text:
    raise SystemExit("parse submission validation marker not found")
text = text.replace(parse_return, parse_replacement, 1)
class_list_marker = '''  list(readyPackageId: string, workspaceId: string): ReadyPackageCoreIntakeSubmission[] {
'''
class_methods = '''  prepareContentDelivery(
    submissionIdValue: string,
    workspaceId: string,
    input: PrepareReadyPackageCoreContentDeliveryInput,
  ): PrepareReadyPackageCoreContentDeliveryResult {
    if (!submissionIdValue?.trim()) throw new RegistryValidationError("submissionId is required");
    if (!workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
    if (!input.coreIntakeId?.trim()) throw new RegistryValidationError("coreIntakeId is required");
    if (!input.requestJson?.trim()) throw new RegistryValidationError("requestJson is required");
    if (!SHA256.test(input.requestSha256) || sha256(input.requestJson) !== input.requestSha256) {
      throw new RegistryValidationError("requestSha256 must match the frozen content request JSON");
    }

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.require(submissionIdValue, workspaceId);
      if (current.state !== "RESULT_RECORDED" || !current.result) {
        throw new RegistryConflictError(
          "CORE_CONTENT_INTAKE_RESULT_NOT_RECORDED",
          "Core intake must be durably finalized before content delivery can start",
        );
      }
      if (current.result.status === "REJECTED") {
        throw new RegistryConflictError(
          "CORE_CONTENT_INTAKE_REJECTED",
          "Rejected Core intake cannot receive ReadyPackage content",
        );
      }
      if (current.result.intakeId !== input.coreIntakeId) {
        throw new RegistryConflictError(
          "CORE_CONTENT_INTAKE_ID_MISMATCH",
          "Core content delivery must target the intake frozen on the submission",
        );
      }
      if (current.contentDelivery) {
        const delivery = current.contentDelivery;
        if (
          delivery.coreIntakeId !== input.coreIntakeId ||
          delivery.requestSha256 !== input.requestSha256 ||
          delivery.requestJson !== input.requestJson
        ) {
          throw new RegistryConflictError(
            "CORE_CONTENT_PENDING_REQUEST_MISMATCH",
            "Core content delivery is already frozen to another request",
          );
        }
        this.database.exec("COMMIT;");
        return { submission: current, delivery, replayed: true };
      }

      const preparedAt = this.clock().toISOString();
      const delivery: ReadyPackageCoreContentDelivery = {
        state: "PENDING",
        coreIntakeId: input.coreIntakeId,
        requestJson: input.requestJson,
        requestSha256: input.requestSha256,
        preparedAt,
        updatedAt: preparedAt,
      };
      const next: ReadyPackageCoreIntakeSubmission = {
        ...current,
        contentDelivery: delivery,
        updatedAt: preparedAt,
      };
      this.database
        .prepare(
          `UPDATE ready_package_core_intake_submissions
           SET document_json = ?, updated_at = ?
           WHERE workspace_id = ? AND submission_id = ?`,
        )
        .run(JSON.stringify(next), preparedAt, workspaceId, submissionIdValue);
      this.database.exec("COMMIT;");
      return { submission: next, delivery, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  recordContentTransportResult(
    submissionIdValue: string,
    workspaceId: string,
    result: ReadyPackageCoreContentResult,
  ): ReadyPackageCoreIntakeSubmission {
    if (!submissionIdValue?.trim()) throw new RegistryValidationError("submissionId is required");
    if (!workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
    validateCoreContentResult(result);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.require(submissionIdValue, workspaceId);
      const delivery = current.contentDelivery;
      if (!delivery) {
        throw new RegistryConflictError(
          "CORE_CONTENT_DELIVERY_NOT_PREPARED",
          "Core content delivery must be frozen before a transport result is recorded",
        );
      }
      if (
        result.intakeId !== delivery.coreIntakeId ||
        result.readyPackageId !== current.readyPackageId ||
        result.exportSha256 !== delivery.requestSha256
      ) {
        throw new RegistryConflictError(
          "CORE_CONTENT_TRANSPORT_RESULT_MISMATCH",
          "Core content transport result does not match the frozen content request",
        );
      }
      if (delivery.state === "RESULT_RECORDED") {
        if (!matchesCoreContentResult(delivery.result, result)) {
          throw new RegistryConflictError(
            "CORE_CONTENT_RESULT_CONFLICT",
            "Core content delivery already recorded a different result",
          );
        }
        this.database.exec("COMMIT;");
        return current;
      }
      if (delivery.transportResult) {
        if (!matchesCoreContentResult(delivery.transportResult, result)) {
          throw new RegistryConflictError(
            "CORE_CONTENT_TRANSPORT_RESULT_CONFLICT",
            "Core content delivery already persisted a different transport result",
          );
        }
        this.database.exec("COMMIT;");
        return current;
      }

      const recordedAt = this.clock().toISOString();
      const nextDelivery: ReadyPackageCoreContentDelivery = {
        ...delivery,
        transportResult: { ...result, recordedAt },
        updatedAt: recordedAt,
      };
      const next: ReadyPackageCoreIntakeSubmission = {
        ...current,
        contentDelivery: nextDelivery,
        updatedAt: recordedAt,
      };
      this.database
        .prepare(
          `UPDATE ready_package_core_intake_submissions
           SET document_json = ?, updated_at = ?
           WHERE workspace_id = ? AND submission_id = ?`,
        )
        .run(JSON.stringify(next), recordedAt, workspaceId, submissionIdValue);
      this.database.exec("COMMIT;");
      return next;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  recordContentResult(
    submissionIdValue: string,
    workspaceId: string,
    result: ReadyPackageCoreContentResult,
  ): ReadyPackageCoreIntakeSubmission {
    if (!submissionIdValue?.trim()) throw new RegistryValidationError("submissionId is required");
    if (!workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
    validateCoreContentResult(result);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.require(submissionIdValue, workspaceId);
      const delivery = current.contentDelivery;
      if (!delivery) {
        throw new RegistryConflictError(
          "CORE_CONTENT_DELIVERY_NOT_PREPARED",
          "Core content delivery must be frozen before it can be finalized",
        );
      }
      if (
        result.intakeId !== delivery.coreIntakeId ||
        result.readyPackageId !== current.readyPackageId ||
        result.exportSha256 !== delivery.requestSha256
      ) {
        throw new RegistryConflictError(
          "CORE_CONTENT_RESULT_MISMATCH",
          "Core content result does not match the frozen content request",
        );
      }
      if (delivery.state === "RESULT_RECORDED") {
        if (!matchesCoreContentResult(delivery.result, result)) {
          throw new RegistryConflictError(
            "CORE_CONTENT_RESULT_CONFLICT",
            "Core content delivery already recorded a different result",
          );
        }
        this.database.exec("COMMIT;");
        return current;
      }
      if (!delivery.transportResult || !matchesCoreContentResult(delivery.transportResult, result)) {
        throw new RegistryConflictError(
          "CORE_CONTENT_TRANSPORT_RESULT_REQUIRED",
          "Core content transport result must be durably persisted before local finalization",
        );
      }

      const recordedAt = this.clock().toISOString();
      const nextDelivery: ReadyPackageCoreContentDelivery = {
        ...delivery,
        state: "RESULT_RECORDED",
        result: { ...result, recordedAt },
        updatedAt: recordedAt,
      };
      const next: ReadyPackageCoreIntakeSubmission = {
        ...current,
        contentDelivery: nextDelivery,
        updatedAt: recordedAt,
      };
      this.database
        .prepare(
          `UPDATE ready_package_core_intake_submissions
           SET document_json = ?, updated_at = ?
           WHERE workspace_id = ? AND submission_id = ?`,
        )
        .run(JSON.stringify(next), recordedAt, workspaceId, submissionIdValue);
      this.database.exec("COMMIT;");
      return next;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

'''
# Only replace the class method occurrence, which is the second exact occurrence after the interface.
first = text.find(class_list_marker)
second = text.find(class_list_marker, first + 1)
if second == -1:
    raise SystemExit("class list method marker not found")
text = text[:second] + class_methods + text[second:]
path.write_text(text)

# 2) Core content HTTP transport: same internal secret, destination derived from the frozen intake endpoint.
write(
    "apps/admin/src/server/core-content-http-transport.ts",
    '''import { CoreIntakeTransportError } from "./core-intake-http-transport";
import type { ReadyPackageCoreContentResult } from "@markorbit/persistence/ready-package-core-intake-submissions";

const DEFAULT_CORE_CONTENT_TIMEOUT_MS = 15_000;
const INTERNAL_AUTH_HEADER = "x-markorbit-internal-authorization";
const SHA256 = /^[a-f0-9]{64}$/u;

export interface CoreContentTransport {
  submit(
    intakeId: string,
    requestJson: string,
    expected: { readyPackageId: string; exportSha256: string },
  ): Promise<ReadyPackageCoreContentResult>;
}

function configuredIntakeUrl(): string {
  const raw = process.env.MARKORBIT_CORE_INTAKE_URL?.trim();
  if (!raw) {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_NOT_CONFIGURED",
      "MARKORBIT_CORE_INTAKE_URL is not configured",
      503,
    );
  }
  return raw;
}

function configuredInternalSecret(): string {
  const secret = process.env.MARKORBIT_CORE_INTERNAL_SECRET?.trim();
  if (!secret) {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_AUTH_NOT_CONFIGURED",
      "MARKORBIT_CORE_INTERNAL_SECRET is not configured",
      503,
    );
  }
  return secret;
}

function contentDestination(intakeUrl: string, intakeId: string): string {
  let url: URL;
  try {
    url = new URL(intakeUrl);
  } catch {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_URL_INVALID",
      "MARKORBIT_CORE_INTAKE_URL must be a complete HTTP(S) URL",
      503,
    );
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_URL_INVALID",
      "MARKORBIT_CORE_INTAKE_URL must be an HTTP(S) URL without embedded credentials",
      503,
    );
  }
  const path = url.pathname.replace(/\/+$/u, "");
  url.pathname = `${path}/${encodeURIComponent(intakeId)}/content`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function parseResult(value: unknown): ReadyPackageCoreContentResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_RESPONSE_INVALID",
      "Core content receiver returned an invalid response envelope",
      502,
    );
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 4 ||
    keys[0] !== "exportSha256" ||
    keys[1] !== "intakeId" ||
    keys[2] !== "readyPackageId" ||
    keys[3] !== "status" ||
    typeof record.intakeId !== "string" ||
    !record.intakeId.trim() ||
    typeof record.readyPackageId !== "string" ||
    !record.readyPackageId.trim() ||
    record.status !== "ACCEPTED" ||
    typeof record.exportSha256 !== "string" ||
    !SHA256.test(record.exportSha256)
  ) {
    throw new CoreIntakeTransportError(
      "CORE_CONTENT_TRANSPORT_RESPONSE_INVALID",
      "Core content receiver returned an invalid response envelope",
      502,
    );
  }
  return {
    intakeId: record.intakeId,
    readyPackageId: record.readyPackageId,
    status: "ACCEPTED",
    exportSha256: record.exportSha256,
  };
}

function timeoutFailure(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

export class HttpCoreContentTransport implements CoreContentTransport {
  constructor(
    private readonly intakeUrl: string,
    private readonly internalSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_CORE_CONTENT_TIMEOUT_MS,
  ) {}

  async submit(
    intakeId: string,
    requestJson: string,
    expected: { readyPackageId: string; exportSha256: string },
  ): Promise<ReadyPackageCoreContentResult> {
    if (!intakeId.trim()) {
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_INTAKE_ID_INVALID",
        "Core content delivery requires an intake ID",
        409,
      );
    }
    if (!requestJson.trim() || !SHA256.test(expected.exportSha256)) {
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_REQUEST_INVALID",
        "Core content delivery requires a frozen request body and SHA-256 fingerprint",
        409,
      );
    }
    const signal = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(contentDestination(this.intakeUrl, intakeId), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_AUTH_HEADER]: this.internalSecret,
        },
        body: requestJson,
        signal,
      });
    } catch (error) {
      if (timeoutFailure(error, signal)) {
        throw new CoreIntakeTransportError(
          "CORE_CONTENT_TRANSPORT_TIMEOUT",
          "Core content request exceeded the bounded delivery timeout",
          504,
        );
      }
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_TRANSPORT_UNAVAILABLE",
        "Core content request could not be delivered",
        502,
      );
    }
    if (!response.ok) {
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_TRANSPORT_HTTP_ERROR",
        `Core content receiver returned HTTP ${response.status}`,
        502,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_TRANSPORT_RESPONSE_INVALID",
        "Core content receiver returned a non-JSON response",
        502,
      );
    }
    const result = parseResult(body);
    if (
      result.intakeId !== intakeId ||
      result.readyPackageId !== expected.readyPackageId ||
      result.exportSha256 !== expected.exportSha256
    ) {
      throw new CoreIntakeTransportError(
        "CORE_CONTENT_TRANSPORT_RESULT_MISMATCH",
        "Core content response does not match the frozen request",
        502,
      );
    }
    return result;
  }
}

export function configuredCoreContentTransport(fetchImpl: typeof fetch = fetch): CoreContentTransport {
  return {
    async submit(intakeId, requestJson, expected) {
      return new HttpCoreContentTransport(
        configuredIntakeUrl(),
        configuredInternalSecret(),
        fetchImpl,
      ).submit(intakeId, requestJson, expected);
    },
  };
}
''',
)

# 3) Retry-safe second-stage submission service.
write(
    "apps/admin/src/server/ready-package-core-content-submit.ts",
    '''import { createHash } from "node:crypto";
import {
  assertReadyPackageContentExportV1,
  serializeReadyPackageContentExportV1,
  type ReadyPackageContentExportV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import type { ReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import type {
  ReadyPackageCoreContentResult,
  ReadyPackageCoreIntakeSubmission,
  ReadyPackageCoreIntakeSubmissionRepository,
} from "@markorbit/persistence/ready-package-core-intake-submissions";
import type { CoreContentTransport } from "./core-content-http-transport";

const SHA256 = /^[a-f0-9]{64}$/u;

export type ReadyPackageCoreContentSubmitInput = {
  workspaceId: string;
  readyPackageId: string;
  expectedDigest: string;
  submit: true;
};

export type ReadyPackageContentExporter = (
  input: { workspaceId: string; readyPackageId: string },
) => Promise<ReadyPackageContentExportV1>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function resultFromEvidence(
  evidence: ReadyPackageCoreIntakeSubmission["contentDelivery"] extends infer Delivery
    ? Delivery extends { transportResult?: infer Evidence }
      ? Evidence
      : never
    : never,
): ReadyPackageCoreContentResult | null {
  if (!evidence || typeof evidence !== "object") return null;
  const value = evidence as ReadyPackageCoreContentResult;
  return {
    intakeId: value.intakeId,
    readyPackageId: value.readyPackageId,
    status: value.status,
    exportSha256: value.exportSha256,
  };
}

function parseFrozenRequest(submission: ReadyPackageCoreIntakeSubmission): ReadyPackageContentExportV1 {
  const delivery = submission.contentDelivery;
  if (!delivery) {
    throw new RegistryConflictError(
      "CORE_CONTENT_DELIVERY_NOT_PREPARED",
      "Core content delivery has no frozen request",
    );
  }
  if (sha256(delivery.requestJson) !== delivery.requestSha256) {
    throw new RegistryConflictError(
      "CORE_CONTENT_FROZEN_REQUEST_CORRUPTED",
      "Frozen Core content request no longer matches its persisted fingerprint",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(delivery.requestJson);
  } catch {
    throw new RegistryConflictError(
      "CORE_CONTENT_FROZEN_REQUEST_INVALID",
      "Frozen Core content request is not valid JSON",
    );
  }
  try {
    assertReadyPackageContentExportV1(parsed);
  } catch {
    throw new RegistryConflictError(
      "CORE_CONTENT_FROZEN_REQUEST_INVALID",
      "Frozen Core content request no longer satisfies Content Export V1",
    );
  }
  if (serializeReadyPackageContentExportV1(parsed) !== delivery.requestJson) {
    throw new RegistryConflictError(
      "CORE_CONTENT_FROZEN_REQUEST_NON_CANONICAL",
      "Frozen Core content request is not the canonical V1 serialization",
    );
  }
  return parsed;
}

function completedIntake(
  submissions: ReadyPackageCoreIntakeSubmission[],
  expectedDigest: string,
): ReadyPackageCoreIntakeSubmission {
  const submission = submissions.find(
    (candidate) =>
      candidate.expectedDigest === expectedDigest &&
      candidate.state === "RESULT_RECORDED" &&
      candidate.result,
  );
  if (!submission?.result) {
    throw new RegistryConflictError(
      "CORE_CONTENT_INTAKE_RESULT_NOT_RECORDED",
      "A durable Core intake result is required before content delivery",
    );
  }
  if (submission.result.status === "REJECTED") {
    throw new RegistryConflictError(
      "CORE_CONTENT_INTAKE_REJECTED",
      "Rejected Core intake cannot receive ReadyPackage content",
    );
  }
  return submission;
}

export async function submitReadyPackageCoreContent(
  input: ReadyPackageCoreContentSubmitInput,
  readyPackages: Pick<ReadyPackageRegistryRepository, "getById">,
  submissions: ReadyPackageCoreIntakeSubmissionRepository,
  exportContent: ReadyPackageContentExporter,
  transport: CoreContentTransport,
) {
  if (input.submit !== true) throw new RegistryValidationError("submit=true is required");
  if (!input.workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
  if (!input.readyPackageId?.trim())
    throw new RegistryValidationError("readyPackageId is required");
  if (!SHA256.test(input.expectedDigest)) {
    throw new RegistryValidationError("expectedDigest must be a SHA-256 digest");
  }

  const readyPackage = readyPackages.getById(input.readyPackageId, input.workspaceId);
  if (!readyPackage) {
    throw new RegistryError(
      "READY_PACKAGE_NOT_FOUND",
      `ReadyPackage ${input.readyPackageId} was not found`,
    );
  }
  if (readyPackage.evidence.digest !== input.expectedDigest) {
    throw new RegistryConflictError(
      "READY_PACKAGE_DIGEST_MISMATCH",
      "ReadyPackage digest mismatch",
    );
  }
  if (readyPackage.status !== "HANDED_OFF") {
    throw new RegistryConflictError(
      "CORE_CONTENT_READY_PACKAGE_NOT_HANDED_OFF",
      "ReadyPackage content can be sent only after durable Core intake handoff",
    );
  }

  let intakeSubmission = completedIntake(
    submissions.list(input.readyPackageId, input.workspaceId),
    input.expectedDigest,
  );
  const intakeId = intakeSubmission.result!.intakeId;

  if (intakeSubmission.contentDelivery?.state === "RESULT_RECORDED") {
    const frozenRequest = parseFrozenRequest(intakeSubmission);
    const result = resultFromEvidence(intakeSubmission.contentDelivery.result);
    if (!result) {
      throw new RegistryConflictError(
        "CORE_CONTENT_RESULT_MISSING",
        "Recorded Core content delivery has no durable result evidence",
      );
    }
    return {
      coreContentExport: frozenRequest,
      coreContentResult: result,
      submission: intakeSubmission,
      deliveryReplayed: true,
      transportResultReplayed: true,
    };
  }

  let frozenRequest: ReadyPackageContentExportV1;
  let requestJson: string;
  let requestSha256: string;
  let deliveryReplayed = false;

  if (intakeSubmission.contentDelivery) {
    frozenRequest = parseFrozenRequest(intakeSubmission);
    requestJson = intakeSubmission.contentDelivery.requestJson;
    requestSha256 = intakeSubmission.contentDelivery.requestSha256;
    deliveryReplayed = true;
  } else {
    frozenRequest = await exportContent({
      workspaceId: input.workspaceId,
      readyPackageId: input.readyPackageId,
    });
    assertReadyPackageContentExportV1(frozenRequest);
    if (
      frozenRequest.readyPackageId !== input.readyPackageId ||
      frozenRequest.knowledgeWorkspaceId !== input.workspaceId ||
      frozenRequest.readyPackageDigest !== input.expectedDigest
    ) {
      throw new RegistryConflictError(
        "CORE_CONTENT_EXPORT_SCOPE_MISMATCH",
        "Content Export V1 does not match the ReadyPackage being delivered",
      );
    }
    requestJson = serializeReadyPackageContentExportV1(frozenRequest);
    requestSha256 = sha256(requestJson);
    const prepared = submissions.prepareContentDelivery(
      intakeSubmission.submissionId,
      input.workspaceId,
      { coreIntakeId: intakeId, requestJson, requestSha256 },
    );
    intakeSubmission = prepared.submission;
    deliveryReplayed = prepared.replayed;
  }

  const persistedTransportResult = resultFromEvidence(
    intakeSubmission.contentDelivery?.transportResult,
  );
  const transportResultReplayed = persistedTransportResult !== null;
  const coreContentResult =
    persistedTransportResult ??
    (await transport.submit(intakeId, requestJson, {
      readyPackageId: input.readyPackageId,
      exportSha256: requestSha256,
    }));

  if (!transportResultReplayed) {
    intakeSubmission = submissions.recordContentTransportResult(
      intakeSubmission.submissionId,
      input.workspaceId,
      coreContentResult,
    );
  }
  const submission = submissions.recordContentResult(
    intakeSubmission.submissionId,
    input.workspaceId,
    coreContentResult,
  );

  return {
    coreContentExport: frozenRequest,
    coreContentResult,
    submission,
    deliveryReplayed,
    transportResultReplayed,
  };
}
''',
)

# 4) Explicit admin API for the second delivery stage.
write(
    "apps/admin/src/app/api/ready-packages/[id]/core-content/submit/route.ts",
    '''import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { configuredCoreContentTransport } from "@/server/core-content-http-transport";
import { buildConfiguredReadyPackageContentExportV1 } from "@/server/ready-package-content-export";
import { submitReadyPackageCoreContent } from "@/server/ready-package-core-content-submit";
import { getReadyPackageRepository, getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = requireRecord(await readJson(request));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const expectedDigest =
      typeof body.expectedDigest === "string" ? body.expectedDigest.trim() : "";
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!expectedDigest) throw new RegistryValidationError("expectedDigest is required");
    if (body.submit !== true) throw new RegistryValidationError("submit=true is required");

    const { id } = await context.params;
    const database = getRegistryDatabase();
    const result = await submitReadyPackageCoreContent(
      {
        workspaceId,
        readyPackageId: id,
        expectedDigest,
        submit: true,
      },
      getReadyPackageRepository(),
      new SqliteReadyPackageCoreIntakeSubmissionRepository(database),
      buildConfiguredReadyPackageContentExportV1,
      configuredCoreContentTransport(),
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
''',
)

# 5) Transport regression tests.
write(
    "apps/admin/src/server/__tests__/core-content-http-transport.test.ts",
    '''import { describe, expect, it, vi } from "vitest";
import { HttpCoreContentTransport } from "../core-content-http-transport";

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

describe("Core content HTTP transport", () => {
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
    const transport = new HttpCoreContentTransport(
      intakeUrl,
      "secret",
      (async () =>
        response({
          intakeId,
          readyPackageId,
          status: "ACCEPTED",
          exportSha256: "b".repeat(64),
        })) as typeof fetch,
    );
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
''',
)

# 6) M36/M38 second-stage service regressions.
write(
    "apps/admin/src/server/__tests__/ready-package-core-content-submit.test.ts",
    '''import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  serializeReadyPackageContentExportV1,
  type ReadyPackageContentExportV1,
} from "@markorbit/contracts";
import { initializeRegistry } from "@markorbit/persistence";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import { SqliteReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import type { CoreContentTransport } from "../core-content-http-transport";
import { submitReadyPackageCoreContent } from "../ready-package-core-content-submit";
import { submitReadyPackageCoreIntake } from "../ready-package-core-intake-submit";

const WORKSPACE_ID = "wsp_01H00000000000000000000000";
const CORE_WORKSPACE_ID = "01900000-0000-7000-8000-000000000001";
const CORE_INTAKE_ID = "01900000-0000-7000-8000-000000000002";
const READY_PACKAGE_ID = "rdp_01H00000000000000000000001";
const MARKDOWN = "# Frozen content\n\nSecond-stage delivery.\n";
const STAGING_SHA = createHash("sha256").update(MARKDOWN, "utf8").digest("hex");

async function fixture() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  const readyPackages = new SqliteReadyPackageRegistryRepository(
    database,
    () => new Date("2026-08-11T08:00:00.000Z"),
    () => READY_PACKAGE_ID,
  );
  const readyPackage = readyPackages.createVerified({
    workspaceId: WORKSPACE_ID,
    sourceId: "src_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    rawArtifactSha256: "a".repeat(64),
    capturedAt: "2026-08-11T07:50:00.000Z",
    conversionRunId: "cvr_01H00000000000000000000000",
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    stagingDocumentId: "std_01H00000000000000000000000",
    stagingSha256: STAGING_SHA,
    verificationId: "svr_01H00000000000000000000000",
    verificationOutcome: "PASS",
    idempotencyKey: "ready-package:core-content:test",
  }).readyPackage;
  const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
    database,
    () => new Date("2026-08-11T08:01:00.000Z"),
    () => "cis_core_content_test",
  );
  await submitReadyPackageCoreIntake(
    {
      workspaceId: WORKSPACE_ID,
      coreWorkspaceId: CORE_WORKSPACE_ID,
      readyPackageId: readyPackage.id,
      expectedDigest: readyPackage.evidence.digest,
      submit: true,
    },
    readyPackages,
    submissions,
    {
      submit: async () => ({
        intakeId: CORE_INTAKE_ID,
        readyPackageId: readyPackage.id,
        status: "RECEIVED",
      }),
    },
  );
  const handedOff = readyPackages.getById(readyPackage.id, WORKSPACE_ID)!;
  const contentExport: ReadyPackageContentExportV1 = {
    contractVersion: "1.0",
    objectType: "READY_PACKAGE_CONTENT_EXPORT",
    readyPackageId: handedOff.id,
    knowledgeWorkspaceId: WORKSPACE_ID,
    readyPackageDigest: handedOff.evidence.digest,
    provenance: {
      sourceId: handedOff.evidence.sourceId!,
      conversionRunId: handedOff.evidence.conversionRunId!,
      verificationId: handedOff.evidence.verificationId!,
      verificationOutcome: handedOff.evidence.verificationOutcome!,
      capturedAt: handedOff.evidence.capturedAt!,
      converter: handedOff.evidence.converter!,
      legalTruthVerified: false,
    },
    rawArtifact: {
      artifactId: handedOff.evidence.artifactIds[0]!,
      sha256: handedOff.evidence.rawArtifactSha256!,
      sizeBytes: 11,
      mimeType: "text/plain",
      originalName: "source.txt",
    },
    stagingDocument: {
      documentId: handedOff.evidence.stagingDocumentId,
      sha256: handedOff.evidence.stagingSha256!,
      sizeBytes: Buffer.byteLength(MARKDOWN, "utf8"),
      mediaType: "text/markdown",
      encoding: "utf-8",
      content: MARKDOWN,
    },
  };
  return { database, readyPackages, handedOff, submissions, contentExport };
}

function resultFor(contentExport: ReadyPackageContentExportV1) {
  const requestJson = serializeReadyPackageContentExportV1(contentExport);
  return {
    intakeId: CORE_INTAKE_ID,
    readyPackageId: READY_PACKAGE_ID,
    status: "ACCEPTED" as const,
    exportSha256: createHash("sha256").update(requestJson, "utf8").digest("hex"),
  };
}

describe("retry-safe ReadyPackage Core content submission", () => {
  it("freezes the exact request before network and reuses it after an unknown outcome", async () => {
    const { database, readyPackages, handedOff, submissions, contentExport } = await fixture();
    try {
      const attempts: Array<{ intakeId: string; requestJson: string }> = [];
      let exporterCalls = 0;
      const expected = resultFor(contentExport);
      const transport: CoreContentTransport = {
        async submit(intakeId, requestJson) {
          attempts.push({ intakeId, requestJson });
          if (attempts.length === 1) throw new Error("SIMULATED_UNKNOWN_CORE_CONTENT_OUTCOME");
          return expected;
        },
      };
      const input = {
        workspaceId: WORKSPACE_ID,
        readyPackageId: handedOff.id,
        expectedDigest: handedOff.evidence.digest,
        submit: true as const,
      };
      const exporter = async () => {
        exporterCalls += 1;
        return structuredClone(contentExport);
      };
      await expect(
        submitReadyPackageCoreContent(input, readyPackages, submissions, exporter, transport),
      ).rejects.toThrow("SIMULATED_UNKNOWN_CORE_CONTENT_OUTCOME");
      const pending = submissions.list(handedOff.id, WORKSPACE_ID)[0]!;
      expect(pending.contentDelivery).toMatchObject({
        state: "PENDING",
        coreIntakeId: CORE_INTAKE_ID,
        requestJson: attempts[0]!.requestJson,
      });
      const recovered = await submitReadyPackageCoreContent(
        input,
        readyPackages,
        submissions,
        exporter,
        transport,
      );
      expect(exporterCalls).toBe(1);
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(recovered.deliveryReplayed).toBe(true);
      expect(recovered.transportResultReplayed).toBe(false);
      expect(recovered.coreContentResult).toEqual(expected);
      expect(recovered.submission.contentDelivery).toMatchObject({ state: "RESULT_RECORDED" });
    } finally {
      database.close();
    }
  });

  it("finalizes locally from persisted transport evidence without rebuilding or calling Core", async () => {
    const { database, readyPackages, handedOff, submissions, contentExport } = await fixture();
    try {
      const intakeSubmission = submissions.list(handedOff.id, WORKSPACE_ID)[0]!;
      const requestJson = serializeReadyPackageContentExportV1(contentExport);
      const exportSha256 = createHash("sha256").update(requestJson, "utf8").digest("hex");
      submissions.prepareContentDelivery(intakeSubmission.submissionId, WORKSPACE_ID, {
        coreIntakeId: CORE_INTAKE_ID,
        requestJson,
        requestSha256: exportSha256,
      });
      submissions.recordContentTransportResult(intakeSubmission.submissionId, WORKSPACE_ID, {
        intakeId: CORE_INTAKE_ID,
        readyPackageId: handedOff.id,
        status: "ACCEPTED",
        exportSha256,
      });
      const exporter = vi.fn(async () => {
        throw new Error("exporter must not run");
      });
      const transport = {
        submit: vi.fn(async () => {
          throw new Error("transport must not run");
        }),
      };
      const recovered = await submitReadyPackageCoreContent(
        {
          workspaceId: WORKSPACE_ID,
          readyPackageId: handedOff.id,
          expectedDigest: handedOff.evidence.digest,
          submit: true,
        },
        readyPackages,
        submissions,
        exporter,
        transport,
      );
      expect(exporter).not.toHaveBeenCalled();
      expect(transport.submit).not.toHaveBeenCalled();
      expect(recovered.transportResultReplayed).toBe(true);
      expect(recovered.submission.contentDelivery?.state).toBe("RESULT_RECORDED");
    } finally {
      database.close();
    }
  });

  it("replays an already finalized content delivery without another external side effect", async () => {
    const { database, readyPackages, handedOff, submissions, contentExport } = await fixture();
    try {
      const expected = resultFor(contentExport);
      await submitReadyPackageCoreContent(
        {
          workspaceId: WORKSPACE_ID,
          readyPackageId: handedOff.id,
          expectedDigest: handedOff.evidence.digest,
          submit: true,
        },
        readyPackages,
        submissions,
        async () => structuredClone(contentExport),
        { submit: async () => expected },
      );
      const exporter = vi.fn(async () => {
        throw new Error("exporter must not run");
      });
      const transport = { submit: vi.fn(async () => expected) };
      const replay = await submitReadyPackageCoreContent(
        {
          workspaceId: WORKSPACE_ID,
          readyPackageId: handedOff.id,
          expectedDigest: handedOff.evidence.digest,
          submit: true,
        },
        readyPackages,
        submissions,
        exporter,
        transport,
      );
      expect(exporter).not.toHaveBeenCalled();
      expect(transport.submit).not.toHaveBeenCalled();
      expect(replay.deliveryReplayed).toBe(true);
      expect(replay.transportResultReplayed).toBe(true);
      expect(replay.coreContentResult).toEqual(expected);
    } finally {
      database.close();
    }
  });
});
''',
)

# 7) Replace the real-Core E2E with intake + content recovery across the actual HTTP/PostgreSQL boundary.
write(
    "apps/admin/src/server/e2e/core-intake-real-core.e2e.ts",
    '''import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  serializeReadyPackageContentExportV1,
  type CoreIntakeRequest,
  type CoreIntakeResult,
  type ReadyPackageContentExportV1,
} from "@markorbit/contracts";
import { initializeRegistry } from "@markorbit/persistence";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import { SqliteReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import { HttpCoreContentTransport, type CoreContentTransport } from "../core-content-http-transport";
import { HttpCoreIntakeTransport, type CoreIntakeTransport } from "../core-intake-http-transport";
import { submitReadyPackageCoreContent } from "../ready-package-core-content-submit";
import { submitReadyPackageCoreIntake } from "../ready-package-core-intake-submit";

const KNOWLEDGE_WORKSPACE_ID = "wsp_01H00000000000000000000000";
const READY_PACKAGE_ID = "rdp_01H00000000000000000000001";
const MARKDOWN = "# Real Core E2E\n\nFrozen canonical content.\n";
const STAGING_SHA = createHash("sha256").update(MARKDOWN, "utf8").digest("hex");

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the real Core intake E2E test`);
  return value;
}

function createFixture() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  const readyPackages = new SqliteReadyPackageRegistryRepository(
    database,
    () => new Date("2026-08-11T01:30:00.000Z"),
    () => READY_PACKAGE_ID,
  );
  const readyPackage = readyPackages.createVerified({
    workspaceId: KNOWLEDGE_WORKSPACE_ID,
    sourceId: "src_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    rawArtifactSha256: "a".repeat(64),
    capturedAt: "2026-08-11T01:20:00.000Z",
    conversionRunId: "cvr_01H00000000000000000000000",
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    stagingDocumentId: "std_01H00000000000000000000000",
    stagingSha256: STAGING_SHA,
    verificationId: "svr_01H00000000000000000000000",
    verificationOutcome: "PASS",
    idempotencyKey: "ready-package:real-core:e2e",
  }).readyPackage;
  const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
    database,
    () => new Date("2026-08-11T01:31:00.000Z"),
    () => "cis_real_core_e2e",
  );
  return { database, readyPackages, readyPackage, submissions };
}

function contentExport(readyPackage: ReturnType<typeof createFixture>["readyPackage"]): ReadyPackageContentExportV1 {
  return {
    contractVersion: "1.0",
    objectType: "READY_PACKAGE_CONTENT_EXPORT",
    readyPackageId: readyPackage.id,
    knowledgeWorkspaceId: KNOWLEDGE_WORKSPACE_ID,
    readyPackageDigest: readyPackage.evidence.digest,
    provenance: {
      sourceId: readyPackage.evidence.sourceId!,
      conversionRunId: readyPackage.evidence.conversionRunId!,
      verificationId: readyPackage.evidence.verificationId!,
      verificationOutcome: readyPackage.evidence.verificationOutcome!,
      capturedAt: readyPackage.evidence.capturedAt!,
      converter: readyPackage.evidence.converter!,
      legalTruthVerified: false,
    },
    rawArtifact: {
      artifactId: readyPackage.evidence.artifactIds[0]!,
      sha256: readyPackage.evidence.rawArtifactSha256!,
      sizeBytes: 11,
      mimeType: "text/plain",
      originalName: "source.txt",
    },
    stagingDocument: {
      documentId: readyPackage.evidence.stagingDocumentId,
      sha256: readyPackage.evidence.stagingSha256!,
      sizeBytes: Buffer.byteLength(MARKDOWN, "utf8"),
      mediaType: "text/markdown",
      encoding: "utf-8",
      content: MARKDOWN,
    },
  };
}

describe.sequential("Knowledge -> real Core ReadyPackage intake and content", () => {
  it("recovers both delivery stages by replaying their exact frozen requests", async () => {
    const intakeUrl = requiredEnvironment("MARKORBIT_CORE_INTAKE_URL");
    const internalSecret = requiredEnvironment("MARKORBIT_CORE_INTERNAL_SECRET");
    const coreWorkspaceId = requiredEnvironment("MARKORBIT_E2E_CORE_WORKSPACE_ID").toLowerCase();
    const { database, readyPackages, readyPackage, submissions } = createFixture();

    try {
      const realIntakeTransport = new HttpCoreIntakeTransport(intakeUrl, internalSecret, fetch, 10_000);
      const intakeAttempts: Array<{ request: CoreIntakeRequest; idempotencyKey: string }> = [];
      let firstCoreResult: CoreIntakeResult | null = null;
      const lossyIntakeTransport: CoreIntakeTransport = {
        async submit(request, idempotencyKey) {
          intakeAttempts.push({ request: structuredClone(request), idempotencyKey });
          const result = await realIntakeTransport.submit(request, idempotencyKey);
          if (!firstCoreResult) {
            firstCoreResult = result;
            throw new Error("E2E_SIMULATED_INTAKE_RESPONSE_LOSS_AFTER_CORE_COMMIT");
          }
          return result;
        },
      };
      const intakeInput = {
        workspaceId: readyPackage.workspaceId,
        coreWorkspaceId,
        readyPackageId: readyPackage.id,
        expectedDigest: readyPackage.evidence.digest,
        submit: true as const,
      };
      await expect(
        submitReadyPackageCoreIntake(intakeInput, readyPackages, submissions, lossyIntakeTransport),
      ).rejects.toThrow("E2E_SIMULATED_INTAKE_RESPONSE_LOSS_AFTER_CORE_COMMIT");
      const recoveredIntake = await submitReadyPackageCoreIntake(
        intakeInput,
        readyPackages,
        submissions,
        lossyIntakeTransport,
      );
      expect(intakeAttempts).toHaveLength(2);
      expect(intakeAttempts[1]).toEqual(intakeAttempts[0]);
      expect(recoveredIntake.coreIntakeResult).toEqual(firstCoreResult);
      expect(recoveredIntake.acknowledgment.readyPackage.status).toBe("HANDED_OFF");

      const frozenExport = contentExport(recoveredIntake.acknowledgment.readyPackage);
      const realContentTransport = new HttpCoreContentTransport(
        intakeUrl,
        internalSecret,
        fetch,
        10_000,
      );
      const contentAttempts: Array<{ intakeId: string; requestJson: string }> = [];
      let firstContentResult: Awaited<ReturnType<CoreContentTransport["submit"]>> | null = null;
      const lossyContentTransport: CoreContentTransport = {
        async submit(intakeId, requestJson, expected) {
          contentAttempts.push({ intakeId, requestJson });
          const result = await realContentTransport.submit(intakeId, requestJson, expected);
          if (!firstContentResult) {
            firstContentResult = result;
            throw new Error("E2E_SIMULATED_CONTENT_RESPONSE_LOSS_AFTER_CORE_COMMIT");
          }
          return result;
        },
      };
      let exporterCalls = 0;
      const contentInput = {
        workspaceId: readyPackage.workspaceId,
        readyPackageId: readyPackage.id,
        expectedDigest: readyPackage.evidence.digest,
        submit: true as const,
      };
      const exporter = async () => {
        exporterCalls += 1;
        return structuredClone(frozenExport);
      };
      await expect(
        submitReadyPackageCoreContent(
          contentInput,
          readyPackages,
          submissions,
          exporter,
          lossyContentTransport,
        ),
      ).rejects.toThrow("E2E_SIMULATED_CONTENT_RESPONSE_LOSS_AFTER_CORE_COMMIT");
      const pending = submissions.list(readyPackage.id, readyPackage.workspaceId)[0]!;
      expect(pending.contentDelivery).toMatchObject({
        state: "PENDING",
        coreIntakeId: recoveredIntake.coreIntakeResult.intakeId,
        requestJson: serializeReadyPackageContentExportV1(frozenExport),
      });
      const recoveredContent = await submitReadyPackageCoreContent(
        contentInput,
        readyPackages,
        submissions,
        exporter,
        lossyContentTransport,
      );
      expect(exporterCalls).toBe(1);
      expect(contentAttempts).toHaveLength(2);
      expect(contentAttempts[1]).toEqual(contentAttempts[0]);
      expect(recoveredContent.coreContentResult).toEqual(firstContentResult);
      expect(recoveredContent.coreContentResult.status).toBe("ACCEPTED");
      expect(recoveredContent.submission.contentDelivery?.state).toBe("RESULT_RECORDED");
    } finally {
      database.close();
    }
  });
});
''',
)

# 8) Pin the real boundary to merged Core PR #74 and assert Core PostgreSQL state.
workflow = Path(".github/workflows/core-intake-e2e.yml")
wf = workflow.read_text()
wf = wf.replace(
    "CORE_REF: 083f4421c1a97e8d6af8e0a988eb68d01a59fa15",
    "CORE_REF: bfa7c8a8337fd428b2d85e9d71517a9ffd6755f5",
)
trigger_marker = '      - "apps/admin/src/server/core-intake-http-transport.ts"\n'
if trigger_marker not in wf:
    raise SystemExit("E2E trigger marker not found")
wf = wf.replace(
    trigger_marker,
    trigger_marker
    + '      - "apps/admin/src/server/core-content-http-transport.ts"\n'
    + '      - "apps/admin/src/server/ready-package-core-content-submit.ts"\n'
    + '      - "apps/admin/src/app/api/ready-packages/**/core-content/**"\n'
    + '      - "packages/contracts/src/ready-package-content-export-v1.ts"\n',
    1,
)
run_marker = '''      - name: Core receiver log
'''
assertion = '''      - name: Assert Core PostgreSQL content acceptance
        working-directory: .e2e/markorbit-core
        env:
          NODE_ENV: test
          DATABASE_URL: ${{ env.CORE_DATABASE_URL }}
          DB_MIGRATION_NAMESPACE: core
          DB_APPLICATION_NAME: knowledge-core-content-e2e-assert
        run: |
          node --input-type=module <<'NODE'
          import { ManagedDatabase, parseDatabaseConfig } from './packages/persistence/dist/index.js';
          const database = new ManagedDatabase(parseDatabaseConfig(process.env));
          await database.start();
          try {
            const result = await database.getPool().query(
              `SELECT i.status, c.ready_package_id, c.staging_markdown
               FROM knowledge_intakes i
               JOIN knowledge_intake_contents c USING(intake_id)
               WHERE c.ready_package_id=$1`,
              ['rdp_01H00000000000000000000001'],
            );
            if (result.rowCount !== 1) throw new Error(`expected one Core content row, got ${result.rowCount}`);
            const row = result.rows[0];
            if (row.status !== 'ACCEPTED') throw new Error(`expected ACCEPTED, got ${row.status}`);
            if (row.staging_markdown !== '# Real Core E2E\\n\\nFrozen canonical content.\\n') {
              throw new Error('Core PostgreSQL staging Markdown does not match the frozen export');
            }
          } finally {
            await database.close();
          }
          NODE
'''
if run_marker not in wf:
    raise SystemExit("Core receiver log marker not found")
wf = wf.replace(run_marker, assertion + run_marker, 1)
workflow.write_text(wf)

# 9) Document that the same intake URL/secret drive both stages.
env_path = Path(".env.example")
env_text = env_path.read_text()
needle = "MARKORBIT_CORE_INTAKE_URL=\n"
if needle in env_text and "Core content delivery derives" not in env_text:
    env_text = env_text.replace(
        needle,
        needle
        + "# Core content delivery derives /:intakeId/content from the same intake URL; no second destination is configured.\n",
        1,
    )
env_path.write_text(env_text)
