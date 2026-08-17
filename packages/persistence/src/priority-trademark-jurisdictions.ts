export const PRIORITY_TRADEMARK_JURISDICTION_LIMIT = 120 as const;

export const PRIORITY_TRADEMARK_JURISDICTION_SELECTION_FACTORS = [
  "POPULATION",
  "REGIONAL_POSITION",
  "ECONOMIC_SCALE",
  "TRADEMARK_ACTIVITY_AND_MATURITY",
  "TRADEMARK_LAW_DISTINCTIVENESS",
] as const;

export type PriorityTrademarkJurisdictionSelectionFactor =
  (typeof PRIORITY_TRADEMARK_JURISDICTION_SELECTION_FACTORS)[number];

export const PRIORITY_TRADEMARK_REGIONS = [
  "NORTH_AMERICA",
  "LATIN_AMERICA_CARIBBEAN",
  "EUROPE",
  "MIDDLE_EAST_NORTH_AFRICA",
  "SUB_SAHARAN_AFRICA",
  "ASIA_PACIFIC",
] as const;
export type PriorityTrademarkRegion = (typeof PRIORITY_TRADEMARK_REGIONS)[number];

export const PRIORITY_TRADEMARK_BANDS = ["P0", "P1", "P2", "P3"] as const;
export type PriorityTrademarkBand = (typeof PRIORITY_TRADEMARK_BANDS)[number];

export const PRIORITY_TRADEMARK_COVERAGE_STATES = ["CURATED", "TARGET"] as const;
export type PriorityTrademarkCoverageState =
  (typeof PRIORITY_TRADEMARK_COVERAGE_STATES)[number];

export const PRIORITY_TRADEMARK_AUTHORITY_MODELS = ["NATIONAL", "REGIONAL"] as const;
export type PriorityTrademarkAuthorityModel =
  (typeof PRIORITY_TRADEMARK_AUTHORITY_MODELS)[number];

export type PriorityTrademarkJurisdiction = {
  rank: number;
  jurisdiction: string;
  displayName: string;
  region: PriorityTrademarkRegion;
  priorityBand: PriorityTrademarkBand;
  coverageState: PriorityTrademarkCoverageState;
  authorityModel: PriorityTrademarkAuthorityModel;
};

type PriorityTrademarkJurisdictionSeed = readonly [
  jurisdiction: string,
  displayName: string,
  region: PriorityTrademarkRegion,
  priorityBand: PriorityTrademarkBand,
  coverageState: PriorityTrademarkCoverageState,
  authorityModel: PriorityTrademarkAuthorityModel,
];

/**
 * Product-scoped jurisdiction roster for the first national trademark coverage milestone.
 *
 * Ordering is the implementation priority within the 120-jurisdiction cap. It balances
 * population, regional position, economic scale, trademark activity/maturity and
 * distinctive trademark-law/system characteristics. `CURATED` means the repository
 * already has explicit source coverage; `TARGET` means it is inside the locked first
 * 120 and should be filled before any jurisdiction outside this roster is added.
 *
 * The roster is an acquisition-planning boundary only. It does not perform legal
 * interpretation, value scoring or recommendation logic.
 */
