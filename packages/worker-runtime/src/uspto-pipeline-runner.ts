import { type RawArtifact } from "./raw-artifact-schema";
import { type ArtifactStoragePort } from "./artifact-storage-port";
import { UsptoSourceParser } from "./uspto-source-parser";
import { UsptoSourceNormalizer } from "./uspto-source-normalizer";

export interface UsptoPipelineInput {
  sourceId: string;
  payload: unknown;
}

export interface UsptoPipelineOutput {
  artifact: RawArtifact;
  record: ReturnType<UsptoSourceNormalizer["normalize"]>;
}

export class UsptoPipelineRunner {
  private readonly parser = new UsptoSourceParser();
  private readonly normalizer = new UsptoSourceNormalizer();

  constructor(private readonly storage?: ArtifactStoragePort) {}

  async run(input: UsptoPipelineInput): Promise<UsptoPipelineOutput> {
    const parsed = this.parser.parse(input.payload);
    const record = this.normalizer.normalize(parsed);

    const artifact: RawArtifact = {
      id: `${input.sourceId}-${Date.now()}`,
      sourceId: input.sourceId,
      contentType: "application/json",
      payload: JSON.stringify(parsed),
      metadata: { normalized: true },
      capturedAt: new Date().toISOString(),
    };

    if (this.storage) {
      await this.storage.store(artifact);
    }

    return { artifact, record };
  }
}
