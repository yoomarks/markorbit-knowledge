import { RegistryConflictError } from "@markorbit/persistence";
import type {
  ConnectorRegistryRecord,
  ConnectorRepository,
  CreateConnectorManifestInput,
} from "@markorbit/persistence/connectors";

export const CRAWL4AI_PRODUCTION_CONNECTOR = {
  connectorId: "crawl4ai-web",
  version: "1.2.0",
} as const;

export const CRAWL4AI_PRODUCTION_CONNECTOR_MANIFEST_INPUT: CreateConnectorManifestInput = {
  connectorId: CRAWL4AI_PRODUCTION_CONNECTOR.connectorId,
  displayName: "Crawl4AI Web Connector — Production Pages + Attachments",
  version: CRAWL4AI_PRODUCTION_CONNECTOR.version,
  sourceTypes: ["WEB"],
  runtime: "PYTHON",
  capabilities: ["COLLECT", "DEEP_CRAWL", "RENDER_JAVASCRIPT", "FETCH_ATTACHMENTS"],
  supportedJobTypes: ["WEB_CRAWL"],
  configurationSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      renderJavascript: { type: "boolean" },
      maxDepth: { type: "integer", minimum: 0, maximum: 5 },
    },
  },
  secretSchema: { type: "object", properties: {} },
  outputArtifactKinds: [
    "HTML",
    "MARKDOWN",
    "PDF",
    "DOCX",
    "XLSX",
    "CSV",
    "JSON",
    "XML",
    "EMAIL",
    "IMAGE",
    "TEXT",
  ],
  healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
  status: "ACTIVE",
  extensions: {
    "x-markorbit-production-provider": true,
    "x-markorbit-crawl4ai-version": "0.9.2",
    "x-markorbit-evidence-boundary": "raw-pages-and-authorized-attachments",
  },
};

export function ensureCrawl4AiProductionConnector(
  connectors: ConnectorRepository,
): ConnectorRegistryRecord {
  const existing = connectors.get(
    CRAWL4AI_PRODUCTION_CONNECTOR.connectorId,
    CRAWL4AI_PRODUCTION_CONNECTOR.version,
  );
  if (existing) {
    if (existing.manifest.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "CRAWL4AI_PRODUCTION_CONNECTOR_INACTIVE",
        `Production connector ${CRAWL4AI_PRODUCTION_CONNECTOR.connectorId}@${CRAWL4AI_PRODUCTION_CONNECTOR.version} exists but is not ACTIVE`,
      );
    }
    return existing;
  }
  return connectors.create(CRAWL4AI_PRODUCTION_CONNECTOR_MANIFEST_INPUT);
}
