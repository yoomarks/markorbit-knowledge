import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { KnowledgeWorkspaceBoundary } from "@/components/knowledge/knowledge-workspace";
import { KnowledgeSearchSurface } from "@/components/knowledge/knowledge-workspace-surfaces";

export const dynamic = "force-dynamic";

export default function KnowledgeHybridSearchPage() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <KnowledgeWorkspaceBoundary>
          <KnowledgeSearchSurface />
        </KnowledgeWorkspaceBoundary>
      </Suspense>
    </AdminShell>
  );
}
