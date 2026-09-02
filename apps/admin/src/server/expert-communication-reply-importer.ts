import { createHash } from "node:crypto";
import type { ExpertQuestionTaskV1, ExpertSourceRecordV1 } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { SqliteExpertSourceRepository } from "@markorbit/persistence/expert-sources";
import { ExpertQaOperatorService } from "./expert-qa-operator-service";

export type ImportedExpertReply = {
  task: ExpertQuestionTaskV1;
  sourceRecord: ExpertSourceRecordV1;
};

export type CoreExpertReplyImporterOptions = {
  workspaceId: string;
  coreUrl?: string;
  authorization?: string;
  configJson?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

type ParticipantConfig = { address: string };
type WorkspaceConfig = {
  accountRef: string;
  sender: ParticipantConfig;
  recipients: Record<string, ParticipantConfig>;
};
type ThreadMessage = {
  messageId: string;
  direction: "INBOUND" | "OUTBOUND";
  participants: { role: string; address: string }[];
  attachments: { attachmentRef: string; sha256: string }[];
  occurredAt: string;
  exactEvidence?: { evidenceRef: string; sha256: string };
};

function required(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string") throw new RegistryValidationError(`${field} is required`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) {
    throw new RegistryValidationError(`${field} must contain 1 to ${max} characters`);
  }
  return cleaned;
}

function timestamp(value: unknown, field: string): string {
  const cleaned = required(value, field, 80);
  const date = new Date(cleaned);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== cleaned) {
    throw new RegistryError("EXPERT_COMMUNICATION_REPLY_INVALID", `${field} is not canonical`);
  }
  return cleaned;
}

function baseUrl(options: CoreExpertReplyImporterOptions): string {
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
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Core Shared Communication endpoint must be an HTTP(S) origin.",
    );
  }
  return url.origin;
}

function authorization(options: CoreExpertReplyImporterOptions): string {
  const value = options.authorization ?? process.env.MARKORBIT_CORE_INTERNAL_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Core internal authentication for Shared Communication is not configured.",
    );
  }
  return value;
}

function participant(value: unknown, field: string): ParticipantConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistryValidationError(`${field} must be an object`);
  }
  return { address: required((value as Record<string, unknown>).address, `${field}.address`) };
}

