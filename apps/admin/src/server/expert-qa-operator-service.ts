import { randomUUID } from "node:crypto";
import type { ExpertQuestionTaskV1, ExpertSourceRecordV1 } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { SqliteExpertSourceRepository } from "@markorbit/persistence/expert-sources";

export type ExpertQuestionSendReceipt = {
  communicationSendRequestRef: string;
  communicationThreadRef?: string;
  sentAt: string;
};

export type ExpertQuestionSendIntent = {
  /** Stable Knowledge intent identity. A shared Communication adapter must map retries idempotently. */
  idempotencyKey: string;
  task: ExpertQuestionTaskV1;
};

export interface ExpertQuestionSender {
  sendQuestion(intent: ExpertQuestionSendIntent): Promise<ExpertQuestionSendReceipt>;
}

export class UnavailableExpertQuestionSender implements ExpertQuestionSender {
  async sendQuestion(): Promise<ExpertQuestionSendReceipt> {
    throw new RegistryError(
      "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
      "Shared Communication Capability is not connected to the Expert operator flow. Complete K-CAP-COMM-005 before real sending.",
    );
  }
}

export type CreateExpertDraftInput = {
  topic: string;
  jurisdiction: string;
  question: string;
  expertRef: string;
  organizationRef?: string;
  requestedBy: string;
  relatedSourceRefs?: readonly string[];
  relatedCaseRefs?: readonly string[];
  accessClassification?: ExpertQuestionTaskV1["accessClassification"];
};

export type ExpertOperatorStatus =
  "DRAFT" | "READY_TO_SEND" | "WAITING" | "REPLIED" | "CAPTURED" | "CLOSED";

export type ExpertOperatorTaskView = {
  task: ExpertQuestionTaskV1;
  status: ExpertOperatorStatus;
  replies: ExpertSourceRecordV1[];
};

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function taskId(): string {
  return `eqt_${randomUUID()}`;
}

function operatorStatus(task: ExpertQuestionTaskV1): ExpertOperatorStatus {
  switch (task.state) {
    case "DRAFT":
      return "DRAFT";
    case "READY_TO_SEND":
      return "READY_TO_SEND";
    case "SENT":
    case "WAITING_RESPONSE":
      return "WAITING";
    case "RESPONSE_RECEIVED":
    case "NEEDS_FOLLOW_UP":
      return "REPLIED";
    case "CAPTURED":
      return "CAPTURED";
    case "CLOSED":
      return "CLOSED";
  }
}

function requireTask(repository: SqliteExpertSourceRepository, id: string): ExpertQuestionTaskV1 {
  const task = repository.getTask(id);
  if (!task) throw new RegistryValidationError(`Expert task ${id} was not found`);
  return task;
}

function requireReplyBinding(task: ExpertQuestionTaskV1, reply: ExpertSourceRecordV1): void {
  if (!task.communicationThreadRef) {
    throw new RegistryConflictError(
      "EXPERT_TASK_COMMUNICATION_THREAD_NOT_BOUND",
      `Expert task ${task.taskId} has no shared Communication thread identity`,
    );
  }
  if (reply.communication.communicationThreadRef !== task.communicationThreadRef) {
    throw new RegistryConflictError(
      "EXPERT_REPLY_THREAD_MISMATCH",
      `Expert reply thread does not match task ${task.taskId}`,
    );
  }
  if (reply.communication.messageRefs.length === 0) {
    throw new RegistryValidationError(
      "Expert reply must reference at least one Communication message",
    );
  }
  if (
    reply.expertRef !== task.expertRef ||
    reply.organizationRef !== task.organizationRef ||
    reply.jurisdiction !== task.jurisdiction ||
    reply.topic !== task.topic
  ) {
    throw new RegistryConflictError(
      "EXPERT_REPLY_TASK_BINDING_MISMATCH",
      `Expert reply identity or scope does not match task ${task.taskId}`,
    );
  }
}

export class ExpertQaOperatorService {
  constructor(
    private readonly repository: SqliteExpertSourceRepository,
    private readonly sender: ExpertQuestionSender = new UnavailableExpertQuestionSender(),
  ) {}

  createDraft(input: CreateExpertDraftInput, now = new Date()): ExpertQuestionTaskV1 {
    const task: ExpertQuestionTaskV1 = {
      protocolVersion: "1.0",
      objectType: "EXPERT_QUESTION_TASK",
      taskId: taskId(),
      topic: required(input.topic, "topic"),
      jurisdiction: required(input.jurisdiction, "jurisdiction"),
      question: required(input.question, "question"),
      expertRef: required(input.expertRef, "expertRef"),
      ...(input.organizationRef
        ? { organizationRef: required(input.organizationRef, "organizationRef") }
        : {}),
      requestedBy: required(input.requestedBy, "requestedBy"),
      state: "DRAFT",
      createdAt: now.toISOString(),
      relatedSourceRefs: [...(input.relatedSourceRefs ?? [])],
      relatedCaseRefs: [...(input.relatedCaseRefs ?? [])],
      accessClassification: input.accessClassification ?? "CONFIDENTIAL",
    };
    return this.repository.saveTask(task);
  }

