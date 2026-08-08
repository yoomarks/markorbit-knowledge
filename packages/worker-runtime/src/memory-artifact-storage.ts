import type { RawArtifact } from "./raw-artifact-schema";
import type { ArtifactStoragePort } from "./artifact-storage-port";

export class MemoryArtifactStorage implements ArtifactStoragePort {
  private readonly items = new Map<string, RawArtifact>();

  async store(artifact: RawArtifact): Promise<void> {
    this.items.set(artifact.id, artifact);
  }

  async put(artifact: RawArtifact): Promise<void> {
    await this.store(artifact);
  }

  async get(id: string): Promise<RawArtifact | undefined> {
    return this.items.get(id);
  }
}
