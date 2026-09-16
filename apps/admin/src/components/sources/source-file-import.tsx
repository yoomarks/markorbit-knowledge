"use client";

import { useResolvedAdminWorkspaceId } from "@/components/admin-workspace";
import { SourceFileImportUi } from "@/lib/admin-v2/source-file-import-ui";

export function SourceFileImport({ workspaceId: fallbackWorkspaceId }: { workspaceId: string }) {
  const workspaceId = useResolvedAdminWorkspaceId(fallbackWorkspaceId);
  return <SourceFileImportUi workspaceId={workspaceId} />;
}
