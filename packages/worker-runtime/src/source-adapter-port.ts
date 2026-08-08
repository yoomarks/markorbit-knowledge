export interface SourceAdapterRequest {
  sourceId: string;
  cursor?: string;
  params?: Record<string, string>;
}

export interface SourceAdapterResponse<T = unknown> {
  sourceId: string;
  items: T[];
  nextCursor?: string;
}

/**
 * Structured source adapter contract for paged source acquisition.
 */
export interface SourceAdapter<T = unknown> {
  readonly sourceId: string;
  fetch(request: SourceAdapterRequest): Promise<SourceAdapterResponse<T>>;
}

/**
 * Compatibility boundary used by the early source-specific adapters.
 * These adapters are intentionally still skeletons and may return an
 * implementation-specific payload until their production contracts are locked.
 */
export interface SourceAdapterPort {
  readonly sourceId: string;
  fetch(request: unknown): Promise<unknown>;
}