  markReady(id: string): ExpertQuestionTaskV1 {
    const task = requireTask(this.repository, id);
    if (task.state !== "DRAFT") {
      throw new RegistryConflictError(
        "EXPERT_TASK_NOT_DRAFT",
        `Expert task ${id} must be DRAFT before it can become READY_TO_SEND`,
      );
    }
    return this.repository.saveTask({ ...task, state: "READY_TO_SEND" });
  }

  async sendReady(id: string): Promise<ExpertQuestionTaskV1> {
    const task = requireTask(this.repository, id);
    if (task.state !== "READY_TO_SEND") {
      throw new RegistryConflictError(
        "EXPERT_TASK_NOT_READY",
        `Expert task ${id} must be READY_TO_SEND before sending`,
      );
    }

    const receipt = await this.sender.sendQuestion({ idempotencyKey: task.taskId, task });
    const sendRequestRef = required(
      receipt.communicationSendRequestRef,
      "communicationSendRequestRef",
    );
    const sentAt = required(receipt.sentAt, "sentAt");
    if (Number.isNaN(Date.parse(sentAt))) {
      throw new RegistryValidationError("Communication send receipt sentAt must be a timestamp");
    }

    const sent = this.repository.saveTask({
      ...task,
      state: "SENT",
      communicationSendRequestRef: sendRequestRef,
      ...(receipt.communicationThreadRef
        ? {
            communicationThreadRef: required(
              receipt.communicationThreadRef,
              "communicationThreadRef",
            ),
          }
        : {}),
      sentAt,
    });
    return this.repository.saveTask({ ...sent, state: "WAITING_RESPONSE" });
  }

  recordReply(record: ExpertSourceRecordV1): ExpertQuestionTaskV1 {
    const task = requireTask(this.repository, record.taskId);
    if (task.state !== "WAITING_RESPONSE" && task.state !== "SENT") {
      throw new RegistryConflictError(
        "EXPERT_TASK_NOT_WAITING_FOR_REPLY",
        `Expert task ${task.taskId} is not waiting for a reply`,
      );
    }
    requireReplyBinding(task, record);
    this.repository.saveSourceRecord(record);
    return this.repository.saveTask({ ...task, state: "RESPONSE_RECEIVED" });
  }

  capture(id: string): ExpertQuestionTaskV1 {
    const task = requireTask(this.repository, id);
    if (task.state !== "RESPONSE_RECEIVED" && task.state !== "NEEDS_FOLLOW_UP") {
      throw new RegistryConflictError(
        "EXPERT_TASK_REPLY_NOT_READY_TO_CAPTURE",
        `Expert task ${id} must have a received reply before capture`,
      );
    }
    return this.repository.saveTask({ ...task, state: "CAPTURED" });
  }

  createFollowUp(
    id: string,
    question: string,
    requestedBy: string,
    now = new Date(),
  ): ExpertQuestionTaskV1 {
    const parent = requireTask(this.repository, id);
    if (parent.state !== "RESPONSE_RECEIVED") {
      throw new RegistryConflictError(
        "EXPERT_TASK_FOLLOW_UP_NOT_ALLOWED",
        `Expert task ${id} must be RESPONSE_RECEIVED before a follow-up is created`,
      );
    }

    const needsFollowUp = this.repository.saveTask({ ...parent, state: "NEEDS_FOLLOW_UP" });
    const followUp: ExpertQuestionTaskV1 = {
      protocolVersion: "1.0",
      objectType: "EXPERT_QUESTION_TASK",
      taskId: taskId(),
      topic: needsFollowUp.topic,
      jurisdiction: needsFollowUp.jurisdiction,
      question: required(question, "question"),
      expertRef: needsFollowUp.expertRef,
      ...(needsFollowUp.organizationRef ? { organizationRef: needsFollowUp.organizationRef } : {}),
      requestedBy: required(requestedBy, "requestedBy"),
      ...(needsFollowUp.communicationThreadRef
        ? { communicationThreadRef: needsFollowUp.communicationThreadRef }
        : {}),
      state: "DRAFT",
      createdAt: now.toISOString(),
      relatedSourceRefs: [...needsFollowUp.relatedSourceRefs],
      relatedCaseRefs: [...needsFollowUp.relatedCaseRefs],
      accessClassification: needsFollowUp.accessClassification,
    };
    const created = this.repository.saveTask(followUp);
    this.repository.saveTask({ ...needsFollowUp, state: "CAPTURED" });
    return created;
  }

  close(id: string, now = new Date()): ExpertQuestionTaskV1 {
    const task = requireTask(this.repository, id);
    if (task.state !== "CAPTURED") {
      throw new RegistryConflictError(
        "EXPERT_TASK_NOT_CAPTURED",
        `Expert task ${id} must be CAPTURED before closing`,
      );
    }
    return this.repository.saveTask({ ...task, state: "CLOSED", closedAt: now.toISOString() });
  }

  getView(id: string): ExpertOperatorTaskView {
    const task = requireTask(this.repository, id);
    return {
      task,
      status: operatorStatus(task),
      replies: this.repository.listSourceRecordsForTask(task.taskId),
    };
  }

  listViews(): ExpertOperatorTaskView[] {
    return this.repository.listTasks().map((task) => ({
      task,
      status: operatorStatus(task),
      replies: this.repository.listSourceRecordsForTask(task.taskId),
    }));
  }
}
