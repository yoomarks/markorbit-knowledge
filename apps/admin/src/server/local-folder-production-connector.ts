import { RegistryConflictError } from "@markorbit/persistence";
import type {
  ConnectorRegistryRecord,
  ConnectorRepository,
  CreateConnectorManifestInput,
} from "@markorbit/persistence/connectors";

export const LOCAL_FOLDER_PRODUCTION_CONNECTOR = {
  connectorId: "local-folder",
  version: "1.0.0",
} as const;

export const LOCAL_FOLDER_PRODUCTION_CONNECTOR_MANIFEST_INPUT: CreateConnectorManifestInput = {
  connectorId: LOCAL_FOLDER_PRODUCTION_CONNECTOR.connectorId,
  displayName: "Local Folder — Governed Worker RawArtifact Ingestion",
  version: LOCAL_FOLDER_PRODUCTION_CONNECTOR.version,
  sourceTypes: ["LOCAL_FOLDER"],
  runtime: "PYTHON",
  capabilities: ["COLLECT"],
  supportedJobTypes: ["LOCAL_FILE_SCAN"],
  configurationSchema: {
    type: "object",
    additionalProperties: false,
    required: ["rootBindingId"],
    properties: {
      rootBindingId: { type: "string", minLength: 1, maxLength: 120 },
      relativePath: { type: "string", maxLength: 500 },
      recursive: { type: "boolean" },
    },
  },
  secretSchema: { type: "object", properties: {} },
  outputArtifactKinds: ["MARKDOWN", "TEXT", "PDF", "DOCX", "XLSX", "CSV", "JSON", "XML"],
  healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
  status: "ACTIVE",
  extensions: {
    "x-markorbit-production-provider": true,
    "x-markorbit-root-authority": "worker-local-explicit-binding",
    "x-markorbit-symlink-policy": "never-follow",
    "x-markorbit-evidence-boundary": "bounded-local-file-to-immutable-raw-artifact",
  },
};

export function ensureLocalFolderProductionConnector(
  connectors: ConnectorRepository,
): ConnectorRegistryRecord {
  const existing = connectors.get(
    LOCAL_FOLDER_PRODUCTION_CONNECTOR.connectorId,
    LOCAL_FOLDER_PRODUCTION_CONNECTOR.version,
  );
  if (existing) {
    if (existing.manifest.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "LOCAL_FOLDER_PRODUCTION_CONNECTOR_INACTIVE",
        `Local folder connector ${LOCAL_FOLDER_PRODUCTION_CONNECTOR.connectorId}@${LOCAL_FOLDER_PRODUCTION_CONNECTOR.version} exists but is not ACTIVE`,
      );
    }
    return existing;
  }
  return connectors.create(LOCAL_FOLDER_PRODUCTION_CONNECTOR_MANIFEST_INPUT);
}
