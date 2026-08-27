import { describe, expect, it, vi } from "vitest";
import type { ExpertQuestionTaskV1 } from "@markorbit/contracts";
import { CoreExpertQuestionSender } from "./expert-communication-bridge";

const workspaceId = "ws_expert_001";
const secret = "0123456789abcdef0123456789abcdef";
const expertRef = "expert:us:outside-counsel-001";
const configJson = JSON.stringify({
  workspaces: {
    [workspaceId]: {
      accountRef: "comm-account:expert-ops",
      sender: { address: "knowledge@example.test" },
      recipients: { [expertRef]: { address: "counsel@example.test" } },
    },
  },
});

function task(overrides: Partial<ExpertQuestionTaskV1> = {}): ExpertQuestionTaskV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId: "eqt_bridge_001",
    topic: "SECTION_8_DECLARATION",
    jurisdiction: "US",
    question: "Which evidence is normally accepted?",
    expertRef,
    requestedBy: "user:operator-001",
    state: "READY_TO_SEND",
    createdAt: "2026-08-27T01:00:00.000Z",
    relatedSourceRefs: [],
    relatedCaseRefs: [],
    accessClassification: "CONFIDENTIAL",
    ...overrides,
  };
}

function receipt() {
  return {
    schemaVersion: 1,
    sendId: "commsend_0123456789abcdef0123456789abcdef",
    workspaceId,
    accountRef: "comm-account:expert-ops",
    state: "SENT",
    messageId: "commmsg_0123456789abcdef0123456789abcdef",
    threadRef: "commthread_0123456789abcdef0123456789abcdef",
    acceptedAt: "2026-08-27T02:00:00.000Z",
  };
}

describe("CoreExpertQuestionSender", () => {
  it("uses stable Core send identity and persists the durable receipt fields", async () => {
    let init: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_input: string | URL | Request, value?: RequestInit) => {
      init = value;
      return new Response(JSON.stringify(receipt()), { status: 200 });
    }) as unknown as typeof fetch;
    const sender = new CoreExpertQuestionSender({
      workspaceId,
      coreUrl: "https://core.example.test",
      internalSecret: secret,
      configJson,
      fetchImpl,
    });

    const result = await sender.sendQuestion({ idempotencyKey: "eqt_bridge_001", task: task() });

    expect(result).toEqual({
      communicationSendRequestRef: receipt().sendId,
      communicationThreadRef: receipt().threadRef,
      sentAt: receipt().acceptedAt,
    });
    const headers = init?.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBe("eqt_bridge_001");
    expect(headers["x-correlation-id"]).toBe("knowledge-expert:eqt_bridge_001");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.participants).toEqual([
      { role: "SENDER", address: "knowledge@example.test" },
      { role: "TO", address: "counsel@example.test" },
    ]);
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("fails closed when Core requires delivery reconciliation", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "RECONCILIATION_REQUIRED" }), { status: 409 }),
    ) as unknown as typeof fetch;
    const sender = new CoreExpertQuestionSender({
      workspaceId,
      coreUrl: "https://core.example.test",
      internalSecret: secret,
      configJson,
      fetchImpl,
    });

    await expect(
      sender.sendQuestion({ idempotencyKey: "eqt_bridge_001", task: task() }),
    ).rejects.toThrow(/Automatic resend is blocked/u);
  });

  it("passes an existing durable thread identity for follow-up sends", async () => {
    let body: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify(receipt()), { status: 200 });
    }) as unknown as typeof fetch;
    const sender = new CoreExpertQuestionSender({
      workspaceId,
      coreUrl: "https://core.example.test",
      internalSecret: secret,
      configJson,
      fetchImpl,
    });

    await sender.sendQuestion({
      idempotencyKey: "eqt_bridge_002",
      task: task({
        taskId: "eqt_bridge_002",
        communicationThreadRef: receipt().threadRef,
      }),
    });

    expect(body?.replyToThreadRef).toBe(receipt().threadRef);
  });
});
