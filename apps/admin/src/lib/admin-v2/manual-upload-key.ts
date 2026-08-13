export function newManualUploadRequestKey(): string {
  return `source-file-ui:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
