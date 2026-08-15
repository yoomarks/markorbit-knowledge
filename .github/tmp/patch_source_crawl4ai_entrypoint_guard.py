from pathlib import Path

schema = Path("packages/contracts/src/schema-v1.ts")
text = schema.read_text()
old = 'export const SCHEMA_V1_VERSION = "1.0" as const;\n'
new = 'export const SCHEMA_V1_VERSION = "1.0" as const;\nexport const CRAWL4AI_MAX_START_URLS = 500;\n'
if text.count(old) != 1:
    raise SystemExit(f"schema version anchor count={text.count(old)}")
schema.write_text(text.replace(old, new, 1))

worker = Path("packages/worker-runtime/src/crawl4ai-subprocess-acquirer.ts")
text = worker.read_text()
old = 'import type { ArtifactKind, ExecutionExecutor } from "@markorbit/contracts";\n'
new = '''import {
  CRAWL4AI_MAX_START_URLS,
  type ArtifactKind,
  type ExecutionExecutor,
} from "@markorbit/contracts";
export { CRAWL4AI_MAX_START_URLS } from "@markorbit/contracts";
'''
if text.count(old) != 1:
    raise SystemExit(f"worker contract import anchor count={text.count(old)}")
text = text.replace(old, new, 1)
old = 'export const CRAWL4AI_MAX_START_URLS = 500;\n'
if text.count(old) != 1:
    raise SystemExit(f"worker local constant count={text.count(old)}")
worker.write_text(text.replace(old, '', 1))

persistence = Path("packages/persistence/src/index.ts")
text = persistence.read_text()
old = '''  AUTHORITY_LEVELS,
  SCHEMA_V1_VERSION,
'''
new = '''  AUTHORITY_LEVELS,
  CRAWL4AI_MAX_START_URLS,
  SCHEMA_V1_VERSION,
'''
if text.count(old) != 1:
    raise SystemExit(f"persistence import anchor count={text.count(old)}")
text = text.replace(old, new, 1)

anchor = '''function validateConnectorBinding(
  database: DatabaseSync,
  source: SourceDefinition,
  requireActive: boolean,
): ConnectorManifest {'''
# Add helper after validateConnectorBinding by locating its return/end block.
end_anchor = '''  return manifest;
}

export function openRegistryDatabase(path: string): DatabaseSync {'''
helper = '''  return manifest;
}

function validateConnectorAcquisitionBoundary(source: SourceDefinition): void {
  if (source.connector.connectorId !== "crawl4ai-web") return;
  const uniqueStartUrls = new Set(
    [source.canonicalUri, ...source.entrypoints.map((entrypoint) => entrypoint.uri)].filter(
      (uri): uri is string => Boolean(uri),
    ),
  );
  if (uniqueStartUrls.size <= CRAWL4AI_MAX_START_URLS) return;
  throw new RegistryConflictError(
    "CRAWL4AI_START_URL_BUDGET_EXCEEDED",
    `Crawl4AI Source contains ${uniqueStartUrls.size} unique start URLs; the governed limit is ${CRAWL4AI_MAX_START_URLS}`,
    {
      connectorId: source.connector.connectorId,
      uniqueStartUrls: uniqueStartUrls.size,
      limit: CRAWL4AI_MAX_START_URLS,
    },
  );
}

export function openRegistryDatabase(path: string): DatabaseSync {'''
if text.count(end_anchor) != 1:
    raise SystemExit(f"binding end anchor count={text.count(end_anchor)}")
text = text.replace(end_anchor, helper, 1)

old = '''    const source = normalizeCreateInput(input, this.idFactory(), this.clock().toISOString());
    validateConnectorBinding(this.database, source, true);
    const row = sourceRow(source);'''
new = '''    const source = normalizeCreateInput(input, this.idFactory(), this.clock().toISOString());
    validateConnectorBinding(this.database, source, true);
    validateConnectorAcquisitionBoundary(source);
    const row = sourceRow(source);'''
if text.count(old) != 1:
    raise SystemExit(f"create validation anchor count={text.count(old)}")
text = text.replace(old, new, 1)

old = '''    const activating = current.status !== "ACTIVE" && next.status === "ACTIVE";
    validateConnectorBinding(this.database, next, bindingChanged || activating);
    const row = sourceRow(next);'''
new = '''    const activating = current.status !== "ACTIVE" && next.status === "ACTIVE";
    validateConnectorBinding(this.database, next, bindingChanged || activating);
    validateConnectorAcquisitionBoundary(next);
    const row = sourceRow(next);'''
if text.count(old) != 1:
    raise SystemExit(f"update validation anchor count={text.count(old)}")
text = text.replace(old, new, 1)
persistence.write_text(text)

source_test = Path("packages/persistence/tests/source-registry.test.ts")
test = source_test.read_text()
insert_anchor = '''  it("rejects connector secret values", () => {
'''
addition = '''  it("prevents Crawl4AI Sources from exceeding the governed start URL budget", () => {
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
          entrypoints: [
            ...entrypoints,
            { uri: "https://www.uspto.gov/trademarks/page-501" },
          ],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "CRAWL4AI_START_URL_BUDGET_EXCEEDED",
      }),
    );
    database.close();
  });

'''
if test.count(insert_anchor) != 1:
    raise SystemExit(f"source test anchor count={test.count(insert_anchor)}")
source_test.write_text(test.replace(insert_anchor, addition + insert_anchor, 1))
