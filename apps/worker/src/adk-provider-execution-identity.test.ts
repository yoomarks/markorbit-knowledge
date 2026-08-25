import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  AiKnowledgeAcquisition,
  AiKnowledgeProviderAdapter,
} from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import type { AiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import { MemoryAiKnowledgeJobStore } from "./adk-knowledge-job-queue-store";
import { enqueueAdkKnowledgeJobs, processNextAdkKnowledgeJob } from "./adk-knowledge-job-worker";

const assignment: AiKnowledgeAssignmentV1 = {
  protocolVersion: "1.0",
  objectType: "AI_KNOWLEDGE_ASSIGNMENT",
  assignmentId: "assignment-managed-ai-identity",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "DECLARATION_OF_USE",
  title: "Managed AI execution identity",
  instructionSetId: "kis_trademark_procedure",
  instructionSetRevision: 1,
  language: "zh-CN",
  prompt: "Return a source-oriented Markdown memo.",
  createdAt: "2026-08-25T10:20:00.000Z",
};

function acquisition(): AiKnowledgeAcquisition {
  const rawResponse = new TextEncoder().encode('{"fixture":true}');
  const rawResponseSha256 = createHash("sha256").update(rawResponse).digest("hex");
  const markdown = "# Managed AI\n\nExecution identity fixture.";
  const markdownBytes = Buffer.from(markdown, "utf8");
  const markdownSha256 = createHash("sha256").update(markdownBytes).digest("hex");
  const promptSha256 = createHash("sha256").update(assignment.prompt).digest("hex");
  return {
    assignment,
    submission: {
      protocolVersion: "1.0",
      objectType: "AI_RESEARCH_SUBMISSION",
      submissionId: "ars_managed_ai_execution_identity",
      assignmentId: assignment.assignmentId,
      provider: "OPENAI",
      model: "fixture-model",
      requestedAt: "2026-08-25T10:20:01.000Z",
      completedAt: "2026-08-25T10:20:02.000Z",
      promptSha256,
      rawResponseSha256,
      markdownSha256,
      markdownSizeBytes: markdownBytes.byteLength,
      providerRequestId: "fixture-provider-request",
    },
    artifact: {
      protocolVersion: "1.0",
      objectType: "AI_DISTILLED_KNOWLEDGE_ARTIFACT",
      artifactId: "adk_managed_ai_execution_identity",
      assignmentId: assignment.assignmentId,
      submissionId: "ars_managed_ai_execution_identity",
      provider: "OPENAI",
      model: "fixture-model",
      instructionSetId: assignment.instructionSetId,
      instructionSetRevision: assignment.instructionSetRevision,
      provenance: {
        sourceKind: "SYNTHETIC_AI",
        legalTruthVerified: false,
        rawResponseSha256,
        promptSha256,
      },
      content: {
        mediaType: "text/markdown",
        encoding: "utf-8",
        sha256: markdownSha256,
        sizeBytes: markdownBytes.byteLength,
        contentAddressedRef: `cas:sha256:${markdownSha256}`,
        content: markdown,
      },
      createdAt: "2026-08-25T10:20:02.000Z",
    },
    rawResponse,
  };
}

describe("ADK provider execution identity", () => {
  it("passes the durable queue executionKey to the provider adapter unchanged", async () => {
    const store = new MemoryAiKnowledgeJobStore();
    const queued = enqueueAdkKnowledgeJobs({
      store,
      assignmentIds: [assignment.assignmentId],
      providers: ["OPENAI"],
      executionScope: "pilot:managed-ai-http",
      now: () => new Date("2026-08-25T10:20:00.000Z"),
    })[0];
    let capturedExecutionKey: string | undefined;
    const adapter: AiKnowledgeProviderAdapter = {
      provider: "OPENAI",
      acquire: (request) => {
        capturedExecutionKey = request.executionKey;
        return Promise.resolve(acquisition());
      },
    };

    const result = await processNextAdkKnowledgeJob({
      store,
      assignments: { getAssignment: () => assignment },
      adapters: new Map([["OPENAI", adapter]]),
      sink: () =>
        Promise.resolve({
          rawProviderArtifactId: "raw-provider-managed-ai-identity",
          markdownRawArtifactId: "raw-markdown-managed-ai-identity",
        }),
    });

    expect(result?.status).toBe("SUCCEEDED");
    expect(capturedExecutionKey).toBe(queued?.executionKey);
    expect(capturedExecutionKey).toBe(
      "assignment-managed-ai-identity:OPENAI:pilot:managed-ai-http",
    );
  });
});
