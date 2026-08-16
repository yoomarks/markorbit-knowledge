from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
retrieval_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
retrieval_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


priority = priority_path.read_text()

finland_block = r'''const PRH_FI: Authority = {
  jurisdiction: "FI",
  authorityName: "Finnish Patent and Registration Office (PRH)",
  languages: ["fi-FI", "sv-FI", "en"],
  verificationEvidenceUri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks.html",
};

export const PRH_FI_SOURCE_COVERAGE_TARGETS = [
  target(PRH_FI, {
    id: "fi-prh-trademarks",
    family: "PORTAL",
    displayName: "PRH Trademarks",
    canonicalUri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks.html",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-filing",
    family: "FILING",
    displayName: "PRH How to Apply for a Trademark",
    canonicalUri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/how_to_apply.html",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/how_to_apply.html",
        label: "Trademark filing guidance",
      },
      { uri: "https://asiointi.prh.fi/", label: "PRH trademark application service" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/how_to_apply.html",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-search",
    family: "SEARCH",
    displayName: "PRH Trademark Information Service",
    canonicalUri: "https://tavaramerkkitietopalvelu.prh.fi/",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/information_services/trademark_information_service.html",
        label: "Trademark Information Service guidance",
      },
      { uri: "https://tavaramerkkitietopalvelu.prh.fi/", label: "Trademark Information Service" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/information_services/trademark_information_service.html",
    notes:
      "The PRH service covers pending and valid Finnish national trademarks, Madrid registrations designating Finland, and related opposition/revocation information; search guidance was updated on 28 July 2026.",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-fees",
    family: "FEES",
    displayName: "PRH Trademark Application and Registration Fees",
    canonicalUri: "https://www.prh.fi/en/price-lists/trademark_fees/fees_for_trademark_applications.html",
    verificationEvidenceUri:
      "https://www.prh.fi/en/price-lists/trademark_fees/fees_for_trademark_applications.html",
    notes:
      "The official price list applies from 1 January 2026 and covers applications, renewals, oppositions, revocations and invalidations.",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "PRH Classification of Goods and Services",
    canonicalUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/ennen_tavaramerkin_hakemista/classification_of_goods_and_services.html",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/ennen_tavaramerkin_hakemista/classification_of_goods_and_services.html",
        label: "Classification guidance",
      },
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/ennen_tavaramerkin_hakemista/classification_of_goods_and_services/classification_principles_and_sources_of_information/luokkaotsikot_2020.html",
        label: "Current NCL 13-2026 class headings",
      },
    ],
    verificationEvidenceUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/ennen_tavaramerkin_hakemista/classification_of_goods_and_services/classification_principles_and_sources_of_information/luokkaotsikot_2020.html",
    notes: "PRH identifies NCL 13-2026 as the current Nice Classification effective from 1 January 2026.",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "PRH Trademark Legislation and Guidelines",
    canonicalUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/legislation.html",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/legislation.html",
        label: "Trademark legislation and common practices",
      },
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/legislation/trademark_act.html",
        label: "Trademarks Act 544/2019 English translation",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/legislation.html",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "PRH Trademark Opposition, Revocation and Invalidation",
    canonicalUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/trademark_disputes/opposition_against_a_trademark.html",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/trademark_disputes/opposition_against_a_trademark.html",
        label: "Opposition procedure",
      },
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/trademark_disputes/revocation_and_invalidation_procedure.html",
        label: "Revocation and invalidation procedure",
      },
    ],
    verificationEvidenceUri:
      "https://www.prh.fi/en/intellectualpropertyrights/trademarks/trademark_disputes/opposition_against_a_trademark.html",
  }),
  target(PRH_FI, {
    id: "fi-prh-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "PRH Trademark Gazette",
    canonicalUri: "https://teollisoikeuslehdet.prh.fi/en/trademarkgazette",
    entrypoints: [
      {
        uri: "https://www.prh.fi/en/intellectualpropertyrights/trademarks/general_information_about_trademarks/information_services/the_trademark_gazette.html",
        label: "Trademark Gazette guidance",
      },
      { uri: "https://teollisoikeuslehdet.prh.fi/en/trademarkgazette", label: "Trademark Gazette" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://teollisoikeuslehdet.prh.fi/en/trademarkgazette",
    notes:
      "The online Trademark Gazette replaces the former twice-monthly PDF gazette and is updated daily with national marks, Madrid registrations valid in Finland and trademarks with a reputation.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''

priority = replace_once(priority, "const CIPO: Authority = {", finland_block + "const CIPO: Authority = {", "insert Finland coverage")
priority = replace_once(
    priority,
    "  ...DKPTO_DK_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...DKPTO_DK_SOURCE_COVERAGE_TARGETS,\n  ...PRH_FI_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "aggregate Finland coverage",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = catalog.replace(
    "  DKPTO_DK_SOURCE_COVERAGE_TARGETS,\n",
    "  DKPTO_DK_SOURCE_COVERAGE_TARGETS,\n  PRH_FI_SOURCE_COVERAGE_TARGETS,\n",
)
if catalog.count("PRH_FI_SOURCE_COVERAGE_TARGETS") != 2:
    raise RuntimeError("catalog: expected Finland import and export")
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    "  DKPTO_DK_SOURCE_COVERAGE_TARGETS,\n",
    "  DKPTO_DK_SOURCE_COVERAGE_TARGETS,\n  PRH_FI_SOURCE_COVERAGE_TARGETS,\n",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["DK", DKPTO_DK_SOURCE_COVERAGE_TARGETS, ["dkpto.org", "dkpto.dk"]],\n',
    '  ["DK", DKPTO_DK_SOURCE_COVERAGE_TARGETS, ["dkpto.org", "dkpto.dk"]],\n  ["FI", PRH_FI_SOURCE_COVERAGE_TARGETS, ["prh.fi"]],\n',
    "priority test authority set",
)
priority_test = priority_test.replace(
    'ships explicit, official, unique coverage for nineteen priority national offices',
    'ships explicit, official, unique coverage for twenty priority national offices',
)
priority_test = priority_test.replace("toHaveLength(140)", "toHaveLength(148)", 1)
priority_test = priority_test.replace("toBe(\n      140,\n", "toBe(\n      148,\n", 1)
priority_test = priority_test.replace(").toBe(140);", ").toBe(148);", 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
finland_probes = r'''  {
    id: "fi-trademarks-name",
    targetId: "fi-prh-trademarks",
    query: "PRH trademarks Finland",
  },
  {
    id: "fi-trademark-filing-name",
    targetId: "fi-prh-trademark-filing",
    query: "apply trademark online Finland",
  },
  {
    id: "fi-trademark-search-name",
    targetId: "fi-prh-trademark-search",
    query: "Trademark Information Service Finland",
  },
  {
    id: "fi-trademark-fees-name",
    targetId: "fi-prh-trademark-fees",
    query: "trademark application registration fees 2026",
  },
  {
    id: "fi-trademark-classification-name",
    targetId: "fi-prh-trademark-classification",
    query: "NCL 13-2026 classification goods services",
  },
  {
    id: "fi-trademark-law-name",
    targetId: "fi-prh-trademark-law",
    query: "Trademarks Act legislation Finland",
  },
  {
    id: "fi-trademark-proceedings-name",
    targetId: "fi-prh-trademark-proceedings",
    query: "trademark opposition revocation invalidation",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    finland_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "retrieval Finland probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace("toHaveLength(155)", "toHaveLength(162)", 2)
retrieval_test = retrieval_test.replace("toBe(\n      155,\n", "toBe(\n      162,\n", 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "DK", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "DK", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "FI", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    "retrieval test Finland jurisdiction",
)
retrieval_test_path.write_text(retrieval_test)

print("Finland PRH source coverage patch applied")
