import { AdminShell } from "@/components/admin-shell";
import { ConverterDetail } from "@/components/converters/converter-detail";
import { PageHeading } from "@/components/page-heading";

export const dynamic = "force-dynamic";

export default async function ConverterDetailPage({
  params,
}: {
  params: Promise<{ converterId: string; version: string }>;
}) {
  const { converterId, version } = await params;
  return (
    <AdminShell>
      <PageHeading
        title="Converter Manifest"
        description="查看不可变版本契约、生命周期、绑定 Profile 和版本历史。Runtime Health 尚未评估。"
      />
      <ConverterDetail converterId={converterId} version={version} />
    </AdminShell>
  );
}
