import { SqliteExpertSourceRetrievalRepository } from "@markorbit/persistence/expert-source-retrieval";
import { getRegistryDatabase } from "./source-registry";

export function getExpertSourceRetrievalRepository(): SqliteExpertSourceRetrievalRepository {
  return new SqliteExpertSourceRetrievalRepository(getRegistryDatabase());
}
