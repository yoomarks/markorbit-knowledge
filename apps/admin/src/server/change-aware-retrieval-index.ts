import type {
  RetrievalDocument,
  RetrievalDocumentResult,
  RetrievalSearchRequest,
  RetrievalSearchResult,
} from "@markorbit/contracts";
import type {
  IndexVerifiedDocumentInput,
  IndexVerifiedDocumentResult,
  RetrievalIndexRepository,
} from "@markorbit/persistence/retrieval-index";
import type { DocumentChangeFeedRepository } from "@markorbit/persistence/document-change-feed";

export class ChangeAwareRetrievalIndexRepository implements RetrievalIndexRepository {
  constructor(
    private readonly retrieval: RetrievalIndexRepository,
    private readonly changes: DocumentChangeFeedRepository,
  ) {}

  indexVerified(input: IndexVerifiedDocumentInput): IndexVerifiedDocumentResult {
    const indexed = this.retrieval.indexVerified(input);
    this.changes.recordIndexedVersion(indexed.document, indexed.chunks);
    return indexed;
  }

  search(request: RetrievalSearchRequest): RetrievalSearchResult {
    return this.retrieval.search(request);
  }

  getDocument(
    workspaceId: string,
    documentId: string,
    artifactVersion?: number,
  ): RetrievalDocument | null {
    return this.retrieval.getDocument(workspaceId, documentId, artifactVersion);
  }

  listChunks(stagingDocumentId: string, workspaceId: string) {
    return this.retrieval.listChunks(stagingDocumentId, workspaceId);
  }

  documentResult(
    workspaceId: string,
    documentId: string,
    canonicalMarkdown: string,
    artifactVersion?: number,
  ): RetrievalDocumentResult | null {
    return this.retrieval.documentResult(
      workspaceId,
      documentId,
      canonicalMarkdown,
      artifactVersion,
    );
  }
}
