"use client";

import { SourceFileImportUi } from "@/lib/admin-v2/source-file-import-ui";

export function SourceFileImport({ workspaceId }: { workspaceId: string }) {
  return <SourceFileImportUi workspaceId={workspaceId} />;
}
