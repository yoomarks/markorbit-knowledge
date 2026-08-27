import type { ExpertQuestionTaskV1, ExpertSourceRecordV1 } from "@markorbit/contracts";

export type ImportedExpertReply = {
  task: ExpertQuestionTaskV1;
  sourceRecord: ExpertSourceRecordV1;
};
