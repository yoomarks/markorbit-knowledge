import { RegistryConflictError } from "@markorbit/persistence";
import type {
  ConnectorRegistryRecord,
  ConnectorRepository,
  CreateConnectorManifestInput,
} from "@markorbit/persistence/connectors";

export const MANUAL_UPLOAD_PRODUCTION_CONNECTOR = {
  connectorId: "manual-upload",
  version: "1.0.0",
} as const;

export const MANUAL_UPLOAD_PRODUCTION_CONNECTOR_MANIFEST_INPUT: CreateConnectorManifestInput = {
  connectorId: MANUAL_UPLOAD_PRODUCTION_CONNECTOR.connectorId,
  displayName: "Manual Upload — Governed RawArtifact Ingestion",
  version: MANUAL_UPLOAD_PRODUCTION_CONNECTOR.version,
  sourceTypes: ["MANUAL_UPLOAD"],
  runtime: "NODE",
  capabilities: ["COLLECT", "IMPORT"],
  supportedJobTypes: ["LOCAL_FILE_SCAN"],
  configurationSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  secretSchema: { type: "object", properties: {} },
  outputArtifactKinds: ["MARKDOWN", "TEXT", "PDF", "DOCX", "CSV", "JSON"],
  healthCheck: { mode: "NONE", timeoutSeconds: 1 },
  status: "ACTIVE",
  extensions: {
    "x-markorbit-production-provider": true,
    "x-markorbit-evidence-boundary": "operator-file-to-immutable-raw-artifact",
  },
};

export function ensureManualUploadProductionConnector(
  connectors: ConnectorRepository,
): ConnectorRegistryRecord {
  const existing = connectors.get(
    MANUAL_UPLOAD_PRODUCTION_CONNECTOR.connectorId,
    MANUAL_UPLOAD_PRODUCTION_CONNECTOR.version,
  );
  if (existing) {
    if (existing.manifest.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "MANUAL_UPLOAD_PRODUCTION_CONNECTOR_INACTIVE",
        `Manual upload connector ${MANUAL_UPLOAD_PRODUCTION_CONNECTOR.connectorId}@${MANUAL_UPLOAD_PRODUCTION_CONNECTOR.version} exists but is not ACTIVE`,
      );
    }
    return existing;
  }
  return connectors.create(MANUAL_UPLOAD_PRODUCTION_CONNECTOR_MANIFEST_INPUT);
}
