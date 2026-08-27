import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import type {
  ExpertQuestionSendIntent,
  ExpertQuestionSendReceipt,
  ExpertQuestionSender,
} from "./expert-qa-operator-service";

export type ExpertCommunicationStatus = {
  connected: boolean;
  reason?: string;
};

type ParticipantConfig = {
  address: string;
  displayName?: string;
};

type WorkspaceCommunicationConfig = {
  accountRef: string;
  sender: ParticipantConfig;
  recipients: Record<string, ParticipantConfig>;
};

type ExpertCommunicationConfig = {
  workspaces: Record<string, WorkspaceCommunicationConfig>;
};

type CoreSendReceipt = {
  schemaVersion: 1;
  sendId: string;
  workspaceId: string;
  accountRef: string;
  state: "SENT";
  messageId: string;
  threadRef: string;
  acceptedAt: string;
};

export type CoreExpertQuestionSenderOptions = {
  workspaceId: string;
  coreUrl?: string;
  internalSecret?: string;
  configJson?: string;
  fetchImpl?: typeof fetch;
};

function required(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string") throw new RegistryValidationError(`${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new RegistryValidationError(`${field} must contain 1 to ${maxLength} characters`);
  }
  return normalized;
}

function coreBaseUrl(options: CoreExpertQuestionSenderOptions): string {
  const raw =
    options.coreUrl?.trim() ||
    process.env.MARKORBIT_CORE_COMMUNICATION_URL?.trim() ||
    process.env.MARKORBIT_CORE_AUTH_URL?.trim() ||
    process.env.MARKORBIT_CORE_INTAKE_URL?.trim();
  if (!raw) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Core Shared Communication endpoint is not configured.",
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Core Shared Communication endpoint is invalid.",
    );
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Core Shared Communication endpoint must be an HTTP(S) origin without embedded credentials.",
    );
  }
  return url.origin;
}

function internalSecret(options: CoreExpertQuestionSenderOptions): string {
  const secret = options.internalSecret ?? process.env.MARKORBIT_CORE_INTERNAL_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Core internal authentication for Shared Communication is not configured.",
    );
  }
  return secret;
}

