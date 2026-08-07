import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { isConnectorManifest } from "@markorbit/contracts";
import {
  ConnectorNotFoundError,
  SqliteConnectorRepository,
  type CreateConnectorManifestInput,
} from "../src/connector-registry";
import {
  DEFAULT_CONNECTOR_MANIFEST,
  RegistryConflictError,
  RegistryValidationError,
  SqliteSourceRepository,
  openRegistryDatabase,
  type CreateSourceInput,
} from "../src/index";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { force: true });
});

function connectorInput(
  overrides: Partial<CreateConnectorManifestInput> = {},
): CreateConnectorManifestInput {
  return {
    connectorId: "json-api",
    displayName: "JSON API Connector",
    version: "1.0.0",
    sourceTypes: ["API"],
    runtime: "NODE",
    capabilities: ["TEST_CONNECTION", "PREVIEW", "COLLECT", "CHECK_UPDATE"],
    supportedJobTypes: ["API_COLLECTION"],
    configurationSchema: {
      type: "object",
      properties: {
        baseUrl: { type: "string", format: "uri" },
      },
      required: ["baseUrl"],
    },
    secretSchema: {
      type: "object",
      properties: {
        bearerToken: { type: "string" },
      },
    },
    outputArtifactKinds: ["JSON"],
    healthCheck: {
      mode: "DECLARATIVE_ENDPOINT",
      timeoutSeconds: 15,
    },
    status: "ACTIVE",
    ...overrides,
  };
}

function apiSourceInput(): CreateSourceInput {
  return {
    name: "Trademark API",
    slug: "trademark-api",
    sourceType: "API",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: {
      connectorId: "json-api",
      version: "1.0.0",
    },
    connectorConfig: {
      baseUrl: "https://example.com/api",
    },
    entrypoints: [{ uri: "https://example.com/api" }],
    tags: ["api"],
  };
}

describe("SQLite Connector Registry", () => {
  it("bootstraps the locked Crawl4AI manifest", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteConnectorRepository(database);
    const record = repository.get("crawl4ai-web", "1.0.0");
    expect(record?.manifest).toEqual(DEFAULT_CONNECTOR_MANIFEST);
    expect(isConnectorManifest(record?.manifest)).toBe(true);
    expect(record?.runtimeHealth).toBe("NOT_EVALUATED");
    database.close();
  });

  it("creates, reads, lists, versions and changes lifecycle status", () => {
    const database = new DatabaseSync(":memory:");
    let tick = 0;
    const repository = new SqliteConnectorRepository(
      database,
      () => new Date(Date.UTC(2026, 6, 15, 19, 0, tick++)),
    );

    const created = repository.create(connectorInput());
    expect(isConnectorManifest(created.manifest)).toBe(true);
    expect(repository.get("json-api", "1.0.0")?.manifest).toEqual(created.manifest);

    repository.create(connectorInput({ version: "1.1.0", capabilities: ["COLLECT"] }));
    expect(repository.listVersions("json-api")).toHaveLength(2);
    expect(repository.list({ runtime: "NODE", sourceType: "API" }).total).toBe(2);

    const deprecated = repository.updateStatus("json-api", "1.0.0", "DEPRECATED");
    expect(deprecated.manifest.status).toBe("DEPRECATED");
    expect(deprecated.manifest.capabilities).toEqual(created.manifest.capabilities);
    database.close();
  });

  it("rejects duplicate immutable connector versions", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteConnectorRepository(database);
    repository.create(connectorInput());
    expect(() =>
      repository.create(connectorInput({ displayName: "Changed same version" })),
    ).toThrowError(RegistryConflictError);
    database.close();
  });

  it("filters by capability, job type and output kind", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteConnectorRepository(database);
    repository.create(connectorInput());

    expect(repository.list({ capability: "COLLECT" }).total).toBe(2);
    expect(repository.list({ jobType: "API_COLLECTION" }).total).toBe(1);
    expect(repository.list({ artifactKind: "JSON", runtime: "NODE" }).total).toBe(1);
    expect(repository.compatible("API")).toHaveLength(1);
    database.close();
  });

  it("reports exact-version source usage", () => {
    const database = new DatabaseSync(":memory:");
    const connectors = new SqliteConnectorRepository(database);
    const sources = new SqliteSourceRepository(database);
    connectors.create(connectorInput());
    sources.create(apiSourceInput());

    expect(connectors.get("json-api", "1.0.0")?.boundSourceCount).toBe(1);
    expect(connectors.get("crawl4ai-web", "1.0.0")?.boundSourceCount).toBe(0);
    database.close();
  });

  it("rejects invalid and executable top-level manifest fields", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteConnectorRepository(database);
    expect(() =>
      repository.create({
        ...connectorInput(),
        command: "node worker.js",
      } as CreateConnectorManifestInput),
    ).toThrowError(RegistryValidationError);
    database.close();
  });

  it("returns not found for missing lifecycle updates", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteConnectorRepository(database);
    expect(() => repository.updateStatus("missing", "1.0.0", "DISABLED")).toThrowError(
      ConnectorNotFoundError,
    );
    database.close();
  });

  it("survives a database reopen", () => {
    const path = join(tmpdir(), `markorbit-connectors-${process.pid}-${Date.now()}.sqlite`);
    temporaryPaths.push(path, `${path}-shm`, `${path}-wal`);

    const firstDatabase = openRegistryDatabase(path);
    const firstRepository = new SqliteConnectorRepository(firstDatabase);
    firstRepository.create(connectorInput());
    firstDatabase.close();

    const secondDatabase = openRegistryDatabase(path);
    const secondRepository = new SqliteConnectorRepository(secondDatabase);
    expect(secondRepository.get("json-api", "1.0.0")?.manifest.displayName).toBe(
      "JSON API Connector",
    );
    secondDatabase.close();
  });
});
