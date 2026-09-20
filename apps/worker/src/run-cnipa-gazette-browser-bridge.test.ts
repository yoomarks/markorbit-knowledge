import { describe, expect, it } from "vitest";
import { parseCnipaGazetteBrowserBridgeArguments } from "./run-cnipa-gazette-browser-bridge";

describe("CNIPA Gazette browser bridge CLI", () => {
  it("requires an exact Job and extension origin while allowing an ephemeral port", () => {
    expect(
      parseCnipaGazetteBrowserBridgeArguments([
        "--",
        "--job",
        "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "--extension-origin",
        "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ]),
    ).toEqual({
      jobId: "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      extensionOrigin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      port: 0,
    });
  });

  it("parses an explicit loopback port and optional stable bridge token", () => {
    const parsed = parseCnipaGazetteBrowserBridgeArguments([
      "--job",
      "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "--extension-origin",
      "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--port",
      "39123",
      "--bridge-token",
      "t".repeat(48),
    ]);
    expect(parsed.port).toBe(39123);
    expect(parsed.bridgeToken).toBe("t".repeat(48));
  });

  it("fails closed on missing or unsupported CLI scope", () => {
    expect(() =>
      parseCnipaGazetteBrowserBridgeArguments([
        "--extension-origin",
        "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ]),
    ).toThrow(/--job is required/);
    expect(() =>
      parseCnipaGazetteBrowserBridgeArguments([
        "--job",
        "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "--extension-origin",
        "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "--issue",
        "75",
      ]),
    ).toThrow(/Unknown/);
  });
});
