import { describe, expect, it } from "vitest";
import {
  classifyCnipaOfflineNetLogFailure,
  cnipaOfflineNetLogFailureMessage,
  parseCnipaOfflineNetLogArguments,
} from "./cnipa-offline-netlog-cli";

describe("CNIPA offline NetLog CLI", () => {
  it("accepts the documented pnpm-forwarded leading separator", () => {
    expect(
      parseCnipaOfflineNetLogArguments([
        "--",
        "--input",
        "D:\\private\\cnipa\\netlog.json",
        "--output",
        "D:\\private\\cnipa\\summary.json",
      ]),
    ).toEqual({
      inputPath: "D:\\private\\cnipa\\netlog.json",
      outputPath: "D:\\private\\cnipa\\summary.json",
    });
  });

  it("accepts direct argv without a separator", () => {
    expect(
      parseCnipaOfflineNetLogArguments([
        "--input",
        "/private/cnipa/netlog.json",
        "--output",
        "/private/cnipa/summary.json",
      ]),
    ).toEqual({
      inputPath: "/private/cnipa/netlog.json",
      outputPath: "/private/cnipa/summary.json",
    });
  });

  it("rejects a separator anywhere except the first position", () => {
    expect(() =>
      parseCnipaOfflineNetLogArguments([
        "--input",
        "/private/cnipa/netlog.json",
        "--",
        "--output",
        "/private/cnipa/summary.json",
      ]),
    ).toThrow("argument separator is allowed only as the first argument");
  });

  it("continues to reject unknown, duplicate and missing arguments", () => {
    expect(() => parseCnipaOfflineNetLogArguments(["--unknown", "value"])).toThrow(
      "Unsupported CNIPA offline NetLog argument",
    );
    expect(() =>
      parseCnipaOfflineNetLogArguments([
        "--input",
        "/a",
        "--input",
        "/b",
        "--output",
        "/c",
      ]),
    ).toThrow("--input may be specified only once");
    expect(() => parseCnipaOfflineNetLogArguments(["--input", "/a"])).toThrow(
      "requires --input and --output",
    );
  });

  it("classifies failures without exposing the underlying message", () => {
    expect(classifyCnipaOfflineNetLogFailure(new SyntaxError("SECRET_VALUE"))).toBe(
      "INVALID_JSON",
    );
    expect(
      classifyCnipaOfflineNetLogFailure(
        Object.assign(new Error("SECRET_VALUE"), { code: "ENOENT" }),
      ),
    ).toBe("INPUT_UNREADABLE");
    expect(
      classifyCnipaOfflineNetLogFailure(
        new Error("Unsupported CNIPA offline NetLog argument: --secret"),
      ),
    ).toBe("ARGUMENT_ERROR");
    expect(classifyCnipaOfflineNetLogFailure(new Error("SECRET_VALUE"))).toBe(
      "SANITIZE_FAILED",
    );

    for (const kind of [
      "ARGUMENT_ERROR",
      "INPUT_UNREADABLE",
      "INVALID_JSON",
      "SANITIZE_FAILED",
    ] as const) {
      expect(cnipaOfflineNetLogFailureMessage(kind)).not.toContain("SECRET_VALUE");
    }
  });
});
