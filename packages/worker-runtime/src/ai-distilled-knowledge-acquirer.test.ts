import { describe, expect, it } from "vitest";
import { DeepSeekKnowledgeAdapter, type AiModelTransport } from "./ai-distilled-knowledge-acquirer";
import type { AiKnowledgeAssignmentV1 } from "@markorbit/contracts";

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

function responseBody(content = "# Section 8\n\nDistilled research content."): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      id: "deepseek-request-1",
      model: "deepseek-v4-pro",
      choices: [{ message: { role: "assistant", content } }],
    }),
  );
}

describe("DeepSeekKnowledgeAdapter", () => {
  it("preserves the raw provider response and emits a Markdown artifact with provenance", async () => {
    const requests: Parameters<AiModelTransport>[0][] = [];
    const transport: AiModelTransport = async (request) => {
      requests.push(request);
      return { status: 200, body: responseBody() };
    };
    const moments = [new Date("2026-08-23T03:00:01.000Z"), new Date("2026-08-23T03:00:03.000Z")];
    const adapter = new DeepSeekKnowledgeAdapter({
      environment: { DEEPSEEK_API_KEY: "runtime-secret" },
      transport,
      now: () => moments.shift()!,
    });

    const result = await adapter.acquire({ assignment });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.deepseek.com/chat/completions");
    expect(requests[0]?.headers.authorization).toBe("Bearer runtime-secret");
    expect(requests[0]?.body).not.toContain("runtime-secret");
    expect(JSON.parse(requests[0]!.body)).toMatchObject({
      model: "deepseek-v4-pro",
      stream: false,
    });
    expect(result.submission.provider).toBe("DEEPSEEK");
    expect(result.submission.model).toBe("deepseek-v4-pro");
    expect(result.submission.providerRequestId).toBe("deepseek-request-1");
    expect(result.artifact.provenance.sourceKind).toBe("SYNTHETIC_AI");
    expect(result.artifact.provenance.legalTruthVerified).toBe(false);
    expect(result.artifact.content.mediaType).toBe("text/markdown");
    expect(result.artifact.content.content).toContain("# Section 8");
    expect(result.artifact.content.contentAddressedRef).toBe(
      `cas:sha256:${result.artifact.content.sha256}`,
    );
    expect(result.rawResponse).toEqual(responseBody());
  });

  it("fails closed when runtime credentials are absent", async () => {
    const adapter = new DeepSeekKnowledgeAdapter({ environment: {} });
    await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
      code: "AI_PROVIDER_CREDENTIAL_MISSING",
      retryable: false,
    });
  });

  it("classifies rate limits as retryable without creating an artifact", async () => {
    const adapter = new DeepSeekKnowledgeAdapter({
      environment: { DEEPSEEK_API_KEY: "runtime-secret" },
      transport: async () => ({ status: 429, body: new Uint8Array() }),
    });
    await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
      code: "AI_PROVIDER_TEMPORARY_FAILURE",
      retryable: true,
    });
  });

  it("rejects empty provider content", async () => {
    const adapter = new DeepSeekKnowledgeAdapter({
      environment: { DEEPSEEK_API_KEY: "runtime-secret" },
      transport: async () => ({ status: 200, body: responseBody("   ") }),
    });
    await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
      code: "AI_PROVIDER_CONTENT_MISSING",
      retryable: false,
    });
  });
});
