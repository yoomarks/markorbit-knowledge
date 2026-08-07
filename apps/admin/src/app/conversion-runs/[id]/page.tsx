import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { ConversionRunDetail } from "@/components/conversion-runs/conversion-run-detail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <PageHeading
        title="ConversionRun detail"
        description="审计 ConversionRun 快照与 append-only event timeline。"
      />
      <ConversionRunDetail runId={id} />
    </AdminShell>
  );
}
