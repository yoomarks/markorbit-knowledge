import { SqliteExpertSourceRepository } from "@markorbit/persistence/expert-sources";
import { getRegistryDatabase } from "./source-registry";

export function getExpertSourceRepository(): SqliteExpertSourceRepository {
  return new SqliteExpertSourceRepository(getRegistryDatabase());
}
