import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listAppliedMigrations, openRegistryDatabase } from "../src/index";
import {
  SqliteConverterRegistryRepository,
  ensureConverterRegistry,
} from "../src/converter-registry";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const paths: string[] = [];
afterEach(() => paths.splice(0).forEach((path) => rmSync(path, { force: true })));

describe("Converter Registry and Conversion Profiles", () => {
  it("applies migration 0008 idempotently and seeds deterministic manifests", () => {
    const database = openRegistryDatabase(":memory:");
    ensureConverterRegistry(database);
    ensureConverterRegistry(database);
    expect(listAppliedMigrations(database)).toContain("0008_converter_registry");
    const repository = new SqliteConverterRegistryRepository(database);
    expect(repository.getManifest("builtin-text-markdown", "1.0.0")?.manifest.deterministic).toBe(
      true,
    );
    expect(repository.compatible("HTML", "text/html")[0]?.manifest.converterId).toBe(
      "builtin-html-markdown",
    );
    database.close();
  });

  it("keeps manifest content immutable while allowing lifecycle changes", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteConverterRegistryRepository(database);
    const created = repository.createManifest({
      converterId: "custom-html-markdown",
      displayName: "Custom HTML to Markdown",
      version: "1.0.0",
      runtime: "LOCAL_PROCESS",
      capabilities: ["CONVERT", "PRESERVE_LINKS"],
      inputs: { artifactKinds: ["HTML"], mimePatterns: ["text/html"] },
      outputFormat: "MARKDOWN",
      deterministic: true,
      configurationSchema: {
        type: "object",
        properties: { preserveLinks: { type: "boolean" } },
        additionalProperties: false,
      },
      resourceHints: { maxInputBytes: 1048576, timeoutSeconds: 30 },
      status: "ACTIVE",
    });
    expect(created.manifest.converterId).toBe("custom-html-markdown");
    expect(repository.listVersions("custom-html-markdown")).toHaveLength(1);
    expect(() =>
      repository.createManifest({
        ...created.manifest,
        protocolVersion: undefined,
        objectType: undefined,
      } as unknown as Parameters<typeof repository.createManifest>[0]),
    ).toThrow(/Unknown Converter Manifest fields/);
    expect(() =>
      repository.createManifest({
        converterId: "custom-html-markdown",
        displayName: "Duplicate",
        version: "1.0.0",
        runtime: "LOCAL_PROCESS",
        capabilities: ["CONVERT"],
        inputs: { artifactKinds: ["HTML"], mimePatterns: ["text/html"] },
        outputFormat: "MARKDOWN",
        deterministic: true,
        configurationSchema: { type: "object", properties: {}, additionalProperties: false },
        resourceHints: { maxInputBytes: 1048576, timeoutSeconds: 30 },
        status: "ACTIVE",
      }),
    ).toThrow(/already exists/);
    const disabled = repository.updateManifestStatus("builtin-text-markdown", "1.0.0", "DISABLED");
    expect(disabled.manifest.status).toBe("DISABLED");
    expect(disabled.manifest.inputs.artifactKinds).toEqual(["TEXT"]);
    database.close();
  });

  it("enforces compatibility, lifecycle and optimistic concurrency", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteConverterRegistryRepository(
      database,
      () => new Date("2026-07-16T21:00:00Z"),
    );
    const profile = repository.createProfile({
      workspaceId,
      name: "HTML staging",
      converter: { converterId: "builtin-html-markdown", version: "1.0.0" },
      input: { artifactKinds: ["HTML"], mimePatterns: ["text/html"] },
      outputFormat: "MARKDOWN",
      targetPathTemplate: "00_Inbox/{sourceSlug}/{artifactId}.md",
      configuration: { preserveLinks: true },
      precedence: 100,
      autoConvert: false,
    });
    expect(profile.status).toBe("PAUSED");
    const active = repository.updateProfileStatus(profile.id, "ACTIVE", profile.updatedAt);
    expect(active.status).toBe("ACTIVE");
    expect(() =>
      repository.updateProfile(profile.id, { expectedUpdatedAt: profile.updatedAt, name: "stale" }),
    ).toThrow();
    const archived = repository.updateProfileStatus(active.id, "ARCHIVED", active.updatedAt);
    expect(() =>
      repository.updateProfileStatus(archived.id, "ACTIVE", archived.updatedAt),
    ).toThrow();
    database.close();
  });

  it("rejects unknown profile fields instead of silently discarding them", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteConverterRegistryRepository(database);
    expect(() =>
      repository.createProfile({
        workspaceId,
        name: "unknown field",
        converter: { converterId: "builtin-text-markdown", version: "1.0.0" },
        input: { artifactKinds: ["TEXT"], mimePatterns: ["text/plain"] },
        outputFormat: "MARKDOWN",
        targetPathTemplate: "00_Inbox/{artifactId}.md",
        configuration: {},
        precedence: 1,
        autoConvert: false,
        executable: "/bin/tool",
      } as unknown as Parameters<typeof repository.createProfile>[0]),
    ).toThrow(/Unknown Conversion Profile fields/);
    database.close();
  });

  it("rejects command/secret configuration and incompatible inputs", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteConverterRegistryRepository(database);
    expect(() =>
      repository.createProfile({
        workspaceId,
        name: "bad config",
        converter: { converterId: "builtin-html-markdown", version: "1.0.0" },
        input: { artifactKinds: ["HTML"], mimePatterns: ["text/html"] },
        outputFormat: "MARKDOWN",
        targetPathTemplate: "00_Inbox/{artifactId}.md",
        configuration: { shellCommand: "run" },
        precedence: 1,
        autoConvert: false,
      }),
    ).toThrow();
    expect(() =>
      repository.createProfile({
        workspaceId,
        name: "wrong type",
        converter: { converterId: "builtin-html-markdown", version: "1.0.0" },
        input: { artifactKinds: ["PDF"], mimePatterns: ["application/pdf"] },
        outputFormat: "MARKDOWN",
        targetPathTemplate: "00_Inbox/{artifactId}.md",
        configuration: {},
        precedence: 1,
        autoConvert: false,
      }),
    ).toThrow();
    database.close();
  });

  it("persists profiles across a database restart", () => {
    const path = join(tmpdir(), `markorbit-converters-${Date.now()}.sqlite`);
    paths.push(path);
    let database = openRegistryDatabase(path);
    let repository = new SqliteConverterRegistryRepository(database);
    const profile = repository.createProfile({
      workspaceId,
      name: "persisted",
      converter: { converterId: "builtin-text-markdown", version: "1.0.0" },
      input: { artifactKinds: ["TEXT"], mimePatterns: ["text/plain"] },
      outputFormat: "MARKDOWN",
      targetPathTemplate: "00_Inbox/{artifactId}.md",
      configuration: {},
      precedence: 1,
      autoConvert: false,
    });
    database.close();
    database = openRegistryDatabase(path);
    repository = new SqliteConverterRegistryRepository(database);
    expect(repository.getProfile(profile.id)?.name).toBe("persisted");
    database.close();
  });
});
