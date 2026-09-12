import { AdminShell } from "@/components/admin-shell";
import { AiQuestionBankWorkbench } from "@/components/questions/ai-question-bank-workbench";

export default function QuestionsPage() {
  return (
    <AdminShell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
          AI Knowledge
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          AI 问题库 · Question Bank
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          管理并浏览受控 AI Knowledge Assignment 基础问题。题库定义研究任务，不把 AI
          输出视为已验证法律结论。
        </p>
      </div>
      <AiQuestionBankWorkbench />
    </AdminShell>
  );
}
