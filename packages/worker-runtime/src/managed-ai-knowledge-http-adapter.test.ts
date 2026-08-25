import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import type { ManagedAiKnowledgeAuthorityV1 } from "./managed-ai-knowledge-adapter";
import {
  ManagedAiHttpDeepSeekKnowledgeAdapter,
  managedAiKnowledgeHttpExecutionContext,
} from "./managed-ai-knowledge-http-adapter";
import type { ManagedAiHttpTransportRequest } from "./managed-ai-execution-http-client";

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "kas_us_trademark_section8",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "DECLARATION_OF_USE",
  title: "United States Trademark Declaration of Use",
  instructionSetId: "kis_trademark_procedure",
  instructionSetRevision: 1,
  language: "zh-CN",
  prompt: "Write a comprehensive Markdown research memo about U.S. trademark declarations of use.",
  createdAt: "2026-08-23T03:00:00.000Z",
};

const secret = "knowledge-core-internal-secret-1234567890";
const markdown = "# Section 8\n\nManaged AI research content.";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function noAuthority(): ManagedAiKnowledgeAuthorityV1 {
  return {
    canonicalTruthCreated: false,
    capabilityCanonMutated: false,
    knowledgeApproved: false,
    brainConclusionCreated: false,
    professionalDecisionCreated: false,
    paymentCreated: false,
    filingSubmitted: false,
    externalMessageSent: false,
    externalProfessionalActionExecuted: false,
  };
}

describe("ManagedAiHttpDeepSeekKnowledgeAdapter", () => {
  it("derives stable claim identity from the frozen Knowledge assignment and changes it with assignment revision", () => {
    const first = managedAiKnowledgeHttpExecutionContext({ assignment });
    const replay = managedAiKnowledgeHttpExecutionContext({ assignment });
    const revised = managedAiKnowledgeHttpExecutionContext({
      assignment: { ...assignment, instructionSetRevision: 2 },
    });

    expect(replay).toEqual(first);
    expect(revised.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(first.idempotencyKey).toMatch(/^knowledge-adk:[a-f0-9]{64}$/u);
    expect(first.correlationId).toMatch(/^knowledge-adk:[a-f0-9]{32}$/u);
  });

  it("executes through Core HTTP and preserves Knowledge-owned acquisition evidence", async () => {
    const rawResponse = new TextEncoder().encode(
      JSON.stringify({
        id: "deepseek-request-1",
        model: "deepseek-v4-flash",
        choices: [{ message: { role: "assistant", content: markdown } }],
      }),
    );
    const execution = managedAiKnowledgeHttpExecutionContext({ assignment });
    let captured: ManagedAiHttpTransportRequest | undefined;
    const adapter = new ManagedAiHttpDeepSeekKnowledgeAdapter({
      baseUrl: "http://127.0.0.1:4105",
      internalServiceSecret: secret,
      transport: (request) => {
        captured = request;
        const outcome = {
          schemaVersion: 1,
          capabilityId: "managed-ai-execution",
          capabilityVersion: "1.0.0",
          status: "COMPLETED",
          deliveryState: "PROVIDER_COMPLETED",
          retryDisposition: "RETRY_FORBIDDEN",
          provenance: {
            implementationProfileId: "managed-ai:knowledge-deepseek:v1",
            implementationProfileVersion: 1,
            implementationKey: "ai:deepseek:chat-completions:v1",
            provider: "DEEPSEEK",
            model: "deepseek-v4-flash",
            promptPolicyId: "knowledge.ai-distillation",
            promptPolicyVersion: "1",
            outputSchemaId: "knowledge.ai-distilled-markdown.v1",
            inputSha256: "a".repeat(64),
            providerRequestId: "deepseek-request-1",
            startedAt: "2026-08-23T03:00:01.000Z",
            completedAt: "2026-08-23T03:00:03.000Z",
          },
          exactOutput: {
            kind: "INLINE_BASE64",
            mediaType: "application/json",
            sha256: sha256(rawResponse),
            sizeBytes: rawResponse.byteLength,
            dataBase64: Buffer.from(rawResponse).toString("base64"),
          },
          structuredOutput: { text: markdown, outputFormat: "MARKDOWN" },
          authority: noAuthority(),
        };
        return Promise.resolve({
          status: 200,
          body: new TextEncoder().encode(JSON.stringify(outcome)),
        });
      },
    });

    const acquisition = await adapter.acquire({ assignment });

    expect(captured?.headers["idempotency-key"]).toBe(execution.idempotencyKey);
    expect(captured?.headers["x-correlation-id"]).toBe(execution.correlationId);
    expect(acquisition.assignment).toEqual(assignment);
    expect(acquisition.rawResponse).toEqual(rawResponse);
    expect(acquisition.submission.provider).toBe("DEEPSEEK");
    expect(acquisition.submission.providerRequestId).toBe("deepseek-request-1");
    expect(acquisition.artifact.content.content).toBe(markdown);
    expect(acquisition.artifact.provenance.legalTruthVerified).toBe(false);
  });
});
