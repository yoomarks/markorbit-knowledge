import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import { getRegistryDatabase } from "./source-registry";

export function getCaseCandidateIntakeRepository(): SqliteCaseCandidateIntakeRepository {
  return new SqliteCaseCandidateIntakeRepository(getRegistryDatabase());
}
