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

export interface SourceAdapter<T = unknown> {
  readonly sourceId: string;
  fetch(request: SourceAdapterRequest): Promise<SourceAdapterResponse<T>>;
}