function workspaceConfig(options: CoreExpertReplyImporterOptions): WorkspaceConfig {
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
  const workspaces = (parsed as Record<string, unknown>).workspaces;
  if (!workspaces || typeof workspaces !== "object" || Array.isArray(workspaces)) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Expert Communication routing must contain workspaces.",
    );
  }
  const workspace = (workspaces as Record<string, unknown>)[
    required(options.workspaceId, "workspaceId")
  ];
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_WORKSPACE_NOT_CONFIGURED",
      `Shared Communication is not configured for workspace ${options.workspaceId}.`,
    );
  }
  const record = workspace as Record<string, unknown>;
  if (
    !record.recipients ||
    typeof record.recipients !== "object" ||
    Array.isArray(record.recipients)
  ) {
    throw new RegistryValidationError(
      "Expert workspace Communication recipients must be an object",
    );
  }
  return {
    accountRef: required(record.accountRef, "accountRef"),
    sender: participant(record.sender, "sender"),
    recipients: Object.fromEntries(
      Object.entries(record.recipients as Record<string, unknown>).map(([expertRef, value]) => [
        required(expertRef, "expertRef"),
        participant(value, `recipients.${expertRef}`),
      ]),
    ),
  };
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistryError("EXPERT_COMMUNICATION_REPLY_INVALID", `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseMessage(value: unknown, accountRef: string, threadRef: string): ThreadMessage {
  const raw = object(value, "message");
  if (
    raw.schemaVersion !== 1 ||
    raw.accountRef !== accountRef ||
    raw.threadRef !== threadRef ||
    raw.channel !== "EMAIL" ||
    (raw.direction !== "INBOUND" && raw.direction !== "OUTBOUND") ||
    !Array.isArray(raw.participants) ||
    !Array.isArray(raw.attachments)
  ) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_REPLY_INVALID",
      "Core Shared Communication returned an invalid message envelope.",
    );
  }
  const participants = raw.participants.map((value, index) => {
    const item = object(value, `participants[${index}]`);
    return {
      role: required(item.role, `participants[${index}].role`, 30),
      address: required(item.address, `participants[${index}].address`),
    };
  });
  if (participants.filter((value) => value.role === "SENDER").length !== 1) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_REPLY_INVALID",
      "Communication evidence must contain exactly one sender.",
    );
  }
  const attachments = raw.attachments.map((value, index) => {
    const item = object(value, `attachments[${index}]`);
    const sha256 = required(item.sha256, `attachments[${index}].sha256`, 64);
    if (!/^[a-f0-9]{64}$/u.test(sha256)) {
      throw new RegistryError(
        "EXPERT_COMMUNICATION_REPLY_INVALID",
        `attachments[${index}] must retain its SHA-256 checksum.`,
      );
    }
    return {
      attachmentRef: required(item.attachmentRef, `attachments[${index}].attachmentRef`),
      sha256,
    };
  });
  const providerObservation = object(raw.providerObservation, "providerObservation");
  const base: ThreadMessage = {
    messageId: required(raw.messageId, "messageId"),
    direction: raw.direction,
    participants,
    attachments,
    occurredAt: timestamp(raw.occurredAt, "occurredAt"),
  };
  if (raw.direction === "OUTBOUND") {
    return base;
  }
  const exactEvidence = object(raw.exactEvidence, "exactEvidence");
  if (exactEvidence.schemaVersion !== 1) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_EXACT_EVIDENCE_REQUIRED",
      "Inbound Expert reply must retain Core exact provider evidence.",
    );
  }
  const evidenceRef = required(exactEvidence.evidenceRef, "exactEvidence.evidenceRef");
  const evidenceSha256 = required(exactEvidence.sha256, "exactEvidence.sha256", 64);
  if (!/^[a-f0-9]{64}$/u.test(evidenceSha256)) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_REPLY_INVALID",
      "Core exact evidence must retain a lowercase SHA-256 digest.",
    );
  }
  if (
    required(exactEvidence.provider, "exactEvidence.provider", 120) !==
      required(providerObservation.provider, "providerObservation.provider", 120) ||
    required(exactEvidence.providerMessageId, "exactEvidence.providerMessageId") !==
      required(providerObservation.providerMessageId, "providerObservation.providerMessageId")
  ) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_REPLY_INVALID",
      "Core exact evidence provenance must match the normalized provider observation.",
    );
  }
  if (!Number.isSafeInteger(exactEvidence.sizeBytes) || (exactEvidence.sizeBytes as number) < 1) {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_REPLY_INVALID",
      "Core exact evidence size must be a positive safe integer.",
    );
  }
  return {
    ...base,
    exactEvidence: { evidenceRef, sha256: evidenceSha256 },
  };
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function verifyIdentity(
  value: ThreadMessage,
  expert: ParticipantConfig,
  localSender: ParticipantConfig,
): void {
  const sender = value.participants.find((participant) => participant.role === "SENDER");
  if (!sender || normalizeAddress(sender.address) !== normalizeAddress(expert.address)) {
    throw new RegistryConflictError(
      "EXPERT_REPLY_SENDER_MISMATCH",
      "Inbound Communication sender does not match the configured Expert identity.",
    );
  }
  if (
    !value.participants.some(
      (participant) =>
        (participant.role === "TO" || participant.role === "CC") &&
        normalizeAddress(participant.address) === normalizeAddress(localSender.address),
    )
  ) {
    throw new RegistryConflictError(
      "EXPERT_REPLY_RECIPIENT_MISMATCH",
      "Inbound Communication reply is not addressed to the configured Knowledge sender.",
    );
  }
}

function sourceId(taskId: string, messageId: string): string {
  return `esr_${createHash("sha256").update(`${taskId}\n${messageId}`).digest("hex").slice(0, 40)}`;
}

export class CoreExpertReplyImporter {
  private readonly operator: ExpertQaOperatorService;

  constructor(
    private readonly repository: SqliteExpertSourceRepository,
    private readonly options: CoreExpertReplyImporterOptions,
  ) {
    this.operator = new ExpertQaOperatorService(repository);
  }

  async importReply(taskId: string): Promise<ImportedExpertReply> {
    const task = this.repository.getTask(required(taskId, "taskId"));
    if (!task) throw new RegistryValidationError(`Expert task ${taskId} was not found`);
    if (!task.communicationThreadRef || !task.sentAt) {
      throw new RegistryConflictError(
        "EXPERT_TASK_COMMUNICATION_THREAD_NOT_BOUND",
        `Expert task ${task.taskId} has no durable Shared Communication send/thread identity.`,
      );
    }
    if (!["SENT", "WAITING_RESPONSE", "RESPONSE_RECEIVED"].includes(task.state)) {
      throw new RegistryConflictError(
        "EXPERT_TASK_NOT_WAITING_FOR_REPLY",
        `Expert task ${task.taskId} is not in a reply-importable state.`,
      );
    }

    const workspaceId = required(this.options.workspaceId, "workspaceId");
    const route = workspaceConfig(this.options);
    const expert = route.recipients[task.expertRef];
    if (!expert) {
      throw new RegistryError(
        "EXPERT_COMMUNICATION_RECIPIENT_NOT_CONFIGURED",
        `No Shared Communication recipient is configured for expert ${task.expertRef}.`,
      );
    }

    let response: Response;
    try {
      response = await (this.options.fetchImpl ?? fetch)(
        `${baseUrl(this.options)}/internal/v1/managed-communication/thread-resolutions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-markorbit-internal-authorization": authorization(this.options),
            "x-markorbit-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            accountRef: route.accountRef,
            threadRef: task.communicationThreadRef,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new RegistryError(
        "EXPERT_COMMUNICATION_UNAVAILABLE",
        "Core Shared Communication thread evidence is unavailable; Expert task state was not changed.",
      );
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* fail closed below */
    }
    if (!response.ok) {
      throw new RegistryError(
        "EXPERT_COMMUNICATION_REPLY_RESOLUTION_FAILED",
        `Core Shared Communication rejected thread resolution (HTTP_${response.status}).`,
      );
    }
    const raw = object(body, "threadResolution");
    if (
      raw.schemaVersion !== 1 ||
      raw.workspaceId !== workspaceId ||
      raw.accountRef !== route.accountRef ||
      raw.threadRef !== task.communicationThreadRef ||
      !Array.isArray(raw.messages)
    ) {
      throw new RegistryError(
        "EXPERT_COMMUNICATION_REPLY_INVALID",
        "Core Shared Communication returned an invalid thread resolution.",
      );
    }
    const sentAt = Date.parse(task.sentAt);
    const inbound = raw.messages
      .map((value) => parseMessage(value, route.accountRef, task.communicationThreadRef!))
      .filter((value) => value.direction === "INBOUND" && Date.parse(value.occurredAt) >= sentAt)
      .sort(
        (left, right) =>
          Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
          left.messageId.localeCompare(right.messageId),
      )[0];
    if (!inbound) {
      throw new RegistryError(
        "EXPERT_REPLY_NOT_OBSERVED",
        `No inbound Expert reply has been observed on thread ${task.communicationThreadRef}.`,
      );
    }
    if (!inbound.exactEvidence) {
      throw new RegistryError(
        "EXPERT_COMMUNICATION_EXACT_EVIDENCE_REQUIRED",
        "Inbound Expert reply must retain Core exact provider evidence.",
      );
    }
    verifyIdentity(inbound, expert, route.sender);

    const capturedAt = (this.options.now?.() ?? new Date()).toISOString();
    if (Date.parse(capturedAt) < Date.parse(inbound.occurredAt)) {
      throw new RegistryError(
        "EXPERT_COMMUNICATION_REPLY_INVALID",
        "Expert reply capture time cannot precede the observed reply.",
      );
    }
    const sourceRecord: ExpertSourceRecordV1 = {
      protocolVersion: "1.0",
      objectType: "EXPERT_SOURCE_RECORD",
      sourceRecordId: sourceId(task.taskId, inbound.messageId),
      taskId: task.taskId,
      expertRef: task.expertRef,
      ...(task.organizationRef ? { organizationRef: task.organizationRef } : {}),
      jurisdiction: task.jurisdiction,
      topic: task.topic,
      communication: {
        communicationThreadRef: task.communicationThreadRef,
        messageRefs: [inbound.messageId],
      },
      rawAnswerArtifactRefs: [inbound.exactEvidence.evidenceRef],
      attachmentRefs: inbound.attachments.map((attachment) => attachment.attachmentRef),
      receivedAt: inbound.occurredAt,
      capturedAt,
      relatedSourceRefs: [...task.relatedSourceRefs],
      relatedCaseRefs: [...task.relatedCaseRefs],
      provenance: {
        sourceFamily: "EXPERT",
        originalEvidenceAuthoritative: true,
        normalizedDerivativeIsOriginalEvidence: false,
      },
      accessClassification: task.accessClassification,
    };
    const updated = this.operator.recordReply(sourceRecord);
    const persisted = this.repository
      .listSourceRecordsForTask(task.taskId)
      .find((record) => record.sourceRecordId === sourceRecord.sourceRecordId);
    if (!persisted) {
      throw new RegistryError(
        "EXPERT_REPLY_PERSISTENCE_FAILED",
        "Expert reply source evidence was not durably persisted.",
      );
    }
    return { task: updated, sourceRecord: persisted };
  }
}

export function getExpertReplyImporter(
  repository: SqliteExpertSourceRepository,
  workspaceId: string,
): CoreExpertReplyImporter {
  return new CoreExpertReplyImporter(repository, { workspaceId });
}
