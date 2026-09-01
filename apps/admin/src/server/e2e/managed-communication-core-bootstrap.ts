import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { ExpertQuestionTaskV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "@markorbit/persistence/expert-sources";
import { CoreExpertReplyImporter } from "../expert-communication-reply-importer";

const mode = process.argv[2];
if (mode !== "seed" && mode !== "restart-replay") {
  throw new Error("Usage: managed-communication-core-bootstrap.ts <seed|restart-replay>");
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const coreUrl = required("MARKORBIT_CORE_COMMUNICATION_URL").replace(/\/$/u, "");
const authorization = required("MARKORBIT_CORE_INTERNAL_SECRET");
const workspaceId = required("MARKORBIT_E2E_COMM_WORKSPACE_ID");
const accountRef = required("MARKORBIT_E2E_COMM_ACCOUNT_REF");
const provider = required("MARKORBIT_E2E_COMM_PROVIDER");
const sqlitePath = required("MARKORBIT_E2E_EXPERT_SQLITE_PATH");
const expertRef = "expert:us:provider-neutral-e2e";
const localSender = "knowledge-e2e@example.test";
const expertSender = "expert-e2e@example.test";
const providerMessageId = "provider-message-knowledge-bootstrap-001";
const providerThreadId = "provider-thread-knowledge-bootstrap-001";
const occurredAt = "2026-09-01T13:00:00.000Z";
const observedAt = "2026-09-01T13:00:05.000Z";
const rawPayload = Buffer.from(
  [
    "Message-ID: <provider-message-knowledge-bootstrap-001@example.test>",
    "From: expert-e2e@example.test",
    "To: knowledge-e2e@example.test",
    "Subject: Provider-neutral bootstrap reply",
    "",
    "This is deterministic provider-neutral evidence for cross-repository acceptance.",
  ].join("\r\n"),
  "utf8",
);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const messageId = `commmsg_${sha256(
  `${workspaceId}\n${accountRef}\n${provider}\n${providerMessageId}`,
).slice(0, 32)}`;
const threadRef = `commthread_${sha256(
  `${workspaceId}\n${accountRef}\n${provider}\n${providerThreadId}`,
).slice(0, 32)}`;

const message = {
  schemaVersion: 1,
  messageId,
  accountRef,
  threadRef,
  channel: "EMAIL",
  direction: "INBOUND",
  participants: [
    { role: "SENDER", address: expertSender },
    { role: "TO", address: localSender },
  ],
  subject: "Provider-neutral bootstrap reply",
  textBody: "The production bootstrap preserved this exact provider-neutral reply.",
  attachments: [],
  occurredAt,
  providerObservation: {
    provider,
    providerMessageId,
    providerThreadId,
    observedAt,
  },
} as const;

const observationBody = {
  message,
  exactEvidence: {
    rawPayloadBase64: rawPayload.toString("base64"),
    mediaType: "message/rfc822",
    headers: [
      {
        name: "message-id",
        value: "<provider-message-knowledge-bootstrap-001@example.test>",
      },
    ],
    metadata: { mailbox: "provider-neutral-e2e" },
  },
} as const;

const configJson = JSON.stringify({
  workspaces: {
    [workspaceId]: {
      accountRef,
      sender: { address: localSender },
      recipients: {
        [expertRef]: { address: expertSender },
      },
    },
  },
});

function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-markorbit-internal-authorization": authorization,
    "x-markorbit-workspace-id": workspaceId,
    ...extra,
  };
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as unknown;
  assert.ok(body && typeof body === "object" && !Array.isArray(body));
  return body as Record<string, unknown>;
}

async function postObservation(): Promise<Record<string, unknown>> {
  const response = await fetch(`${coreUrl}/internal/v1/managed-communication/observations`, {
    method: "POST",
    headers: internalHeaders({ "idempotency-key": "knowledge-bootstrap-observation-001" }),
    body: JSON.stringify(observationBody),
  });
  assert.equal(response.status, 200);
  return jsonResponse(response);
}

async function resolveThread(): Promise<Record<string, unknown>> {
  const response = await fetch(`${coreUrl}/internal/v1/managed-communication/thread-resolutions`, {
    method: "POST",
    headers: internalHeaders(),
    body: JSON.stringify({ accountRef, threadRef }),
  });
  assert.equal(response.status, 200);
  return jsonResponse(response);
}

function assertExactResolution(
  resolution: Record<string, unknown>,
  expectedEvidenceRef?: string,
): string {
  assert.equal(resolution.schemaVersion, 1);
  assert.equal(resolution.workspaceId, workspaceId);
  assert.equal(resolution.accountRef, accountRef);
  assert.equal(resolution.threadRef, threadRef);
  assert.ok(Array.isArray(resolution.messages));
  assert.equal(resolution.messages.length, 1);
  const resolved = resolution.messages[0] as Record<string, unknown>;
  assert.equal(resolved.messageId, messageId);
  assert.equal(resolved.direction, "INBOUND");
  const exactEvidence = resolved.exactEvidence as Record<string, unknown>;
  assert.ok(exactEvidence);
  assert.equal(exactEvidence.schemaVersion, 1);
  assert.equal(exactEvidence.sha256, createHash("sha256").update(rawPayload).digest("hex"));
  assert.equal(exactEvidence.provider, provider);
  assert.equal(exactEvidence.providerMessageId, providerMessageId);
  assert.equal(exactEvidence.observedAt, observedAt);
  assert.equal(exactEvidence.sizeBytes, rawPayload.byteLength);
  assert.equal(typeof exactEvidence.evidenceRef, "string");
  if (expectedEvidenceRef) assert.equal(exactEvidence.evidenceRef, expectedEvidenceRef);
  return exactEvidence.evidenceRef as string;
}

