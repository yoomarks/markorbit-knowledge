import { AdminShell } from "@/components/admin-shell";
import { SourceDetailWorkbench } from "@/components/sources/source-detail-workbench";

export const dynamic = "force-dynamic";

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <SourceDetailWorkbench sourceId={id} />
    </AdminShell>
  );
}
