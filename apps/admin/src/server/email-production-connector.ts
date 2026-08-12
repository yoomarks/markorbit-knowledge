import { RegistryConflictError } from "@markorbit/persistence";
import type {
  ConnectorRegistryRecord,
  ConnectorRepository,
  CreateConnectorManifestInput,
} from "@markorbit/persistence/connectors";

export const EMAIL_PRODUCTION_CONNECTOR = {
  connectorId: "imap-email",
  version: "1.0.0",
} as const;

export const EMAIL_PRODUCTION_CONNECTOR_MANIFEST_INPUT: CreateConnectorManifestInput = {
  connectorId: EMAIL_PRODUCTION_CONNECTOR.connectorId,
  displayName: "IMAP Email — Read-only RawArtifact Ingestion",
  version: EMAIL_PRODUCTION_CONNECTOR.version,
  sourceTypes: ["EMAIL"],
  runtime: "PYTHON",
  capabilities: ["COLLECT"],
  supportedJobTypes: ["EMAIL_IMPORT"],
  configurationSchema: {
    type: "object",
    additionalProperties: false,
    required: ["accountBindingId", "mailbox"],
    properties: {
      accountBindingId: { type: "string", minLength: 1, maxLength: 120 },
      mailbox: { type: "string", minLength: 1, maxLength: 200 },
      initialUid: { type: "integer", minimum: 1 },
    },
  },
  secretSchema: { type: "object", properties: {} },
  outputArtifactKinds: ["EMAIL"],
  healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
  status: "ACTIVE",
  extensions: {
    "x-markorbit-production-provider": true,
    "x-markorbit-account-authority": "worker-local-explicit-binding",
    "x-markorbit-imap-access": "read-only-body-peek",
    "x-markorbit-mailbox-mutation": false,
    "x-markorbit-evidence-boundary": "rfc822-message-to-immutable-raw-artifact",
  },
};

export function ensureEmailProductionConnector(
  connectors: ConnectorRepository,
): ConnectorRegistryRecord {
  const existing = connectors.get(
    EMAIL_PRODUCTION_CONNECTOR.connectorId,
    EMAIL_PRODUCTION_CONNECTOR.version,
  );
  if (existing) {
    if (existing.manifest.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "EMAIL_PRODUCTION_CONNECTOR_INACTIVE",
        `Email connector ${EMAIL_PRODUCTION_CONNECTOR.connectorId}@${EMAIL_PRODUCTION_CONNECTOR.version} exists but is not ACTIVE`,
      );
    }
    return existing;
  }
  return connectors.create(EMAIL_PRODUCTION_CONNECTOR_MANIFEST_INPUT);
}