const PRIORITY_TRADEMARK_JURISDICTION_SEEDS = [
  ["CN", "China", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["US", "United States", "NORTH_AMERICA", "P0", "CURATED", "NATIONAL"],
  ["IN", "India", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["JP", "Japan", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["KR", "Republic of Korea", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["DE", "Germany", "EUROPE", "P0", "CURATED", "NATIONAL"],
  ["GB", "United Kingdom", "EUROPE", "P0", "CURATED", "NATIONAL"],
  ["FR", "France", "EUROPE", "P0", "CURATED", "NATIONAL"],
  ["BR", "Brazil", "LATIN_AMERICA_CARIBBEAN", "P0", "CURATED", "NATIONAL"],
  ["RU", "Russian Federation", "EUROPE", "P0", "TARGET", "NATIONAL"],
  ["IT", "Italy", "EUROPE", "P0", "CURATED", "NATIONAL"],
  ["CA", "Canada", "NORTH_AMERICA", "P0", "CURATED", "NATIONAL"],
  ["AU", "Australia", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["MX", "Mexico", "LATIN_AMERICA_CARIBBEAN", "P0", "CURATED", "NATIONAL"],
  ["TR", "Türkiye", "MIDDLE_EAST_NORTH_AFRICA", "P0", "CURATED", "NATIONAL"],
  ["ID", "Indonesia", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["ES", "Spain", "EUROPE", "P0", "CURATED", "NATIONAL"],
  ["SA", "Saudi Arabia", "MIDDLE_EAST_NORTH_AFRICA", "P0", "CURATED", "NATIONAL"],
  ["AE", "United Arab Emirates", "MIDDLE_EAST_NORTH_AFRICA", "P0", "CURATED", "NATIONAL"],
  ["NL", "Netherlands", "EUROPE", "P0", "TARGET", "REGIONAL"],
  ["IR", "Iran", "MIDDLE_EAST_NORTH_AFRICA", "P0", "TARGET", "NATIONAL"],
  ["VN", "Viet Nam", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["PL", "Poland", "EUROPE", "P0", "CURATED", "NATIONAL"],
  ["CH", "Switzerland", "EUROPE", "P0", "CURATED", "NATIONAL"],
  ["TH", "Thailand", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["MY", "Malaysia", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["SG", "Singapore", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["AR", "Argentina", "LATIN_AMERICA_CARIBBEAN", "P0", "CURATED", "NATIONAL"],
  ["ZA", "South Africa", "SUB_SAHARAN_AFRICA", "P0", "CURATED", "NATIONAL"],
  ["PH", "Philippines", "ASIA_PACIFIC", "P0", "CURATED", "NATIONAL"],
  ["PK", "Pakistan", "ASIA_PACIFIC", "P1", "TARGET", "NATIONAL"],
  ["BE", "Belgium", "EUROPE", "P1", "TARGET", "REGIONAL"],
  ["SE", "Sweden", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["NO", "Norway", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["DK", "Denmark", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["AT", "Austria", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["IE", "Ireland", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["PT", "Portugal", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["CZ", "Czechia", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["RO", "Romania", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["CL", "Chile", "LATIN_AMERICA_CARIBBEAN", "P1", "CURATED", "NATIONAL"],
  ["CO", "Colombia", "LATIN_AMERICA_CARIBBEAN", "P1", "CURATED", "NATIONAL"],
  ["EG", "Egypt", "MIDDLE_EAST_NORTH_AFRICA", "P1", "CURATED", "NATIONAL"],
  ["IL", "Israel", "MIDDLE_EAST_NORTH_AFRICA", "P1", "CURATED", "NATIONAL"],
  ["BD", "Bangladesh", "ASIA_PACIFIC", "P1", "CURATED", "NATIONAL"],
  ["UA", "Ukraine", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["KZ", "Kazakhstan", "ASIA_PACIFIC", "P1", "CURATED", "NATIONAL"],
  ["NG", "Nigeria", "SUB_SAHARAN_AFRICA", "P1", "CURATED", "NATIONAL"],
  ["DZ", "Algeria", "MIDDLE_EAST_NORTH_AFRICA", "P1", "CURATED", "NATIONAL"],
  ["MA", "Morocco", "MIDDLE_EAST_NORTH_AFRICA", "P1", "CURATED", "NATIONAL"],
  ["PE", "Peru", "LATIN_AMERICA_CARIBBEAN", "P1", "CURATED", "NATIONAL"],
  ["TW", "Taiwan", "ASIA_PACIFIC", "P1", "CURATED", "NATIONAL"],
  ["HK", "Hong Kong", "ASIA_PACIFIC", "P1", "CURATED", "NATIONAL"],
  ["NZ", "New Zealand", "ASIA_PACIFIC", "P1", "CURATED", "NATIONAL"],
  ["FI", "Finland", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["GR", "Greece", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["HU", "Hungary", "EUROPE", "P1", "CURATED", "NATIONAL"],
  ["QA", "Qatar", "MIDDLE_EAST_NORTH_AFRICA", "P1", "CURATED", "NATIONAL"],
  ["KW", "Kuwait", "MIDDLE_EAST_NORTH_AFRICA", "P1", "CURATED", "NATIONAL"],
  ["OM", "Oman", "MIDDLE_EAST_NORTH_AFRICA", "P1", "CURATED", "NATIONAL"],
  ["IQ", "Iraq", "MIDDLE_EAST_NORTH_AFRICA", "P2", "TARGET", "NATIONAL"],
  ["UZ", "Uzbekistan", "ASIA_PACIFIC", "P2", "TARGET", "NATIONAL"],
  ["GH", "Ghana", "SUB_SAHARAN_AFRICA", "P2", "CURATED", "NATIONAL"],
  ["KE", "Kenya", "SUB_SAHARAN_AFRICA", "P2", "CURATED", "NATIONAL"],
  ["TN", "Tunisia", "MIDDLE_EAST_NORTH_AFRICA", "P2", "CURATED", "NATIONAL"],
  ["JO", "Jordan", "MIDDLE_EAST_NORTH_AFRICA", "P2", "CURATED", "NATIONAL"],
  ["BH", "Bahrain", "MIDDLE_EAST_NORTH_AFRICA", "P2", "CURATED", "NATIONAL"],
  ["RS", "Serbia", "EUROPE", "P2", "CURATED", "NATIONAL"],
  ["SK", "Slovakia", "EUROPE", "P2", "CURATED", "NATIONAL"],
  ["BG", "Bulgaria", "EUROPE", "P2", "CURATED", "NATIONAL"],
  ["HR", "Croatia", "EUROPE", "P2", "CURATED", "NATIONAL"],
  ["SI", "Slovenia", "EUROPE", "P2", "CURATED", "NATIONAL"],
  ["LT", "Lithuania", "EUROPE", "P2", "CURATED", "NATIONAL"],
  ["LV", "Latvia", "EUROPE", "P2", "CURATED", "NATIONAL"],
  ["EE", "Estonia", "EUROPE", "P2", "CURATED", "NATIONAL"],
  ["CY", "Cyprus", "EUROPE", "P2", "CURATED", "NATIONAL"],
  ["LK", "Sri Lanka", "ASIA_PACIFIC", "P2", "CURATED", "NATIONAL"],
  ["NP", "Nepal", "ASIA_PACIFIC", "P2", "CURATED", "NATIONAL"],
  ["GE", "Georgia", "ASIA_PACIFIC", "P2", "CURATED", "NATIONAL"],
  ["AZ", "Azerbaijan", "ASIA_PACIFIC", "P2", "CURATED", "NATIONAL"],
  ["AM", "Armenia", "ASIA_PACIFIC", "P2", "CURATED", "NATIONAL"],
  ["MD", "Moldova", "EUROPE", "P2", "CURATED", "NATIONAL"],
  ["EC", "Ecuador", "LATIN_AMERICA_CARIBBEAN", "P2", "TARGET", "NATIONAL"],
  ["VE", "Venezuela", "LATIN_AMERICA_CARIBBEAN", "P2", "TARGET", "NATIONAL"],
  ["UY", "Uruguay", "LATIN_AMERICA_CARIBBEAN", "P2", "TARGET", "NATIONAL"],
  ["GT", "Guatemala", "LATIN_AMERICA_CARIBBEAN", "P2", "TARGET", "NATIONAL"],
  ["CR", "Costa Rica", "LATIN_AMERICA_CARIBBEAN", "P2", "TARGET", "NATIONAL"],
  ["PA", "Panama", "LATIN_AMERICA_CARIBBEAN", "P2", "TARGET", "NATIONAL"],
  ["DO", "Dominican Republic", "LATIN_AMERICA_CARIBBEAN", "P2", "TARGET", "NATIONAL"],
  ["ET", "Ethiopia", "SUB_SAHARAN_AFRICA", "P2", "TARGET", "NATIONAL"],
  ["IS", "Iceland", "EUROPE", "P3", "CURATED", "NATIONAL"],
  ["MT", "Malta", "EUROPE", "P3", "CURATED", "NATIONAL"],
  ["AL", "Albania", "EUROPE", "P3", "TARGET", "NATIONAL"],
  ["BA", "Bosnia and Herzegovina", "EUROPE", "P3", "TARGET", "NATIONAL"],
  ["MK", "North Macedonia", "EUROPE", "P3", "TARGET", "NATIONAL"],
  ["BY", "Belarus", "EUROPE", "P3", "TARGET", "NATIONAL"],
  ["MN", "Mongolia", "ASIA_PACIFIC", "P3", "TARGET", "NATIONAL"],
  ["KH", "Cambodia", "ASIA_PACIFIC", "P3", "TARGET", "NATIONAL"],
  ["LA", "Lao PDR", "ASIA_PACIFIC", "P3", "TARGET", "NATIONAL"],
  ["MM", "Myanmar", "ASIA_PACIFIC", "P3", "TARGET", "NATIONAL"],
  ["BN", "Brunei Darussalam", "ASIA_PACIFIC", "P3", "TARGET", "NATIONAL"],
  ["LB", "Lebanon", "MIDDLE_EAST_NORTH_AFRICA", "P3", "TARGET", "NATIONAL"],
  ["PY", "Paraguay", "LATIN_AMERICA_CARIBBEAN", "P3", "TARGET", "NATIONAL"],
  ["BO", "Bolivia", "LATIN_AMERICA_CARIBBEAN", "P3", "TARGET", "NATIONAL"],
  ["HN", "Honduras", "LATIN_AMERICA_CARIBBEAN", "P3", "TARGET", "NATIONAL"],
  ["SV", "El Salvador", "LATIN_AMERICA_CARIBBEAN", "P3", "TARGET", "NATIONAL"],
  ["CU", "Cuba", "LATIN_AMERICA_CARIBBEAN", "P3", "TARGET", "NATIONAL"],
  ["JM", "Jamaica", "LATIN_AMERICA_CARIBBEAN", "P3", "TARGET", "NATIONAL"],
  ["TT", "Trinidad and Tobago", "LATIN_AMERICA_CARIBBEAN", "P3", "TARGET", "NATIONAL"],
  ["TZ", "Tanzania", "SUB_SAHARAN_AFRICA", "P3", "TARGET", "NATIONAL"],
  ["AO", "Angola", "SUB_SAHARAN_AFRICA", "P3", "TARGET", "NATIONAL"],
  ["MZ", "Mozambique", "SUB_SAHARAN_AFRICA", "P3", "TARGET", "NATIONAL"],
  ["ZM", "Zambia", "SUB_SAHARAN_AFRICA", "P3", "TARGET", "NATIONAL"],
  ["ZW", "Zimbabwe", "SUB_SAHARAN_AFRICA", "P3", "TARGET", "NATIONAL"],
  ["CI", "Côte d'Ivoire", "SUB_SAHARAN_AFRICA", "P3", "TARGET", "REGIONAL"],
  ["CD", "Democratic Republic of the Congo", "SUB_SAHARAN_AFRICA", "P3", "TARGET", "NATIONAL"],
  ["CM", "Cameroon", "SUB_SAHARAN_AFRICA", "P3", "TARGET", "REGIONAL"],
  ["SN", "Senegal", "SUB_SAHARAN_AFRICA", "P3", "TARGET", "REGIONAL"],
  ["RW", "Rwanda", "SUB_SAHARAN_AFRICA", "P3", "CURATED", "NATIONAL"],
  ["UG", "Uganda", "SUB_SAHARAN_AFRICA", "P3", "CURATED", "NATIONAL"],
] as const satisfies readonly PriorityTrademarkJurisdictionSeed[];

export const PRIORITY_TRADEMARK_JURISDICTIONS: readonly PriorityTrademarkJurisdiction[] =
  PRIORITY_TRADEMARK_JURISDICTION_SEEDS.map(
    ([jurisdiction, displayName, region, priorityBand, coverageState, authorityModel], index) => ({
      rank: index + 1,
      jurisdiction,
      displayName,
      region,
      priorityBand,
      coverageState,
      authorityModel,
    }),
  );

export function getPriorityTrademarkJurisdiction(
  jurisdiction: string,
): PriorityTrademarkJurisdiction | undefined {
  const normalized = jurisdiction.trim().toUpperCase();
  return PRIORITY_TRADEMARK_JURISDICTIONS.find((item) => item.jurisdiction === normalized);
}

export function listPriorityTrademarkJurisdictions(
  filters: {
    region?: PriorityTrademarkRegion;
    priorityBand?: PriorityTrademarkBand;
    coverageState?: PriorityTrademarkCoverageState;
    authorityModel?: PriorityTrademarkAuthorityModel;
  } = {},
): PriorityTrademarkJurisdiction[] {
  return PRIORITY_TRADEMARK_JURISDICTIONS.filter((item) => {
    if (filters.region && item.region !== filters.region) return false;
    if (filters.priorityBand && item.priorityBand !== filters.priorityBand) return false;
    if (filters.coverageState && item.coverageState !== filters.coverageState) return false;
    if (filters.authorityModel && item.authorityModel !== filters.authorityModel) return false;
    return true;
  }).map((item) => ({ ...item }));
}
