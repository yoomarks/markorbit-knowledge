import { AdminShell } from "@/components/admin-shell";
import { ConnectorEditor } from "@/components/connectors/connector-editor";
import { PageHeading } from "@/components/page-heading";

export const dynamic = "force-dynamic";

export default async function ConnectorDetailPage({
  params,
}: {
  params: Promise<{ connectorId: string; version: string }>;
}) {
  const { connectorId, version } = await params;
  return (
    <AdminShell>
      <PageHeading
        title="Connector Manifest"
        description="查看不可变版本契约、生命周期、绑定数据源及版本历史。Registry 状态不等于 Worker 健康状态。"
      />
      <ConnectorEditor connectorId={connectorId} version={version} />
    </AdminShell>
  );
}