function task(): ExpertQuestionTaskV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId: "eqt_managed_communication_bootstrap_001",
    topic: "SECTION_8_DECLARATION",
    jurisdiction: "US",
    question: "What evidence is normally accepted?",
    expertRef,
    organizationRef: "org:provider-neutral-e2e",
    requestedBy: "user:operator-e2e",
    state: "DRAFT",
    createdAt: "2026-09-01T12:58:00.000Z",
    relatedSourceRefs: ["source:uspto:section8"],
    relatedCaseRefs: ["case:managed-communication-bootstrap"],
    accessClassification: "CONFIDENTIAL",
  };
}

function seedWaitingTask(repository: SqliteExpertSourceRepository): ExpertQuestionTaskV1 {
  const initial = task();
  repository.saveTask(initial);
  repository.saveTask({ ...initial, state: "READY_TO_SEND" });
  const sent: ExpertQuestionTaskV1 = {
    ...initial,
    state: "SENT",
    communicationSendRequestRef: "commsend_provider_neutral_seed",
    communicationThreadRef: threadRef,
    sentAt: "2026-09-01T12:59:00.000Z",
  };
  repository.saveTask(sent);
  return repository.saveTask({ ...sent, state: "WAITING_RESPONSE" });
}

async function assertOutboundDisabled(): Promise<void> {
  const response = await fetch(`${coreUrl}/internal/v1/managed-communication/sends`, {
    method: "POST",
    headers: internalHeaders({
      "idempotency-key": "must-not-dispatch",
      "x-correlation-id": "knowledge-bootstrap-no-dispatch",
    }),
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 404, "provider dispatch must remain disabled in this acceptance");
}

async function seed(repository: SqliteExpertSourceRepository): Promise<void> {
  const unauthorized = await fetch(`${coreUrl}/internal/v1/managed-communication/observations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-markorbit-workspace-id": workspaceId,
      "idempotency-key": "knowledge-bootstrap-unauthorized",
    },
    body: JSON.stringify(observationBody),
  });
  assert.equal(unauthorized.status, 401);

  await assertOutboundDisabled();

  const admitted = await postObservation();
  assert.equal(admitted.observationDisposition, "ADMITTED");
  assert.equal(admitted.exactEvidenceDisposition, "ADMITTED");
  const admittedEvidence = admitted.exactEvidence as Record<string, unknown>;
  assert.equal(admittedEvidence.sha256, createHash("sha256").update(rawPayload).digest("hex"));
  const evidenceRef = admittedEvidence.evidenceRef as string;
  assert.ok(evidenceRef);

  const replayed = await postObservation();
  assert.equal(replayed.observationDisposition, "REPLAYED");
  assert.equal(replayed.exactEvidenceDisposition, "REPLAYED");
  assert.equal((replayed.exactEvidence as Record<string, unknown>).evidenceRef, evidenceRef);

  assertExactResolution(await resolveThread(), evidenceRef);

  const waiting = seedWaitingTask(repository);
  const importer = new CoreExpertReplyImporter(repository, {
    workspaceId,
    coreUrl,
    authorization,
    configJson,
    now: () => new Date("2026-09-01T13:05:00.000Z"),
  });
  const imported = await importer.importReply(waiting.taskId);
  assert.equal(imported.task.state, "RESPONSE_RECEIVED");
  assert.deepEqual(imported.sourceRecord.rawAnswerArtifactRefs, [evidenceRef]);
  assert.deepEqual(imported.sourceRecord.communication, {
    communicationThreadRef: threadRef,
    messageRefs: [messageId],
  });
  assert.equal(imported.sourceRecord.provenance.originalEvidenceAuthoritative, true);
  assert.equal(imported.sourceRecord.provenance.normalizedDerivativeIsOriginalEvidence, false);
  assert.equal(repository.listSourceRecordsForTask(waiting.taskId).length, 1);
}

async function restartReplay(repository: SqliteExpertSourceRepository): Promise<void> {
  await assertOutboundDisabled();
  const before = repository.listSourceRecordsForTask(task().taskId);
  assert.equal(before.length, 1, "seed phase must persist one Expert source record");
  const evidenceRef = before[0]?.rawAnswerArtifactRefs[0];
  assert.ok(evidenceRef);

  const replayed = await postObservation();
  assert.equal(replayed.observationDisposition, "REPLAYED");
  assert.equal(replayed.exactEvidenceDisposition, "REPLAYED");
  assert.equal((replayed.exactEvidence as Record<string, unknown>).evidenceRef, evidenceRef);
  assertExactResolution(await resolveThread(), evidenceRef);

  const importer = new CoreExpertReplyImporter(repository, {
    workspaceId,
    coreUrl,
    authorization,
    configJson,
    now: () => new Date("2026-09-01T13:06:00.000Z"),
  });
  const replay = await importer.importReply(task().taskId);
  assert.equal(replay.task.state, "RESPONSE_RECEIVED");
  assert.deepEqual(replay.sourceRecord, before[0]);
  assert.deepEqual(repository.listSourceRecordsForTask(task().taskId), before);
}

const database = new DatabaseSync(sqlitePath);
try {
  const repository = new SqliteExpertSourceRepository(database);
  if (mode === "seed") await seed(repository);
  else await restartReplay(repository);
} finally {
  database.close();
}

process.stdout.write(`Managed Communication Core bootstrap ${mode} acceptance passed.\n`);
