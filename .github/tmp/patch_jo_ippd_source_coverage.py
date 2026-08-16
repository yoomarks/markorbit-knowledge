from pathlib import Path

priority = Path("packages/persistence/src/priority-national-source-coverage.ts")
text = priority.read_text()
marker = "const CIPO: Authority = {"
assert marker in text
block = r'''const IPPD_JO: Authority = {
  jurisdiction: "JO",
  authorityName:
    "Jordan Ministry of Industry, Trade and Supply - Industrial Property Protection Directorate (IPPD)",
  languages: ["ar-JO", "en"],
  verificationEvidenceUri:
    "https://mit.gov.jo/Ar/Pages/%D8%A7%D9%84%D8%B9%D9%84%D8%A7%D9%85%D8%A7%D8%AA_%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9_%D9%88%D8%A8%D8%B1%D8%A7%D8%A1%D8%A7%D8%AA_%D8%A7%D9%84%D8%A7%D8%AE%D8%AA%D8%B1%D8%A7%D8%B9",
};

export const IPPD_JO_SOURCE_COVERAGE_TARGETS = [
  target(IPPD_JO, {
    id: "jo-ippd-trademarks",
    family: "PORTAL",
    displayName: "Jordan IPPD Industrial Property and Trademark Portal",
    canonicalUri: "https://ippd.mit.gov.jo/",
    entrypoints: [
      {
        uri: "https://mit.gov.jo/Ar/Pages/%D8%A7%D9%84%D8%B9%D9%84%D8%A7%D9%85%D8%A7%D8%AA_%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9_%D9%88%D8%A8%D8%B1%D8%A7%D8%A1%D8%A7%D8%AA_%D8%A7%D9%84%D8%A7%D8%AE%D8%AA%D8%B1%D8%A7%D8%B9",
        label: "Ministry trademark and patent electronic-services gateway",
      },
      { uri: "https://ippd.mit.gov.jo/", label: "Industrial Property Protection Directorate" },
    ],
    verificationEvidenceUri:
      "https://mit.gov.jo/Ar/Pages/%D8%A7%D9%84%D8%B9%D9%84%D8%A7%D9%85%D8%A7%D8%AA_%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9_%D9%88%D8%A8%D8%B1%D8%A7%D8%A1%D8%A7%D8%AA_%D8%A7%D9%84%D8%A7%D8%AE%D8%AA%D8%B1%D8%A7%D8%B9",
    notes:
      "Jordan's Ministry of Industry, Trade and Supply routes trademark registration, search and supporting guidance through the Industrial Property Protection Directorate and its dedicated electronic systems.",
  }),
  target(IPPD_JO, {
    id: "jo-ippd-trademark-filing",
    family: "FILING",
    displayName: "Jordan IPPD Electronic Trademark Filing",
    canonicalUri: "https://ippd-eservice.mit.gov.jo/",
    entrypoints: [
      {
        uri: "https://mit.gov.jo/Ar/Pages/%D8%A7%D9%84%D8%B9%D9%84%D8%A7%D9%85%D8%A7%D8%AA_%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9_%D9%88%D8%A8%D8%B1%D8%A7%D8%A1%D8%A7%D8%AA_%D8%A7%D9%84%D8%A7%D8%AE%D8%AA%D8%B1%D8%A7%D8%B9",
        label: "Current ministry e-filing gateway",
      },
      {
        uri: "https://ippd.mit.gov.jo/pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=16",
        label: "Trademark registration forms and filing guidance",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri:
      "https://mit.gov.jo/Ar/Pages/%D8%A7%D9%84%D8%B9%D9%84%D8%A7%D9%85%D8%A7%D8%AA_%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9_%D9%88%D8%A8%D8%B1%D8%A7%D8%A1%D8%A7%D8%AA_%D8%A7%D9%84%D8%A7%D8%AE%D8%AA%D8%B1%D8%A7%D8%B9",
    notes:
      "The ministry currently links trademark registration to the dedicated IPPD electronic filing system; the IPPD trademark section publishes the application, publication and search forms plus filing guidance.",
  }),
  target(IPPD_JO, {
    id: "jo-ippd-trademark-search",
    family: "SEARCH",
    displayName: "Jordan IPPD Trademark Search - IP Publish",
    canonicalUri: "https://ippublish.mit.gov.jo/",
    entrypoints: [
      {
        uri: "https://mit.gov.jo/Ar/Pages/%D8%A7%D9%84%D8%B9%D9%84%D8%A7%D9%85%D8%A7%D8%AA_%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9_%D9%88%D8%A8%D8%B1%D8%A7%D8%A1%D8%A7%D8%AA_%D8%A7%D9%84%D8%A7%D8%AE%D8%AA%D8%B1%D8%A7%D8%B9",
        label: "Ministry trademark search gateway",
      },
      { uri: "https://ippublish.mit.gov.jo/", label: "Official IP Publish trademark database" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://mit.gov.jo/Ar/Pages/%D8%A7%D9%84%D8%B9%D9%84%D8%A7%D9%85%D8%A7%D8%AA_%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9_%D9%88%D8%A8%D8%B1%D8%A7%D8%A1%D8%A7%D8%AA_%D8%A7%D9%84%D8%A7%D8%AE%D8%AA%D8%B1%D8%A7%D8%B9",
    notes:
      "The ministry explicitly directs users to IP Publish for trademark searches by mark number, mark name, owner and other fields.",
  }),
  target(IPPD_JO, {
    id: "jo-ippd-trademark-fees",
    family: "FEES",
    displayName: "Jordan IPPD Trademark Fees and Service Rules",
    canonicalUri:
      "https://ippd.mit.gov.jo/Pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=31",
    entrypoints: [
      {
        uri: "https://ippd.mit.gov.jo/Pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=31",
        label: "Current trademark filing, renewal, opposition and recordal fee guidance",
      },
      {
        uri: "https://ippd.mit.gov.jo/Pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=12",
        label: "Trademark legislation and prescribed-fees source",
      },
    ],
    verificationEvidenceUri:
      "https://ippd.mit.gov.jo/Pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=31",
    notes:
      "IPPD's current FAQ exposes filing, publication, final registration, renewal, opposition, cancellation and recordal fee evidence while the legislation page links the prescribed-fees instrument. Amounts remain sourced rather than frozen as catalog truth.",
  }),
  target(IPPD_JO, {
    id: "jo-ippd-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Jordan IPPD Trademark Goods and Services Classification",
    canonicalUri:
      "https://ippd.mit.gov.jo/pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=88",
    entrypoints: [
      {
        uri: "https://ippd.mit.gov.jo/pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=88",
        label: "Trademark search and classification services",
      },
      {
        uri: "https://ippd.mit.gov.jo/pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=16",
        label: "Trademark class and international classification guidance",
      },
    ],
    verificationEvidenceUri:
      "https://ippd.mit.gov.jo/pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=88",
    notes:
      "IPPD links TMClass and the international classification of goods and services and publishes trademark class guidance for filing.",
  }),
  target(IPPD_JO, {
    id: "jo-ippd-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Jordan Trademark Law, Regulations and Related Instruments",
    canonicalUri:
      "https://ippd.mit.gov.jo/Pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=12",
    entrypoints: [
      {
        uri: "https://ippd.mit.gov.jo/Pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=12",
        label: "Trademark legislation, regulations, fees and treaties",
      },
      {
        uri: "https://ippd.mit.gov.jo/pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=26",
        label: "IPPD publications including Trademark Law No. 33 of 1952 and amendments",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://ippd.mit.gov.jo/Pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=12",
    notes:
      "IPPD publishes the amended Trademark Law, trademark regulations, prescribed fees, trademark-transfer instructions and Nice/Vienna/Paris treaty references, with the publications surface preserving the primary Trademark Law reference.",
  }),
  target(IPPD_JO, {
    id: "jo-ippd-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Jordan IPPD Trademark Opposition and Cancellation Proceedings",
    canonicalUri:
      "https://ippd.mit.gov.jo/pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=19",
    entrypoints: [
      {
        uri: "https://ippd.mit.gov.jo/pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=19",
        label: "Industrial-property cases section and trademark decisions",
      },
      {
        uri: "https://ippd.mit.gov.jo/Pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=31",
        label: "Opposition, cancellation and appeal procedure guidance",
      },
    ],
    verificationEvidenceUri:
      "https://ippd.mit.gov.jo/pages/viewpage.aspx?AspxAutoDetectCookieSupport=1&pageID=19",
    notes:
      "The IPPD cases section handles opposition, cancellation and registration disputes and publishes trademark case tables; current FAQ guidance records opposition, cancellation and administrative-court appeal paths.",
  }),
  target(IPPD_JO, {
    id: "jo-mit-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Jordan Ministry Trademark Official Gazette",
    canonicalUri:
      "https://mit.gov.jo/AR/List/_%D8%A7%D9%84%D8%AC%D8%B1%D9%8A%D8%AF%D8%A9_%D8%A7%D9%84%D8%B1%D8%B3%D9%85%D9%8A%D8%A9__",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://mit.gov.jo/AR/List/_%D8%A7%D9%84%D8%AC%D8%B1%D9%8A%D8%AF%D8%A9_%D8%A7%D9%84%D8%B1%D8%B3%D9%85%D9%8A%D8%A9__",
    notes:
      "The Ministry continuously publishes downloadable trademark gazette issues and legal-amendment supplements, making the official gazette a high-value publication and change-signal source for Jordan trademarks.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
text = text.replace(marker, block + marker, 1)
old = "  ...MOCI_KW_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
assert old in text
text = text.replace(old, "  ...MOCI_KW_SOURCE_COVERAGE_TARGETS,\n  ...IPPD_JO_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,", 1)
priority.write_text(text)

retrieval = Path("packages/persistence/src/retrieval-relevance-audit.ts")
text = retrieval.read_text()
marker = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
assert marker in text
probes = r'''  {
    id: "jo-trademarks-name",
    targetId: "jo-ippd-trademarks",
    query: "Jordan IPPD Ministry trademark services industrial property",
  },
  {
    id: "jo-trademark-filing-name",
    targetId: "jo-ippd-trademark-filing",
    query: "Jordan trademark electronic filing IPPD e-service registration",
  },
  {
    id: "jo-trademark-search-name",
    targetId: "jo-ippd-trademark-search",
    query: "Jordan official trademark search IP Publish mark owner",
  },
  {
    id: "jo-trademark-fees-name",
    targetId: "jo-ippd-trademark-fees",
    query: "Jordan trademark filing publication registration renewal opposition fees",
  },
  {
    id: "jo-trademark-classification-name",
    targetId: "jo-ippd-trademark-classification",
    query: "Jordan IPPD trademark goods services classification TMClass Nice",
  },
  {
    id: "jo-trademark-law-name",
    targetId: "jo-ippd-trademark-law",
    query: "Jordan Trademark Law 33 1952 regulations amendments fees",
  },
  {
    id: "jo-trademark-proceedings-name",
    targetId: "jo-ippd-trademark-proceedings",
    query: "Jordan trademark opposition cancellation appeal IPPD cases",
  },
