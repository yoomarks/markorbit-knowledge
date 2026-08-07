import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-emerald-700">404</p>
        <h1 className="mt-3 text-3xl font-semibold">模块不存在</h1>
        <p className="mt-3 text-slate-600">该路径尚未纳入 MarkOrbit Knowledge 管理平台。</p>
        <Link
          className="mt-6 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          href="/dashboard"
        >
          返回总览
        </Link>
      </div>
    </main>
  );
}
