import { SourceFileImport } from "@/components/sources/source-file-import";

export function SourceFileImportWrapper({ workspaceId }: { workspaceId: string }) {
  return <SourceFileImport workspaceId={workspaceId} />;
}