function participant(value: unknown, field: string): ParticipantConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistryValidationError(`${field} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "address" && key !== "displayName")) {
    throw new RegistryValidationError(`${field} contains unsupported fields`);
  }
  const address = required(record.address, `${field}.address`);
  const displayName =
    record.displayName === undefined ? undefined : required(record.displayName, `${field}.displayName`, 300);
  return { address, ...(displayName ? { displayName } : {}) };
}

function parseConfig(options: CoreExpertQuestionSenderOptions): ExpertCommunicationConfig {
  const raw = options.configJson ?? process.env.MARKORBIT_EXPERT_COMMUNICATION_CONFIG;
  if (!raw?.trim()) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Expert Communication routing is not configured.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Expert Communication routing configuration is invalid JSON.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Expert Communication routing configuration is invalid.",
    );
  }
  const root = parsed as Record<string, unknown>;
  if (Object.keys(root).some((key) => key !== "workspaces") || !root.workspaces || typeof root.workspaces !== "object" || Array.isArray(root.workspaces)) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Expert Communication routing configuration must contain only a workspaces object.",
    );
  }
  return { workspaces: root.workspaces as Record<string, WorkspaceCommunicationConfig> };
}

function workspaceConfig(options: CoreExpertQuestionSenderOptions): WorkspaceCommunicationConfig {
  const workspaceId = required(options.workspaceId, "workspaceId");
  const raw = parseConfig(options).workspaces[workspaceId];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_WORKSPACE_NOT_CONFIGURED",
      `Shared Communication is not configured for workspace ${workspaceId}.`,
    );
  }
  const record = raw as unknown as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["accountRef", "sender", "recipients"].includes(key))) {
    throw new RegistryValidationError("Expert workspace Communication configuration contains unsupported fields");
  }
  if (!record.recipients || typeof record.recipients !== "object" || Array.isArray(record.recipients)) {
    throw new RegistryValidationError("Expert workspace Communication recipients must be an object");
  }
  const recipients = Object.fromEntries(
    Object.entries(record.recipients as Record<string, unknown>).map(([expertRef, value]) => [
      required(expertRef, "expertRef"),
      participant(value, `recipients.${expertRef}`),
    ]),
  );
  return {
    accountRef: required(record.accountRef, "accountRef"),
    sender: participant(record.sender, "sender"),
    recipients,
  };
}

function responseRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function coreErrorCode(value: unknown): string | undefined {
  const record = responseRecord(value);
  if (typeof record?.code === "string" && record.code.trim()) return record.code.trim();
  const nested = responseRecord(record?.error);
  return typeof nested?.code === "string" && nested.code.trim() ? nested.code.trim() : undefined;
}

function parseReceipt(value: unknown, workspaceId: string, accountRef: string): CoreSendReceipt {
  const record = responseRecord(value);
  if (
    record?.schemaVersion !== 1 ||
    record.state !== "SENT" ||
    record.workspaceId !== workspaceId ||
    record.accountRef !== accountRef
  ) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_RECEIPT_INVALID",
      "Core Shared Communication returned an invalid send receipt.",
    );
  }
  const receipt: CoreSendReceipt = {
    schemaVersion: 1,
    sendId: required(record.sendId, "sendId"),
    workspaceId,
    accountRef,
    state: "SENT",
    messageId: required(record.messageId, "messageId"),
    threadRef: required(record.threadRef, "threadRef"),
    acceptedAt: required(record.acceptedAt, "acceptedAt", 80),
  };
  if (new Date(receipt.acceptedAt).toISOString() !== receipt.acceptedAt) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_RECEIPT_INVALID",
      "Core Shared Communication receipt acceptedAt is not a canonical timestamp.",
    );
  }
  return receipt;
}

export class CoreExpertQuestionSender implements ExpertQuestionSender {
  constructor(private readonly options: CoreExpertQuestionSenderOptions) {}

  async sendQuestion(intent: ExpertQuestionSendIntent): Promise<ExpertQuestionSendReceipt> {
    const workspaceId = required(this.options.workspaceId, "workspaceId");
    const config = workspaceConfig(this.options);
    const recipient = config.recipients[intent.task.expertRef];
    if (!recipient) {
      throw new RegistryError(
        "EXPERT_COMMUNICATION_RECIPIENT_NOT_CONFIGURED",
        `No Shared Communication recipient is configured for expert ${intent.task.expertRef}.`,
      );
    }

    const correlationId = `knowledge-expert:${intent.task.taskId}`;
    const body = {
      schemaVersion: 1,
      accountRef: config.accountRef,
      channel: "EMAIL",
      participants: [
        { role: "SENDER", ...config.sender },
        { role: "TO", ...recipient },
      ],
      subject: `[MarkOrbit Expert] ${intent.task.jurisdiction} · ${intent.task.topic}`,
      textBody: intent.task.question,
      attachments: [],
      ...(intent.task.communicationThreadRef
        ? { replyToThreadRef: intent.task.communicationThreadRef }
        : {}),
    } as const;

    let response: Response;
    try {
      response = await (this.options.fetchImpl ?? fetch)(
        `${coreBaseUrl(this.options)}/internal/v1/managed-communication/sends`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-markorbit-internal-authorization": internalSecret(this.options),
            "x-markorbit-workspace-id": workspaceId,
            "idempotency-key": required(intent.idempotencyKey, "idempotencyKey"),
            "x-correlation-id": correlationId,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new RegistryError(
        "EXPERT_COMMUNICATION_UNAVAILABLE",
        "Core Shared Communication is unavailable; delivery state was not changed by Knowledge.",
      );
    }

    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch {
      // Invalid success/error payloads fail closed below.
    }

    if (!response.ok) {
      const code = coreErrorCode(responseBody) ?? `HTTP_${response.status}`;
      if (code === "RECONCILIATION_REQUIRED" || code === "SEND_IN_PROGRESS") {
        throw new RegistryError(
          `EXPERT_COMMUNICATION_${code}`,
          "Shared Communication delivery is uncertain or still in progress. Automatic resend is blocked; reconcile in Core before retrying.",
        );
      }
      if (code === "IDEMPOTENCY_CONFLICT") {
        throw new RegistryError(
          "EXPERT_COMMUNICATION_IDEMPOTENCY_CONFLICT",
          "Shared Communication rejected the Expert send because the stable task identity is bound to different content.",
        );
      }
      throw new RegistryError(
        "EXPERT_COMMUNICATION_SEND_FAILED",
        `Core Shared Communication rejected the Expert send (${code}).`,
      );
    }

    const receipt = parseReceipt(responseBody, workspaceId, config.accountRef);
    return {
      communicationSendRequestRef: receipt.sendId,
      communicationThreadRef: receipt.threadRef,
      sentAt: receipt.acceptedAt,
    };
  }
}

export function getExpertCommunicationStatus(workspaceId: string): ExpertCommunicationStatus {
  try {
    coreBaseUrl({ workspaceId });
    internalSecret({ workspaceId });
    workspaceConfig({ workspaceId });
    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      reason:
        error instanceof Error
          ? error.message
          : "Shared Communication is not configured for this workspace.",
    };
  }
}

export function getExpertQuestionSender(workspaceId: string): ExpertQuestionSender {
  return new CoreExpertQuestionSender({ workspaceId });
}
