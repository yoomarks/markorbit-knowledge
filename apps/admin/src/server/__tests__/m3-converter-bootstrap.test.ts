import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, RegistryConflictError } from "@markorbit/persistence";
import { SqliteConverterRegistryRepository } from "@markorbit/persistence/converters";
import {
  ensureM3CanonicalDocumentAutoProfiles,
  ensureM3CanonicalDocumentConverters,
} from "../m3-converter-bootstrap";

function registry(): SqliteConverterRegistryRepository {
  return new SqliteConverterRegistryRepository(new DatabaseSync(":memory:"));
}

describe("M3 canonical converter bootstrap", () => {
  it("provisions deterministic workspace auto profiles idempotently without enabling OCR", () => {
    const converters = registry();

    ensureM3CanonicalDocumentAutoProfiles(converters, DEFAULT_WORKSPACE.id);
    ensureM3CanonicalDocumentAutoProfiles(converters, DEFAULT_WORKSPACE.id);

    const profiles = converters.listProfiles({
      workspaceId: DEFAULT_WORKSPACE.id,
      limit: 100,
    }).items;
    expect(profiles).toHaveLength(4);
    expect(
      profiles.map((profile) => ({
        name: profile.name,
        status: profile.status,
        autoConvert: profile.autoConvert,
        precedence: profile.precedence,
        sourceId: profile.sourceId,
      })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Canonical Markdown auto staging",
          status: "ACTIVE",
          autoConvert: true,
          precedence: 0,
          sourceId: undefined,
        }),
        expect.objectContaining({
          name: "Canonical HTML auto conversion",
          status: "ACTIVE",
          autoConvert: true,
          precedence: 0,
          sourceId: undefined,
        }),
        expect.objectContaining({
          name: "Canonical PDF auto conversion",
          status: "ACTIVE",
          autoConvert: true,
          precedence: 0,
          sourceId: undefined,
        }),
        expect.objectContaining({
          name: "Canonical rich document auto conversion",
          status: "ACTIVE",
          autoConvert: true,
          precedence: 0,
          sourceId: undefined,
        }),
      ]),
    );
    expect(profiles.some((profile) => profile.converter.converterId === "local-ocr-markdown")).toBe(
      false,
    );
  });

  it("treats concurrent manifest and profile bootstrap winners as idempotent success", () => {
    const converters = registry();
    const createManifest = converters.createManifest.bind(converters);
    const createProfile = converters.createProfile.bind(converters);
    let manifestRaceInjected = false;
    let profileRaceInjected = false;

    converters.createManifest = (input) => {
      if (!manifestRaceInjected && input.converterId === "builtin-markdown-staging") {
        manifestRaceInjected = true;
        createManifest(input);
        throw new RegistryConflictError(
          "CONVERTER_VERSION_EXISTS",
          "Simulated concurrent manifest winner",
        );
      }
      return createManifest(input);
    };
    converters.createProfile = (input) => {
      if (!profileRaceInjected && input.name === "Canonical Markdown auto staging") {
        profileRaceInjected = true;
        createProfile(input);
        throw new RegistryConflictError(
          "CONVERSION_PROFILE_CONFLICT",
          "Simulated concurrent profile winner",
        );
      }
      return createProfile(input);
    };

    ensureM3CanonicalDocumentAutoProfiles(converters, DEFAULT_WORKSPACE.id);

    expect(manifestRaceInjected).toBe(true);
    expect(profileRaceInjected).toBe(true);
    expect(converters.getManifest("builtin-markdown-staging", "1.0.0")).not.toBeNull();
    expect(
      converters.listProfiles({ workspaceId: DEFAULT_WORKSPACE.id, limit: 100 }).items,
    ).toHaveLength(4);
  });

  it("does not swallow profile conflicts without a durable canonical winner", () => {
    const converters = registry();
    const createProfile = converters.createProfile.bind(converters);

    converters.createProfile = (input) => {
      if (input.name === "Canonical Markdown auto staging") {
        throw new RegistryConflictError(
          "CONVERSION_PROFILE_CONFLICT",
          "Simulated unrelated profile conflict",
        );
      }
      return createProfile(input);
    };

    expect(() => ensureM3CanonicalDocumentAutoProfiles(converters, DEFAULT_WORKSPACE.id)).toThrow(
      RegistryConflictError,
    );
  });

  it("leaves operator-created profiles unchanged", () => {
    const converters = registry();
    ensureM3CanonicalDocumentConverters(converters);
    const custom = converters.createProfile({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: "Operator HTML policy",
      status: "ACTIVE",
      converter: { converterId: "builtin-html-markdown", version: "1.0.0" },
      input: { artifactKinds: ["HTML"], mimePatterns: ["text/html"] },
      outputFormat: "MARKDOWN",
      targetPathTemplate: "operator/{artifactId}.md",
      configuration: { preserveLinks: false },
      precedence: 900,
      autoConvert: true,
    });

    ensureM3CanonicalDocumentAutoProfiles(converters, DEFAULT_WORKSPACE.id);

    expect(converters.getProfile(custom.id)).toEqual(custom);
    expect(
      converters.listProfiles({ workspaceId: DEFAULT_WORKSPACE.id, limit: 100 }).items,
    ).toHaveLength(5);
  });
});
