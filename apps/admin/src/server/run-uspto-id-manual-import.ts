import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { DEFAULT_WORKSPACE, RegistryConflictError } from "@markorbit/persistence";
import { parseUsptoIdManualHtml, writeUsptoIdManualSnapshot } from "@markorbit/worker-runtime";
import {
  ensureManualUploadIngressConnector,
  ingestManualUpload,
  MANUAL_UPLOAD_INGRESS_CONNECTOR,
} from "./manual-upload-ingestion";
import { getSourceRepository } from "./source-registry";

const DEFAULT_SOURCE_URI = "https://idm-tmng.uspto.gov/";
const SOURCE_SLUG = "uspto-trademark-id-manual";

type Options = {
  input: string;
  outputRoot: string;
  sourceUri: string;
  expectedRowCount?: number;
  expectedSha256?: string;
};

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1]?.trim();
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function parseOptions(args: string[]): Options {
  const input = optionValue(args, "--input");
  if (!input) throw new Error("--input is required");
  const repositoryRoot = resolve(
    process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd(),
  );
  const expectedRows = optionValue(args, "--expected-row-count");
  const expectedRowCount = expectedRows === undefined ? undefined : Number(expectedRows);
  if (
    expectedRowCount !== undefined &&
    (!Number.isSafeInteger(expectedRowCount) || expectedRowCount <= 0)
  ) {
    throw new Error("--expected-row-count must be a positive integer");
  }
  const expectedSha256 = optionValue(args, "--expected-sha256")?.toLowerCase();
  if (expectedSha256 && !/^[0-9a-f]{64}$/u.test(expectedSha256)) {
    throw new Error("--expected-sha256 must be a lowercase SHA-256 digest");
  }
  return {
    input: resolve(input),
    outputRoot: resolve(
      optionValue(args, "--output-root") ??
        resolve(repositoryRoot, ".data", "exports", "uspto-id-manual"),
    ),
    sourceUri: optionValue(args, "--source-uri") ?? DEFAULT_SOURCE_URI,
    ...(expectedRowCount === undefined ? {} : { expectedRowCount }),
    ...(expectedSha256 ? { expectedSha256 } : {}),
  };
}

function ensureOfficialSource(sourceUri: string): string {
  ensureManualUploadIngressConnector();
  const sources = getSourceRepository();
  const existing = sources
    .list({ workspaceId: DEFAULT_WORKSPACE.id, q: SOURCE_SLUG, limit: 100 })
    .items.find((source) => source.slug === SOURCE_SLUG);
  if (existing) {
    const compatible =
      existing.status === "ACTIVE" &&
      existing.sourceType === "MANUAL_UPLOAD" &&
      existing.category === "OFFICIAL_AUTHORITY" &&
      existing.authorityLevel === "PRIMARY_OFFICIAL" &&
      existing.connector.connectorId === MANUAL_UPLOAD_INGRESS_CONNECTOR.connectorId &&
      existing.connector.version === MANUAL_UPLOAD_INGRESS_CONNECTOR.version &&
      existing.canonicalUri === sourceUri;
    if (!compatible) {
      throw new RegistryConflictError(
        "USPTO_ID_MANUAL_SOURCE_CONFLICT",
        `Existing Source ${existing.id} does not match the governed USPTO ID Manual source`,
      );
    }
    return existing.id;
  }

  return sources.create({
    workspaceId: DEFAULT_WORKSPACE.id,
    name: "USPTO Trademark ID Manual",
    slug: SOURCE_SLUG,
    sourceType: "MANUAL_UPLOAD",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: MANUAL_UPLOAD_INGRESS_CONNECTOR,
    connectorConfig: {},
    canonicalUri: sourceUri,
    entrypoints: [{ uri: sourceUri, label: "USPTO Trademark ID Manual" }],
    tags: ["uspto", "id-manual", "goods-services", "official-export"],
    extensions: {
      "x-markorbit-ingress": "operator-provided-official-export",
      "x-markorbit-detected-media-type": "text/html",
      "x-markorbit-source-filename": "idmanual.xls",
    },
  }).id;
}

async function* fileChunks(path: string): AsyncIterable<Uint8Array> {
  for await (const chunk of createReadStream(path)) {
    yield new Uint8Array(chunk as Buffer);
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const file = await stat(options.input);
  if (!file.isFile() || file.size <= 0) throw new Error("--input must name a non-empty file");
  const bytes = new Uint8Array(await readFile(options.input));
  const observedSha256 = createHash("sha256").update(bytes).digest("hex");
  if (options.expectedSha256 && options.expectedSha256 !== observedSha256) {
    throw new Error(
      `USPTO ID Manual SHA-256 mismatch: expected ${options.expectedSha256}, observed ${observedSha256}`,
    );
  }
  const parsed = parseUsptoIdManualHtml(bytes);
  if (options.expectedRowCount !== undefined && parsed.rows.length !== options.expectedRowCount) {
    throw new Error(
      `USPTO ID Manual row count mismatch: expected ${options.expectedRowCount}, observed ${parsed.rows.length}`,
    );
  }

  const sourceId = ensureOfficialSource(options.sourceUri);
  const ingestion = await ingestManualUpload({
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId,
    originalName: basename(options.input),
    mimeType: "text/html",
    expectedSizeBytes: file.size,
    expectedSha256: observedSha256,
    idempotencyKey: `uspto-id-manual-${observedSha256}`,
    chunks: fileChunks(options.input),
    provenanceSourceUri: options.sourceUri,
  });
  const snapshot = await writeUsptoIdManualSnapshot({
    bytes,
    rawArtifact: ingestion.artifact,
    outputRoot: options.outputRoot,
    sourceUri: options.sourceUri,
    ...(options.expectedRowCount === undefined
      ? {}
      : { expectedRowCount: options.expectedRowCount }),
    ...(options.expectedSha256 ? { expectedBinarySha256: options.expectedSha256 } : {}),
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        sourceId,
        runId: ingestion.runId,
        rawArtifactId: ingestion.artifact.id,
        rawArtifactReplayed: ingestion.replayed,
        rawArtifactSourceUri: ingestion.artifact.provenance.sourceUri,
        rawArtifactStorageUri: ingestion.artifact.storage.uri,
        binarySha256: observedSha256,
        rowCount: snapshot.manifest.rows.count,
        distinctTermIdCount: snapshot.manifest.rows.distinctTermIdCount,
        statusCounts: snapshot.manifest.rows.statusCounts,
        manifestPath: snapshot.manifestPath,
        rowsPath: snapshot.rowsPath,
        snapshotReplayed: snapshot.replayed,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
