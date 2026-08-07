import { AdminShell } from "@/components/admin-shell";
import { ConnectorEditor } from "@/components/connectors/connector-editor";
import { PageHeading } from "@/components/page-heading";

export default function NewConnectorPage() {
  return (
    <AdminShell>
      <PageHeading
        title="注册 Connector Manifest"
        description="登记新的不可变 SemVer 版本。Manifest 只描述契约和能力，不加载或执行 Connector 代码。"
      />
      <ConnectorEditor />
    </AdminShell>
  );
}
