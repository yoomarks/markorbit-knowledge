import type { ReactNode } from "react";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { SourcesRootActions } from "@/lib/admin-v2/sources-root-actions";

export default function SourcesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SourcesRootActions workspaceId={DEFAULT_WORKSPACE.id} />
    </>
  );
}
