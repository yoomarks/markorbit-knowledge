import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { AdminShell } from "@/components/admin-shell";
import { KnowledgeHybridSearch } from "@/components/knowledge/knowledge-hybrid-search";

export const dynamic = "force-dynamic";

export default function KnowledgeHybridSearchPage() {
  return (
    <AdminShell>
      <KnowledgeHybridSearch workspaceId={DEFAULT_WORKSPACE.id} />
    </AdminShell>
  );
}
