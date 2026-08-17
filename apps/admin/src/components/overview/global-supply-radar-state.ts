export type GlobalSupplyRadarStatus = "READY" | "DEGRADED" | "BLOCKED" | "UNAVAILABLE";

export type GlobalSupplyRadarCoverageItem = {
  jurisdiction: string;
  targetCount: number;
  registeredTargetCount: number;
  activatedTargetCount: number;
  supply: {
    healthy: number;
    degraded: number;
    blocked: number;
    stale: number;
    healthyPercent: number | null;
  };
};

export type GlobalSupplyRadarJurisdiction = {
  code: string;
  zh: string;
  en: string;
};

export type GlobalSupplyRadarRow = GlobalSupplyRadarJurisdiction & {
  status: GlobalSupplyRadarStatus;
  targetCount: number;
  registeredTargetCount: number;
  activatedTargetCount: number;
  healthyCount: number;
  degradedCount: number;
  blockedCount: number;
  staleCount: number;
};

export const GLOBAL_SUPPLY_RADAR_JURISDICTIONS: readonly GlobalSupplyRadarJurisdiction[] = [
  { code: "CN", zh: "中国", en: "China" },
  { code: "US", zh: "美国", en: "United States" },
  { code: "WO", zh: "WIPO", en: "WIPO" },
  { code: "EU", zh: "欧盟 / EUIPO", en: "European Union / EUIPO" },
  { code: "JP", zh: "日本", en: "Japan" },
  { code: "KR", zh: "韩国", en: "Republic of Korea" },
  { code: "GB", zh: "英国", en: "United Kingdom" },
  { code: "CA", zh: "加拿大", en: "Canada" },
  { code: "AU", zh: "澳大利亚", en: "Australia" },
  { code: "IN", zh: "印度", en: "India" },
  { code: "BR", zh: "巴西", en: "Brazil" },
  { code: "AE", zh: "阿联酋", en: "United Arab Emirates" },
  { code: "CI", zh: "OAPI / 科特迪瓦", en: "OAPI / Côte d’Ivoire" },
] as const;

export function deriveGlobalSupplyRadarStatus(
  item: GlobalSupplyRadarCoverageItem | undefined,
): GlobalSupplyRadarStatus {
  if (!item || item.targetCount <= 0) return "UNAVAILABLE";
  if (item.registeredTargetCount < item.targetCount || item.supply.blocked > 0) return "BLOCKED";
  if (
    item.activatedTargetCount < item.targetCount ||
    item.supply.healthy < item.targetCount ||
    item.supply.degraded > 0 ||
    item.supply.stale > 0
  ) {
    return "DEGRADED";
  }
  return "READY";
}

export function buildGlobalSupplyRadarRows(
  items: readonly GlobalSupplyRadarCoverageItem[],
): GlobalSupplyRadarRow[] {
  const byJurisdiction = new Map(items.map((item) => [item.jurisdiction, item]));
  return GLOBAL_SUPPLY_RADAR_JURISDICTIONS.map((jurisdiction) => {
    const item = byJurisdiction.get(jurisdiction.code);
    return {
      ...jurisdiction,
      status: deriveGlobalSupplyRadarStatus(item),
      targetCount: item?.targetCount ?? 0,
      registeredTargetCount: item?.registeredTargetCount ?? 0,
      activatedTargetCount: item?.activatedTargetCount ?? 0,
      healthyCount: item?.supply.healthy ?? 0,
      degradedCount: item?.supply.degraded ?? 0,
      blockedCount: item?.supply.blocked ?? 0,
      staleCount: item?.supply.stale ?? 0,
    };
  });
}

export function summarizeGlobalSupplyRadar(rows: readonly GlobalSupplyRadarRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary[row.status] += 1;
      return summary;
    },
    { READY: 0, DEGRADED: 0, BLOCKED: 0, UNAVAILABLE: 0 } satisfies Record<
      GlobalSupplyRadarStatus,
      number
    >,
  );
}
