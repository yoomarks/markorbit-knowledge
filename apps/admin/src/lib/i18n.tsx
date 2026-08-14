"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

export const ADMIN_LOCALES = ["zh-CN", "en-US"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];

const STORAGE_KEY = "markorbit-admin-locale";
const CHANGE_EVENT = "markorbit-admin-locale-change";

const zhCN = {
  "language.zh": "中文",
  "language.en": "English",
  "shell.workbench": "工作台",
  "shell.advanced": "系统 · 高级",
  "shell.advancedBadge": "高级模式",
  "shell.workbenchBadge": "工作台",
  "shell.search": "搜索来源、机构、专业人士、文档或案例（即将接入）",
  "shell.openNav": "打开导航",
  "shell.closeNav": "关闭导航",
  "shell.closeOverlay": "关闭导航遮罩",
  "shell.notifications": "通知预览",
  "shell.primaryFooterTitle": "知识运营",
  "shell.primaryFooterBody": "发现来源、管理来源、沉淀知识并交付资料包。",
  "shell.advancedFooterTitle": "高级控制面",
  "shell.advancedFooterBody":
    "工程对象保留在高级控制面，日常运营无需理解 Registry、Worker 或 Run。",
  "module.dashboard": "概览",
  "module.discovery": "来源发现",
  "module.sources": "来源管理",
  "module.knowledge": "知识库",
  "module.packages": "资料包",
  "module.jobs": "采集计划",
  "module.runs": "执行记录",
  "module.artifacts": "原始证据",
  "module.workers": "执行节点",
  "module.connectors": "连接器",
  "module.conversionRuns": "转换记录",
  "module.converters": "转换器",
  "module.vault": "资料库 / Vault",
  "common.refresh": "刷新",
  "common.search": "搜索",
  "common.all": "全部",
  "common.loading": "正在加载…",
  "common.view": "查看",
  "common.cancel": "取消",
  "common.confirm": "确认",
  "common.status": "状态",
  "common.updatedAt": "更新时间",
  "sources.title": "来源管理",
  "sources.description":
    "统一管理所有来源。来源发现、人工网站、文件导入及其他采集入口最终都进入同一来源体系。",
  "sources.new": "新建网站 / API 来源",
  "discovery.title": "来源发现",
  "discovery.description":
    "输入一个或一批网站。系统负责发现和整理候选，审批、启用和首次采集统一在来源管理中完成。",
  "foundational.description":
    "查看核心官方资料从来源登记、采集、转换、入库到检索的覆盖和健康状态。这里不承担来源审批，也不暴露底层工程执行细节。",
  "knowledge.title": "知识库",
  "knowledge.description": "查看已经采集、转换并保留来源证据的知识资料。",
  "packages.title": "资料包",
  "packages.description": "查看已经准备、验证并等待交付下游系统的资料包。",
} as const;

const enUS: Record<keyof typeof zhCN, string> = {
  "language.zh": "中文",
  "language.en": "English",
  "shell.workbench": "Workbench",
  "shell.advanced": "System · Advanced",
  "shell.advancedBadge": "Advanced",
  "shell.workbenchBadge": "Workbench",
  "shell.search": "Search sources, organizations, people, documents or cases (coming soon)",
  "shell.openNav": "Open navigation",
  "shell.closeNav": "Close navigation",
  "shell.closeOverlay": "Close navigation overlay",
  "shell.notifications": "Notifications preview",
  "shell.primaryFooterTitle": "Knowledge Operations",
  "shell.primaryFooterBody":
    "Discover sources, manage sources, build knowledge and deliver packages.",
  "shell.advancedFooterTitle": "Advanced Control Plane",
  "shell.advancedFooterBody":
    "Engineering objects stay in Advanced; daily operators do not need to understand Registry, Worker or Run internals.",
  "module.dashboard": "Overview",
  "module.discovery": "Discovery",
  "module.sources": "Sources",
  "module.knowledge": "Knowledge",
  "module.packages": "Packages",
  "module.jobs": "Collection Plans",
  "module.runs": "Execution Runs",
  "module.artifacts": "Raw Artifacts",
  "module.workers": "Workers",
  "module.connectors": "Connectors",
  "module.conversionRuns": "Conversion Runs",
  "module.converters": "Converters",
  "module.vault": "Obsidian / Vault",
  "common.refresh": "Refresh",
  "common.search": "Search",
  "common.all": "All",
  "common.loading": "Loading…",
  "common.view": "View",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.status": "Status",
  "common.updatedAt": "Updated",
  "sources.title": "Sources",
  "sources.description":
    "Manage all sources in one place. Discovery, manual websites, file imports and other intake paths all converge on the same source system.",
  "sources.new": "New website / API source",
  "discovery.title": "Discovery",
  "discovery.description":
    "Enter one or more websites. Discovery finds and organizes candidates; review, activation and initial collection happen in Sources.",
  "foundational.description":
    "Inspect coverage and operational health for core official materials from source registration through collection, conversion, indexing and retrieval. Source approval and engineering execution details stay outside this surface.",
  "knowledge.title": "Knowledge",
  "knowledge.description":
    "Browse acquired and converted knowledge assets with preserved provenance.",
  "packages.title": "Packages",
  "packages.description":
    "Inspect packages that are being prepared, validated and delivered to downstream systems.",
};

export type AdminMessageKey = keyof typeof zhCN;

function normalizeLocale(value: string | null | undefined): AdminLocale {
  return value === "en-US" ? "en-US" : "zh-CN";
}

function getClientLocale(): AdminLocale {
  if (typeof window === "undefined") return "zh-CN";
  return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
}

function subscribeLocale(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  const onCustom = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onCustom);
  };
}

function setClientLocale(locale: AdminLocale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, locale);
  window.dispatchEvent(new Event(CHANGE_EVENT));
  document.documentElement.lang = locale;
}

type AdminI18nContextValue = {
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
  t: (key: AdminMessageKey) => string;
};

const AdminI18nContext = createContext<AdminI18nContextValue | null>(null);

export function AdminI18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore<AdminLocale>(subscribeLocale, getClientLocale, () => "zh-CN");
  const value = useMemo<AdminI18nContextValue>(() => {
    const dictionary = locale === "en-US" ? enUS : zhCN;
    return {
      locale,
      setLocale: setClientLocale,
      t: (key) => dictionary[key],
    };
  }, [locale]);
  return <AdminI18nContext.Provider value={value}>{children}</AdminI18nContext.Provider>;
}

export function useAdminI18n(): AdminI18nContextValue {
  const context = useContext(AdminI18nContext);
  if (!context) throw new Error("useAdminI18n must be used inside AdminI18nProvider");
  return context;
}
