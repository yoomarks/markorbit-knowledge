import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { isSourceDefinition } from "@markorbit/contracts";
import { SqliteConnectorRepository } from "../src/connector-registry";
import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  RegistryValidationError,
  SqliteSourceRepository,
  generateTypedId,
  initializeRegistry,
  listAppliedMigrations,
  openRegistryDatabase,
  type CreateSourceInput,
} from "../src/index";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) rmSync(path, { force: true });
});

function sourceInput(overrides: Partial<CreateSourceInput> = {}): CreateSourceInput {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    name: "USPTO News",
    slug: "uspto-news",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: {
      connectorId: "crawl4ai-web",
      version: "1.0.0",
    },
    connectorConfig: {
      renderJavascript: false,
    },
    canonicalUri: "https://www.uspto.gov/about-us/news-updates",
    entrypoints: [
      {
        uri: "https://www.uspto.gov/about-us/news-updates",
        label: "USPTO news",
      },
    ],
    tags: ["official", "news"],
    ...overrides,
  };
}

function repository() {
  const database = new DatabaseSync(":memory:");
  let tick = 0;
  const repo = new SqliteSourceRepository(
    database,
    () => new Date(Date.UTC(2026, 6, 15, 17, 0, tick++)),
    () => `src_01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + tick)}`,
  );
  return { database, repo, connectors: new SqliteConnectorRepository(database) };
}

describe("SQLite Source Registry", () => {
  it("applies numbered migrations idempotently", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    initializeRegistry(database);
    expect(listAppliedMigrations(database)).toEqual([
      "0001_source_registry",
      "0002_connector_registry",
    ]);
    database.close();
  });

  it("generates Schema v1 typed source IDs", () => {
    expect(generateTypedId("src", 0)).toMatch(/^src_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("persists a valid create, read, update and archive lifecycle", () => {
    const { database, repo } = repository();
    const created = repo.create(sourceInput());
    expect(isSourceDefinition(created)).toBe(true);
    expect(repo.getById(created.id)).toEqual(created);

    const updated = repo.update(
      created.id,
      { name: "USPTO News and Updates", tags: ["official", "updates"] },
      created.updatedAt,
    );
    expect(updated.name).toBe("USPTO News and Updates");

    const archived = repo.archive(updated.id, updated.updatedAt);
    expect(archived.status).toBe("ARCHIVED");
    expect(isSourceDefinition(repo.getById(created.id))).toBe(true);
    database.close();
  });

  it("filters and paginates sources", () => {
    const { database, repo } = repository();
    repo.create(sourceInput());
    repo.create(
      sourceInput({
        name: "EUIPO Guidelines",
        slug: "euipo-guidelines",
        jurisdictions: ["EU"],
        category: "OFFICIAL_GUIDANCE",
        tags: ["official", "guidance"],
        canonicalUri: "https://guidelines.euipo.europa.eu/",
        entrypoints: [{ uri: "https://guidelines.euipo.europa.eu/" }],
      }),
    );

    expect(repo.list({ jurisdiction: "EU" }).items).toHaveLength(1);
    expect(repo.list({ tag: "official", limit: 1, offset: 0 }).items).toHaveLength(1);
    expect(repo.list({ tag: "official", limit: 1, offset: 1 }).items).toHaveLength(1);
    expect(repo.list({ category: "OFFICIAL_GUIDANCE" }).total).toBe(1);
    database.close();
  });

  it("enforces workspace slug uniqueness", () => {
    const { database, repo } = repository();
    repo.create(sourceInput());
    expect(() => repo.create(sourceInput({ name: "Duplicate" }))).toThrowError(
      RegistryConflictError,
    );
    database.close();
  });

  it("rejects stale optimistic updates", () => {
    const { database, repo } = repository();
    const created = repo.create(sourceInput());
    const updated = repo.update(created.id, { name: "First update" }, created.updatedAt);
    expect(() => repo.update(created.id, { name: "Stale update" }, created.updatedAt)).toThrowError(
      RegistryConflictError,
    );
    expect(repo.getById(created.id)?.updatedAt).toBe(updated.updatedAt);
    database.close();
  });

  it("prevents Crawl4AI Sources from exceeding the governed start URL budget", () => {
    const { database, repo } = repository();
    const entrypoints = Array.from({ length: 500 }, (_, index) => ({
      uri: `https://www.uspto.gov/trademarks/page-${index + 1}`,
    }));
    const created = repo.create(
      sourceInput({
        canonicalUri: entrypoints[0]!.uri,
        entrypoints,
      }),
    );
    expect(created.entrypoints).toHaveLength(500);

    expect(() =>
      repo.update(
        created.id,
        {
          entrypoints: [
            ...created.entrypoints,
            { uri: "https://www.uspto.gov/trademarks/page-501" },
          ],
        },
        created.updatedAt,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "CRAWL4AI_START_URL_BUDGET_EXCEEDED",
      }),
    );
    expect(repo.getById(created.id)?.entrypoints).toHaveLength(500);

    expect(() =>
      repo.create(
        sourceInput({
          slug: "crawl4ai-too-many-entrypoints",
          canonicalUri: entrypoints[0]!.uri,
          entrypoints: [...entrypoints, { uri: "https://www.uspto.gov/trademarks/page-501" }],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "CRAWL4AI_START_URL_BUDGET_EXCEEDED",
      }),
    );
    database.close();
  });

  it("rejects connector secret values", () => {
    const { database, repo } = repository();
    expect(() =>
      repo.create(
        sourceInput({
          connectorConfig: {
            token: "must-not-be-stored",
          },
        }),
      ),
    ).toThrowError(RegistryValidationError);
    database.close();
  });

  it("requires an exact registered active connector version", () => {
    const { database, repo } = repository();
    expect(() =>
      repo.create(
        sourceInput({
          connector: { connectorId: "crawl4ai-web", version: "9.9.9" },
        }),
      ),
    ).toThrowError(RegistryConflictError);
    database.close();
  });

  it("rejects incompatible source types", () => {
    const { database, repo } = repository();
    expect(() =>
      repo.create(
        sourceInput({
          sourceType: "API",
        }),
      ),
    ).toThrowError(RegistryConflictError);
    database.close();
  });

  it("preserves an existing deprecated binding for unrelated edits", () => {
    const { database, repo, connectors } = repository();
    const created = repo.create(sourceInput());
    connectors.updateStatus("crawl4ai-web", "1.0.0", "DEPRECATED");

    const updated = repo.update(created.id, { name: "Renamed source" }, created.updatedAt);
    expect(updated.name).toBe("Renamed source");

    expect(() => repo.update(updated.id, { status: "PAUSED" }, updated.updatedAt)).not.toThrow();
    const paused = repo.getById(updated.id);
    expect(paused?.status).toBe("PAUSED");
    expect(() =>
      repo.update(updated.id, { status: "ACTIVE" }, paused?.updatedAt ?? ""),
    ).toThrowError(RegistryConflictError);
    database.close();
  });

  it("survives a database reopen", () => {
    const path = join(tmpdir(), `markorbit-knowledge-${process.pid}-${Date.now()}.sqlite`);
    temporaryPaths.push(path, `${path}-shm`, `${path}-wal`);

    const firstDatabase = openRegistryDatabase(path);
    const firstRepository = new SqliteSourceRepository(firstDatabase);
    const created = firstRepository.create(sourceInput());
    firstDatabase.close();

    const secondDatabase = openRegistryDatabase(path);
    const secondRepository = new SqliteSourceRepository(secondDatabase);
    expect(secondRepository.getById(created.id)).toEqual(created);
    secondDatabase.close();
  });
});
