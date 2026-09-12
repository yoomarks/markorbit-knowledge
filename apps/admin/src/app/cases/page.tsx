import { AdminShell } from "@/components/admin-shell";
import { CaseEvidenceWorkbench } from "@/components/cases/case-evidence-workbench";

export default function CasesPage() {
  return (
    <AdminShell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
          Federated Case Evidence
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          案件证据 · Case Evidence
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          查看 MarkReg 授权 promotion 进入 Knowledge 的 Case Candidate、证据采集状态与 Dossier
          谱系。Knowledge 只消费不可变证据，不复制 MarkReg 的案件事实系统。
        </p>
      </div>
      <CaseEvidenceWorkbench />
    </AdminShell>
  );
}
