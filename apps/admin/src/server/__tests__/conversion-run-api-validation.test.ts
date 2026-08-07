import { describe, expect, it } from "vitest";
import {
  parseCancelRequest,
  parseDispatchRequest,
  parseListFilters,
} from "../conversion-run-api-validation";

const valid = {
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  rawArtifactId: "raw_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  conversionProfileId: "cvp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  requestedOutput: { format: "MARKDOWN", targetPathTemplate: "00_Inbox/{artifactId}.md" },
  actor: { type: "ADMIN", id: "local-admin" },
  idempotencyKey: "manual-test",
};

describe("ConversionRun API validation", () => {
  it("parses valid manual dispatch and cancel inputs", () => {
    expect(parseDispatchRequest(valid).requestedOutput.format).toBe("MARKDOWN");
    expect(
      parseCancelRequest({ workspaceId: valid.workspaceId, actor: valid.actor }).actor?.id,
    ).toBe("local-admin");
  });
  it("rejects root and nested unknown fields", () => {
    expect(() => parseDispatchRequest({ ...valid, extra: true })).toThrow(/Unknown/);
    expect(() =>
      parseDispatchRequest({
        ...valid,
        requestedOutput: { ...valid.requestedOutput, extra: true },
      }),
    ).toThrow(/Unknown/);
  });
  it("rejects malformed requestedOutput and actor objects", () => {
    expect(() => parseDispatchRequest({ ...valid, requestedOutput: null })).toThrow(
      /requestedOutput/,
    );
    expect(() => parseDispatchRequest({ ...valid, requestedOutput: [] })).toThrow(
      /requestedOutput/,
    );
    expect(() =>
      parseDispatchRequest({
        ...valid,
        requestedOutput: { format: "HTML", targetPathTemplate: "x.md" },
      }),
    ).toThrow(/MARKDOWN/);
    expect(() => parseDispatchRequest({ ...valid, actor: { type: "USER", id: "x" } })).toThrow(
      /actor.type/,
    );
    expect(() => parseDispatchRequest({ ...valid, actor: [] })).toThrow(/actor/);
  });
  it("rejects forbidden secret and executable field families", () => {
    expect(() =>
      parseDispatchRequest({ ...valid, actor: { ...valid.actor, apiToken: "x" } }),
    ).toThrow(/Forbidden|Unknown/);
    expect(() =>
      parseDispatchRequest({
        ...valid,
        requestedOutput: { ...valid.requestedOutput, shellCommand: "run" },
      }),
    ).toThrow(/Forbidden|Unknown/);
  });
  it("rejects invalid list filters", () => {
    expect(parseListFilters(new URL("http://test/api/conversion-runs?status=PENDING")).status).toBe(
      "PENDING",
    );
    expect(() => parseListFilters(new URL("http://test/api/conversion-runs?unknown=1"))).toThrow(
      /Unknown/,
    );
    expect(() => parseListFilters(new URL("http://test/api/conversion-runs?limit=abc"))).toThrow(
      /integer/,
    );
  });
});
