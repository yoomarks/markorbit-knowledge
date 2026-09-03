"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, Menu, Orbit, Search, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useAdminI18n } from "@/lib/i18n";
import { modules, primaryModuleOrder, systemModuleOrder, type ModuleKey } from "@/lib/modules";
import { useModalDialog } from "@/lib/use-modal-dialog";

const bilingualLabels: Record<ModuleKey, { zh: string; en: string }> = {
  dashboard: { zh: "总览", en: "Overview" },
  discovery: { zh: "来源发现", en: "Discovery" },
  sources: { zh: "来源管理", en: "Sources" },
  experts: { zh: "专家知识", en: "Expert Knowledge" },
  foundational: { zh: "基础资料健康", en: "Foundational Health" },
  foundationalDiagnostics: { zh: "基础资料诊断", en: "Foundational Diagnostics" },
  intelligence: { zh: "来源智能诊断", en: "Source Intelligence" },
  people: { zh: "人员与机构", en: "People & Organizations" },
  knowledge: { zh: "知识资产", en: "Knowledge" },
  collection: { zh: "采集", en: "Collection" },
  packages: { zh: "交付包", en: "Packages" },
  jobs: { zh: "采集计划", en: "Collection Plans" },
  runs: { zh: "执行记录", en: "Execution Runs" },
  artifacts: { zh: "原始证据", en: "Raw Artifacts" },
  staging: { zh: "暂存区", en: "Staging" },
  workers: { zh: "执行节点", en: "Workers" },
  connectors: { zh: "连接器", en: "Connectors" },
  conversionRuns: { zh: "转换记录", en: "Conversion Runs" },
  converters: { zh: "转换器", en: "Converters" },
  vault: { zh: "资料库", en: "Vault" },
  errors: { zh: "错误", en: "Errors" },
  audit: { zh: "审计", en: "Audit" },
  settings: { zh: "设置", en: "Settings" },
};

function isModuleActive(pathname: string, key: ModuleKey) {
  const href = `/${key}`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItems({
  keys,
  pathname,
  locale,
  onNavigate,
}: {
  keys: ModuleKey[];
  pathname: string;
  locale: "zh-CN" | "en-US";
  onNavigate: () => void;
}) {
  return keys.map((key) => {
    const item = modules[key];
    const Icon = item.icon;
    const href = `/${key}`;
    const active = isModuleActive(pathname, key);
    const labels = bilingualLabels[key];
    const primary = locale === "zh-CN" ? labels.zh : labels.en;
    const secondary = locale === "zh-CN" ? labels.en : labels.zh;

    return (
      <Link
        key={key}
        href={href}
        onClick={onNavigate}
        className={`group flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm transition-all ${
          active
            ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100/60"
            : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"
        }`}
      >
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg ${
            active
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
          }`}
        >
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate">
          <span className={`font-medium ${active ? "text-blue-700" : "text-slate-800"}`}>
            {primary}
          </span>
          <span className="ml-1.5 text-xs text-slate-400">{secondary}</span>
        </span>
      </Link>
    );
  });
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useAdminI18n();
  const [open, setOpen] = useState(false);
  const systemActive = systemModuleOrder.some((key) => isModuleActive(pathname, key));
  const [advancedOpen, setAdvancedOpen] = useState(systemActive);
  const mobileNavRef = useRef<HTMLElement>(null);
  const mobileNavCloseRef = useRef<HTMLButtonElement>(null);
  const closeMobileNav = useCallback(() => setOpen(false), []);
  const zh = locale === "zh-CN";

  useModalDialog({
    open,
    dialogRef: mobileNavRef,
    initialFocusRef: mobileNavCloseRef,
    onClose: closeMobileNav,
  });

  return (
    <div className="min-h-screen bg-[#f4f7fb] lg:grid lg:grid-cols-[238px_1fr]">
      <aside
        ref={mobileNavRef}
        id="admin-mobile-navigation"
        role={open ? "dialog" : undefined}
        aria-modal={open ? "true" : undefined}
        aria-label={zh ? "主导航" : "Main navigation"}
        tabIndex={open ? -1 : undefined}
        className={`fixed inset-y-0 left-0 z-40 w-[238px] border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[72px] items-center justify-between border-b border-slate-200 px-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <Orbit aria-hidden="true" size={23} />
            </span>
            <span>
              <span className="block text-[15px] font-semibold leading-5 text-slate-950">
                MarkOrbit
              </span>
              <span className="block text-[11px] text-slate-500">Knowledge Admin</span>
            </span>
          </Link>
          <button
            ref={mobileNavCloseRef}
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label={t("shell.closeNav")}
            onClick={closeMobileNav}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="max-h-[calc(100vh-126px)] overflow-y-auto px-2 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {zh ? "知识运营 · WORKBENCH" : "WORKBENCH · 知识运营"}
          </p>
          <div className="space-y-1">
            <NavItems
              keys={primaryModuleOrder}
              pathname={pathname}
              locale={locale}
              onNavigate={closeMobileNav}
            />
          </div>

          <div className="my-4 border-t border-slate-200" />
          <button
            type="button"
            onClick={() => setAdvancedOpen((current) => !current)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            aria-expanded={advancedOpen}
          >
            <span>{zh ? "高级 Advanced" : "Advanced 高级"}</span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </button>
          {advancedOpen ? (
            <div className="mt-1 space-y-1">
              <NavItems
                keys={systemModuleOrder}
                pathname={pathname}
                locale={locale}
                onNavigate={closeMobileNav}
              />
            </div>
          ) : null}
        </nav>

        <div className="absolute inset-x-0 bottom-0 flex h-[54px] items-center border-t border-slate-200 bg-white px-4 text-[10px] text-slate-400">
          <span className="mr-2 size-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-300" />
          Keep Every Brand Knowledge in Orbit.
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
            aria-label={t("shell.openNav")}
            aria-expanded={open}
            aria-controls="admin-mobile-navigation"
            onClick={() => setOpen(true)}
          >
            <Menu size={19} />
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            <Link
              href="/knowledge"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <Search size={16} aria-hidden="true" />
              <span>{zh ? "搜索知识" : "Search Knowledge"}</span>
            </Link>
            <Link
              href="/dashboard"
              className="hidden rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 md:inline-flex"
            >
              {zh ? "查看运营提醒" : "View operational alerts"}
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs sm:flex">
              <button
                type="button"
                onClick={() => setLocale("zh-CN")}
                className={`font-semibold ${locale === "zh-CN" ? "text-blue-600" : "text-slate-500 hover:text-slate-900"}`}
              >
                中文
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => setLocale("en-US")}
                className={`font-semibold ${locale === "en-US" ? "text-blue-600" : "text-slate-500 hover:text-slate-900"}`}
              >
                EN
              </button>
            </div>
            <Link
              href="/dashboard"
              className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              aria-label={zh ? "查看运营提醒" : "View operational alerts"}
              title={zh ? "查看运营提醒" : "View operational alerts"}
            >
              <Bell size={17} />
            </Link>
            <div className="hidden items-center gap-2 sm:flex">
              <div className="grid size-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                AD
              </div>
              <span className="text-xs font-medium text-slate-600">Admin</span>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-7">{children}</main>
      </div>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden"
          aria-label={t("shell.closeOverlay")}
          onClick={closeMobileNav}
        />
      ) : null}
    </div>
  );
}
