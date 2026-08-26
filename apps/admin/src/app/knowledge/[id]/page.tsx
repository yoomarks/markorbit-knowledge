import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { AdminShell } from "@/components/admin-shell";
import { ContentReader } from "@/components/knowledge/content-reader";

export const dynamic = "force-dynamic";

export default async function KnowledgeContentReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminShell>
      <ContentReader documentId={id} workspaceId={DEFAULT_WORKSPACE.id} />
    </AdminShell>
  );
}
