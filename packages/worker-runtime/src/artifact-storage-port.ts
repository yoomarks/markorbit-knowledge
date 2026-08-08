import type { RawArtifact } from "./raw-artifact-schema";

export interface ArtifactStoragePort {
  store(artifact: RawArtifact): Promise<void>;
  get(id: string): Promise<RawArtifact | undefined>;
}
