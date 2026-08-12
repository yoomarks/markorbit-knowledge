/**
 * Source Seed Catalog V1
 *
 * Defines initial trusted discovery entry points.
 * Knowledge stores and expands source coverage only;
 * interpretation remains outside Knowledge.
 */

export const SOURCE_SEED_CATALOG_VERSION = "1.0" as const;

export type SeedSourceCategory =
  | "official_ip_office"
  | "international_organization"
  | "industry_publication"
  | "professional_firm";

export interface SourceSeed {
  id: string;
  name: string;
  category: SeedSourceCategory;
  country?: string;
  url: string;
  discoveryEnabled: boolean;
}

export const SOURCE_SEEDS: readonly SourceSeed[] = [
  {
    id: "wipo",
    name: "World Intellectual Property Organization",
    category: "international_organization",
    url: "https://www.wipo.int/",
    discoveryEnabled: true,
  },
  {
    id: "uspto",
    name: "United States Patent and Trademark Office",
    category: "official_ip_office",
    country: "US",
    url: "https://www.uspto.gov/",
    discoveryEnabled: true,
  },
  {
    id: "euipo",
    name: "European Union Intellectual Property Office",
    category: "official_ip_office",
    country: "EU",
    url: "https://www.euipo.europa.eu/",
    discoveryEnabled: true,
  },
  {
    id: "cnipa",
    name: "China National Intellectual Property Administration",
    category: "official_ip_office",
    country: "CN",
    url: "https://www.cnipa.gov.cn/",
    discoveryEnabled: true,
  },
  {
    id: "inta",
    name: "International Trademark Association",
    category: "international_organization",
    url: "https://www.inta.org/",
    discoveryEnabled: true,
  },
];
