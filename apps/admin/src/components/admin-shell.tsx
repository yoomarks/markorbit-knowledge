"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, Orbit, Search, X } from "lucide-react";
import { useState } from "react";
import { modules, primaryModuleOrder, systemModuleOrder, type ModuleKey } from "@/lib/modules";

function isModuleActive(pathname: string, key: ModuleKey) {
  const href = `/${key}`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItems({
  keys,
  pathname,
  onNavigate,
}: {
  keys: ModuleKey[];
  pathname: string;
  onNavigate: () => void;
}) {
  return keys.map((key) => {
    const item = modules[key];
    const Icon = item.icon;
    const href = `/${key}`;
    const active = isModuleActive(pathname, key);

    return (
      <Link
        key={key}
        href={href}
        onClick={onNavigate}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${active ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/7 hover:text-slate-100"}`}
      >
        <Icon size={18} aria-hidden="true" />
        {item.label}
      </Link>
    );
  });
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const systemActive = systemModuleOrder.some((key) => isModuleActive(pathname, key));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[264px] border-r border-slate-200 bg-slate-950 text-white transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="主导航"
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <Link href="/dashboard" className="flex items-center gap-3 font-medium">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <Orbit aria-hidden="true" size={20} />
            </span>
            <span>
              <span className="block text-sm">MarkOrbit</span>
              <span className="block text-xs font-normal text-slate-400">Knowledge</span>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden"
            aria-label="关闭导航"
            onClick={() => setOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <nav className="max-h-[calc(100vh-9rem)] overflow-y-auto p-3">
          <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Workbench
          </p>
          <div className="space-y-1">
            <NavItems
              keys={primaryModuleOrder}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </div>

          <div className="my-4 border-t border-white/10" />
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            System · Advanced
          </p>
          <div className="space-y-1">
            <NavItems
              keys={systemModuleOrder}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </nav>

        <div className="absolute inset-x-3 bottom-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
          <p className="font-medium text-slate-200">
            {systemActive ? "Advanced Control Plane" : "Knowledge vNext"}
          </p>
          <p className="mt-1">
            {systemActive
              ? "工程对象仍保留原有 Registry、Worker、Artifact、Conversion 和审计边界。"
              : "默认工作台以 Seed、Discovery、Review、Source 和 Knowledge 为业务入口。"}
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
            aria-label="打开导航"
            onClick={() => setOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
              aria-hidden="true"
            />
            <input
              aria-label="全局搜索预览"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-sm"
              placeholder="搜索来源、机构、专业人士、文档或案例（即将接入）"
              disabled
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 sm:flex">
              <span className="size-2 rounded-full bg-emerald-500" />
              {systemActive ? "Advanced" : "Operator Workbench"}
            </span>
            <button
              type="button"
              className="rounded-xl border border-slate-200 p-2 text-slate-600"
              aria-label="通知预览"
            >
              <Bell size={18} />
            </button>
            <div className="grid size-9 place-items-center rounded-xl bg-slate-900 text-xs font-medium text-white">
              MK
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/55 lg:hidden"
          aria-label="关闭导航遮罩"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
