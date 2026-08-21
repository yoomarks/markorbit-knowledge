import { describe, expect, it } from "vitest";

import { extractCountryIndexPublicInventory } from "./country-index-public-inventory";

describe("Country Index public inventory", () => {
  it("enumerates public country, agreement, news, office and code entrypoints", () => {
    const html = `
      <a href="country_surveys.aspx?ID=88">USA (US)</a>
      <a href="country_surveys.aspx?ID=44">China (CN)</a>
      <a href="agreement.aspx?ID=1">EUIPO</a>
      <a href="agreement.aspx?ID=2">WIPO</a>
      <a href="newsletter.aspx">News</a>
      <a href="ip_office_addresses.aspx">IP Office Addresses</a>
      <a href="country_codes.aspx">Country Codes</a>
      <a href="publications.aspx">Publications</a>
      <a href="https://example.com/country_surveys.aspx?ID=1">External</a>
    `;

    const inventory = extractCountryIndexPublicInventory(html);

    expect(inventory.counts.COUNTRY_SURVEY).toBe(2);
    expect(inventory.counts.MULTINATIONAL_AGREEMENT).toBe(2);
    expect(inventory.counts.NEWS).toBe(1);
    expect(inventory.counts.IP_OFFICE_ADDRESSES).toBe(1);
    expect(inventory.counts.COUNTRY_CODES).toBe(1);
    expect(inventory.itemCount).toBe(7);
    expect(inventory.items.some((item) => item.uri.includes("publications.aspx"))).toBe(false);
  });

  it("deduplicates repeated navigation links", () => {
    const html = `
      <a href="country_surveys.aspx?ID=88">USA</a>
      <a href="country_surveys.aspx?ID=88">USA again</a>
    `;
    const inventory = extractCountryIndexPublicInventory(html);
    expect(inventory.itemCount).toBe(1);
  });
});
