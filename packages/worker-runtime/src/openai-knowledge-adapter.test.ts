import { describe, expect, it } from "vitest";
import type { AiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import type { AiModelTransport } from "./ai-distilled-knowledge-acquirer";
import { OpenAiKnowledgeAdapter } from "./openai-knowledge-adapter";

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

function responseBody(content = "# Section 8\n\nDistilled OpenAI research content."): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      id: "resp_openai_1",
      model: "gpt-5.6-luna",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: content }],
        },
      ],
    }),
  );
}

describe("OpenAiKnowledgeAdapter", () => {
  it("uses the canonical Responses endpoint without persisting the credential", async () => {
    const requests: Parameters<AiModelTransport>[0][] = [];
    const transport: AiModelTransport = async (request) => {
      requests.push(request);
      return { status: 200, body: responseBody() };
    };
    const moments = [new Date("2026-08-23T03:00:01.000Z"), new Date("2026-08-23T03:00:03.000Z")];
    const adapter = new OpenAiKnowledgeAdapter({
      environment: { OPENAI_API_KEY: "runtime-openai-secret" },
      transport,
      now: () => moments.shift()!,
    });

    const result = await adapter.acquire({ assignment });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(requests[0]?.headers.authorization).toBe("Bearer runtime-openai-secret");
    expect(requests[0]?.body).not.toContain("runtime-openai-secret");
    expect(JSON.parse(requests[0]!.body)).toMatchObject({
      model: "gpt-5.6-luna",
      input: assignment.prompt,
    });
    expect(result.submission.provider).toBe("OPENAI");
    expect(result.submission.providerRequestId).toBe("resp_openai_1");
    expect(result.artifact.provenance.sourceKind).toBe("SYNTHETIC_AI");
    expect(result.artifact.provenance.legalTruthVerified).toBe(false);
    expect(result.artifact.content.content).toContain("# Section 8");
    expect(result.rawResponse).toEqual(responseBody());
  });

  it("fails closed when OPENAI_API_KEY is absent", async () => {
    const adapter = new OpenAiKnowledgeAdapter({ environment: {} });
    await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
      code: "AI_PROVIDER_CREDENTIAL_MISSING",
      retryable: false,
    });
  });

  it("classifies rate limits and server errors as retryable", async () => {
    for (const status of [429, 500]) {
      const adapter = new OpenAiKnowledgeAdapter({
        environment: { OPENAI_API_KEY: "runtime-openai-secret" },
        transport: async () => ({ status, body: new Uint8Array() }),
      });
      await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
        code: "AI_PROVIDER_TEMPORARY_FAILURE",
        retryable: true,
      });
    }
  });

  it("rejects a response without output_text content", async () => {
    const adapter = new OpenAiKnowledgeAdapter({
      environment: { OPENAI_API_KEY: "runtime-openai-secret" },
      transport: async () => ({
        status: 200,
        body: new TextEncoder().encode(
          JSON.stringify({ id: "resp_empty", model: "gpt-5.6-luna", output: [] }),
        ),
      }),
    });
    await expect(adapter.acquire({ assignment })).rejects.toMatchObject({
      code: "AI_PROVIDER_CONTENT_MISSING",
      retryable: false,
    });
  });

  it("rejects non-canonical endpoint overrides", () => {
    expect(
      () => new OpenAiKnowledgeAdapter({ endpoint: "https://example.com/v1/responses" }),
    ).toThrowError("OpenAI production adapter only permits the canonical HTTPS Responses endpoint");
  });
});
