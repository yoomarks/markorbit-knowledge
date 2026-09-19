import { describe, expect, it } from "vitest";

import { FactAdmissionHttpError, HttpFactAdmissionClient } from "./fact-admission-http-client";

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpFactAdmissionClient", () => {
  it("posts canonical fact-admission JSON with bearer authorization", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(200, { outcome: "CHUNK_ADMITTED", replayed: false });
    }) as typeof fetch;

    const client = new HttpFactAdmissionClient(
      "https://data.example.test/",
      "runtime-secret",
      fetcher,
    );
    const receipt = await client.post("/api/admin/v2/fact-admissions/cn/trademark-gazette/chunks", {
      hello: "world",
    });

    expect(receipt).toEqual({ outcome: "CHUNK_ADMITTED", replayed: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://data.example.test/api/admin/v2/fact-admissions/cn/trademark-gazette/chunks",
    );
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toEqual({
      authorization: "Bearer runtime-secret",
      "content-type": "application/json",
    });
    expect(calls[0]!.init.body).toBe('{"hello":"world"}');
  });

  it("refuses paths outside the governed fact-admission surface", async () => {
    const client = new HttpFactAdmissionClient("https://data.example.test", "secret", (async () =>
      jsonResponse(200, {})) as typeof fetch);

    await expect(client.post("/api/v1/write", {})).rejects.toThrow(
      /must stay under \/api\/admin\/v2\/fact-admissions\//,
    );
    await expect(
      client.post("/api/admin/v2/fact-admissions/cn/x?token=secret", {}),
    ).rejects.toThrow(/relative canonical path/);
  });

  it("retries bounded retryable HTTP failures and honors server error semantics", async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    const fetcher = (async () => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse(503, {
          detail: {
            code: "DATA_ENGINE_FACT_ADMISSION_UNAVAILABLE",
            message: "clickhouse unavailable",
            retryable: true,
          },
        });
      }
      return jsonResponse(200, { outcome: "ADMITTED" });
    }) as typeof fetch;

    const client = new HttpFactAdmissionClient("https://data.example.test", "secret", fetcher, {
      maxAttempts: 3,
      baseDelayMs: 7,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    await expect(
      client.post("/api/admin/v2/fact-admissions/cn/trademark-gazette/finalize", {}),
    ).resolves.toEqual({ outcome: "ADMITTED" });
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([7]);
  });

  it("does not retry rejected contracts or authorization failures", async () => {
    for (const scenario of [
      {
        status: 400,
        body: {
          detail: {
            code: "DATA_ENGINE_FACT_ADMISSION_REJECTED",
            message: "bad package",
            retryable: false,
          },
        },
        expectedCode: "DATA_ENGINE_FACT_ADMISSION_REJECTED",
      },
      {
        status: 401,
        body: { detail: "Unauthorized" },
        expectedCode: "FACT_ADMISSION_AUTH_REJECTED",
      },
    ]) {
      let attempts = 0;
      const client = new HttpFactAdmissionClient(
        "https://data.example.test",
        "secret",
        (async () => {
          attempts += 1;
          return jsonResponse(scenario.status, scenario.body);
        }) as typeof fetch,
        { maxAttempts: 3, baseDelayMs: 0 },
      );

      try {
        await client.post("/api/admin/v2/fact-admissions/cn/trademark-gazette/chunks", {});
        throw new Error("expected FactAdmissionHttpError");
      } catch (error) {
        expect(error).toBeInstanceOf(FactAdmissionHttpError);
        expect((error as FactAdmissionHttpError).status).toBe(scenario.status);
        expect((error as FactAdmissionHttpError).code).toBe(scenario.expectedCode);
        expect((error as FactAdmissionHttpError).retryable).toBe(false);
      }
      expect(attempts).toBe(1);
    }
  });

  it("retries transport failures without leaking credentials into errors", async () => {
    let attempts = 0;
    const client = new HttpFactAdmissionClient(
      "https://data.example.test",
      "super-secret-token",
      (async () => {
        attempts += 1;
        throw new Error("connection reset");
      }) as typeof fetch,
      { maxAttempts: 2, baseDelayMs: 0 },
    );

    try {
      await client.post("/api/admin/v2/fact-admissions/cn/trademark-gazette/chunks", {});
      throw new Error("expected transport failure");
    } catch (error) {
      expect(error).toBeInstanceOf(FactAdmissionHttpError);
      expect((error as FactAdmissionHttpError).code).toBe("FACT_ADMISSION_TRANSPORT_FAILED");
      expect((error as FactAdmissionHttpError).retryable).toBe(true);
      expect((error as Error).message).not.toContain("super-secret-token");
    }
    expect(attempts).toBe(2);
  });

  it("rejects malformed successful responses", async () => {
    const client = new HttpFactAdmissionClient("https://data.example.test", "secret", (async () =>
      jsonResponse(200, ["not", "an", "object"])) as typeof fetch);

    await expect(
      client.post("/api/admin/v2/fact-admissions/cn/trademark-gazette/chunks", {}),
    ).rejects.toMatchObject({
      code: "FACT_ADMISSION_RESPONSE_INVALID",
      retryable: false,
    });
  });
});
