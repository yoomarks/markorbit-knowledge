import type { AiAssignmentLibraryV1, AiKnowledgeAssignmentV1 } from "@markorbit/contracts";
import { SqliteAiAssignmentLibraryRepository } from "@markorbit/persistence/ai-assignment-libraries";
import {
  TRADEMARK_ASSIGNMENT_LIBRARY_JURISDICTIONS,
  getTrademarkAssignmentLibraryMetadata,
  seedAllTrademarkAssignmentLibraries,
  type TrademarkAssignmentLibraryJurisdiction,
} from "@markorbit/persistence/trademark-assignment-library-catalog";
import { getRegistryDatabase } from "./source-registry";

export type AiQuestionBankLibraryView = {
  library: AiAssignmentLibraryV1;
  questions: AiKnowledgeAssignmentV1[];
};

export type AiQuestionBankView = {
  libraries: AiQuestionBankLibraryView[];
  totalQuestions: number;
};
function readLibrary(
  repository: SqliteAiAssignmentLibraryRepository,
  jurisdiction: TrademarkAssignmentLibraryJurisdiction,
): AiQuestionBankLibraryView {
  const metadata = getTrademarkAssignmentLibraryMetadata(jurisdiction);
  const library = repository.getLatestLibrary(metadata.libraryId);
  if (!library) {
    throw new Error(`AI question bank bootstrap did not create ${metadata.libraryId}`);
  }
  const questions = metadata.workflows.flatMap((workflow) =>
    repository.listAssignmentsByWorkflow({
      libraryId: library.libraryId,
      revision: library.revision,
      workflow,
    }),
  );
  return { library, questions };
}

export function getAiQuestionBankView(): AiQuestionBankView {
  const database = getRegistryDatabase();
  seedAllTrademarkAssignmentLibraries(database);
  const repository = new SqliteAiAssignmentLibraryRepository(database);
  const libraries = TRADEMARK_ASSIGNMENT_LIBRARY_JURISDICTIONS.map((jurisdiction) =>
    readLibrary(repository, jurisdiction),
  );
  return {
    libraries,
    totalQuestions: libraries.reduce((sum, item) => sum + item.questions.length, 0),
  };
}
