export type SourceProviderKind = "TRADEMARK_OFFICE" | "REGISTRY" | "API" | "FILE";

export interface SourceMetadataSchema {
  sourceId: string;
  name: string;
  country?: string;
  providerKind: SourceProviderKind;
  version: string;
  capabilities: string[];
}
