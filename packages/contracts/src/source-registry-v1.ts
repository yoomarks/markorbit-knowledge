export const SOURCE_REGISTRY_VERSION = "source-registry-v1" as const;

export type SourceKind = "file" | "web" | "api" | "repository" | "unknown";

export interface SourceDefinition {
  sourceId: string;
  name: string;
  kind: SourceKind;
  locator: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SourceCandidate {
  candidateId: string;
  locator: string;
  kind: SourceKind;
  discoveredFrom?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}