'''
text = text.replace(marker, probes + marker, 1)
retrieval.write_text(text)

catalog = Path("packages/persistence/src/source-coverage-catalog.ts")
text = catalog.read_text()
old = "  MOCI_KW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
assert text.count(old) == 2
text = text.replace(old, "  MOCI_KW_SOURCE_COVERAGE_TARGETS,\n  IPPD_JO_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,")
catalog.write_text(text)

tests = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
text = tests.read_text()
old = "  MOCI_KW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
assert old in text
text = text.replace(old, "  MOCI_KW_SOURCE_COVERAGE_TARGETS,\n  IPPD_JO_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,", 1)
old = '  ["KW", MOCI_KW_SOURCE_COVERAGE_TARGETS, ["moci.gov.kw", "e.gov.kw", "media.gov.kw"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
assert old in text
text = text.replace(old, '  ["KW", MOCI_KW_SOURCE_COVERAGE_TARGETS, ["moci.gov.kw", "e.gov.kw", "media.gov.kw"]],\n  ["JO", IPPD_JO_SOURCE_COVERAGE_TARGETS, ["mit.gov.jo"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],', 1)
assert "forty-five priority national offices" in text
text = text.replace("forty-five priority national offices", "forty-six priority national offices", 1)
text = text.replace("350", "358")
tests.write_text(text)

rtests = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")
text = rtests.read_text()
text = text.replace("337", "344")
old = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "KW", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
assert old in text
new = old + '''    expect(
      listSourceCoverageTargets({ jurisdiction: "JO", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
text = text.replace(old, new, 1)
rtests.write_text(text)
