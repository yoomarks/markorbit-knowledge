import { describe, expect, it } from "vitest";
import {
  converterAccepts,
  hasForbiddenConversionConfiguration,
  isConversionProfile,
  isConverterManifest,
  mimePatternMatches,
  type ConversionProfile,
  type ConverterManifest,
} from "../src/conversion-control-v1";

const manifest: ConverterManifest = {
  protocolVersion: "1.0",
  objectType: "CONVERTER_MANIFEST",
  converterId: "builtin-html-markdown",
  displayName: "Built-in HTML to Markdown",
  version: "1.0.0",
  runtime: "BUILT_IN",
  capabilities: ["CONVERT", "PRESERVE_LINKS"],
  inputs: { artifactKinds: ["HTML"], mimePatterns: ["text/html", "application/xhtml+xml"] },
  outputFormat: "MARKDOWN",
  deterministic: true,
  configurationSchema: {
    type: "object",
    properties: { preserveLinks: { type: "boolean" } },
    additionalProperties: false,
  },
  resourceHints: { maxInputBytes: 10485760, timeoutSeconds: 30 },
  status: "ACTIVE",
};

const profile: ConversionProfile = {
  protocolVersion: "1.0",
  objectType: "CONVERSION_PROFILE",
  id: "cvp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  name: "Official HTML staging",
  status: "ACTIVE",
  converter: { converterId: manifest.converterId, version: manifest.version },
  input: { artifactKinds: ["HTML"], mimePatterns: ["text/html"] },
  outputFormat: "MARKDOWN",
  targetPathTemplate: "00_Inbox/{sourceSlug}/{artifactId}.md",
  configuration: { preserveLinks: true },
  precedence: 100,
  autoConvert: false,
  createdAt: "2026-07-16T21:00:00Z",
  updatedAt: "2026-07-16T21:00:00Z",
};

describe("Conversion Control Protocol v1", () => {
  it("accepts strict converter and profile objects", () => {
    expect(isConverterManifest(manifest)).toBe(true);
    expect(isConversionProfile(profile)).toBe(true);
    expect(converterAccepts(manifest, "HTML", "text/html")).toBe(true);
    expect(mimePatternMatches("text/*", "text/plain")).toBe(true);
  });

  it("rejects unknown fields, commands, secrets and unsafe paths", () => {
    expect(isConverterManifest({ ...manifest, executable: "/bin/tool" })).toBe(false);
    expect(
      isConverterManifest({
        ...manifest,
        configurationSchema: { properties: { apiToken: { type: "string" } } },
      }),
    ).toBe(false);
    expect(isConversionProfile({ ...profile, configuration: { shellCommand: "rm -rf /" } })).toBe(
      false,
    );
    expect(isConversionProfile({ ...profile, targetPathTemplate: "../../escape.md" })).toBe(false);
    expect(hasForbiddenConversionConfiguration({ nested: { password: "x" } })).toBe(
      "configuration.nested.password",
    );
  });

  it("requires archivedAt exactly for archived profiles", () => {
    expect(isConversionProfile({ ...profile, status: "ARCHIVED" })).toBe(false);
    expect(isConversionProfile({ ...profile, archivedAt: "2026-07-16T21:00:00Z" })).toBe(false);
    expect(
      isConversionProfile({ ...profile, status: "ARCHIVED", archivedAt: "2026-07-16T21:00:00Z" }),
    ).toBe(true);
  });
});
