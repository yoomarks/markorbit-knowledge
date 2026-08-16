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

poland_block = r'''const UPRP_PL: Authority = {
  jurisdiction: "PL",
  authorityName: "Patent Office of the Republic of Poland (UPRP)",
  languages: ["pl-PL"],
  verificationEvidenceUri:
    "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
};

export const UPRP_PL_SOURCE_COVERAGE_TARGETS = [
  target(UPRP_PL, {
    id: "pl-uprp-trademarks",
    family: "PORTAL",
    displayName: "UPRP Trademark Information",
    canonicalUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
    verificationEvidenceUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-filing",
    family: "FILING",
    displayName: "UPRP National Trademark Procedure",
    canonicalUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-",
    entrypoints: [
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-",
        label: "National trademark procedure",
      },
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe-/znaki-towarowe-informacje-podstawowe/jaka-dokumentacje-nalezy-zlozyc",
        label: "Trademark filing documentation",
      },
    ],
    verificationEvidenceUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-",
    notes:
      "The national procedure gives the filing sequence, prior-search tools, Nice-classified goods/services requirements, publication and opposition steps.",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-search",
    family: "SEARCH",
    displayName: "UPRP e-Wyszukiwarka",
    canonicalUri: "https://uprp.gov.pl/pl/uslugi-online/e-wyszukiwarka",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://uprp.gov.pl/pl/uslugi-online/e-wyszukiwarka",
    notes:
      "e-Wyszukiwarka is UPRP's unified public search across industrial-property databases and BUP/WUP publications.",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-fees",
    family: "FEES",
    displayName: "UPRP Trademark Procedure Fees",
    canonicalUri: "https://uprp.gov.pl/pl/przedmioty-ochrony/inne/oplaty-w-postepowaniu",
    entrypoints: [
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/inne/oplaty-w-postepowaniu",
        label: "Official procedure fee table",
      },
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa2/oplaty-zgloszeniowe",
        label: "National trademark filing fees",
      },
    ],
    verificationEvidenceUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/inne/oplaty-w-postepowaniu",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "UPRP Nice Classification",
    canonicalUri: "https://uprp.gov.pl/pl/klasyfikacje",
    entrypoints: [
      { uri: "https://uprp.gov.pl/pl/klasyfikacje", label: "UPRP international classifications" },
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-",
        label: "Trademark procedure Nice classification guidance",
      },
    ],
    verificationEvidenceUri: "https://uprp.gov.pl/pl/klasyfikacje",
    notes:
      "UPRP lists the International Classification of Goods and Services (Nice Classification); its national trademark procedure requires a Nice-classified goods/services list and recommends TMclass.",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "UPRP President Trademark Guidelines",
    canonicalUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/ogolne-wytyczne-prezesa-uprp/wytyczne-w-zakresie-znakow-towarowych",
    verificationEvidenceUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/ogolne-wytyczne-prezesa-uprp/wytyczne-w-zakresie-znakow-towarowych",
    notes:
      "The President's trademark guidelines reflect current law and harmonize UPRP interpretation and examination practice.",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-law-proceedings",
    family: "LEGAL_TEXTS",
    displayName: "UPRP Trademark Law and Opposition Procedure",
    canonicalUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
    entrypoints: [
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
        label: "Trademark legal acts",
      },
      {
        uri: "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/procedura-krajowa-/procedura-sprzeciwowa",
        label: "Trademark opposition procedure",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://uprp.gov.pl/pl/przedmioty-ochrony/znaki-towarowe/znaki-towarowe-informacje-podstawowe",
    notes:
      "The official trademark information page lists the Industrial Property Law and implementing trademark regulations; the national opposition procedure provides the three-month post-publication opposition framework.",
  }),
  target(UPRP_PL, {
    id: "pl-uprp-trademark-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "UPRP Biuletyn Urzędu Patentowego - Trademarks",
    canonicalUri: "https://uprp.gov.pl/pl/publikacje/biuletyn-i-wiadomo%C5%9Bci-uprp",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://uprp.gov.pl/pl/publikacje/biuletyn-i-wiadomo%C5%9Bci-uprp",
    notes:
      "UPRP publishes weekly 2026 trademark BUP issues; publication of trademark applications starts the statutory opposition period.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''

priority = replace_once(priority, "const CIPO: Authority = {", poland_block + "const CIPO: Authority = {", "insert Poland coverage")
priority = replace_once(
    priority,
    "  ...INPI_PT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...INPI_PT_SOURCE_COVERAGE_TARGETS,\n  ...UPRP_PL_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "aggregate Poland coverage",
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
catalog = catalog.replace(
    "  INPI_PT_SOURCE_COVERAGE_TARGETS,\n",
    "  INPI_PT_SOURCE_COVERAGE_TARGETS,\n  UPRP_PL_SOURCE_COVERAGE_TARGETS,\n",
)
if catalog.count("UPRP_PL_SOURCE_COVERAGE_TARGETS") != 2:
    raise RuntimeError("catalog: expected Poland import and export")
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_once(
    priority_test,
    "  INPI_PT_SOURCE_COVERAGE_TARGETS,\n",
    "  INPI_PT_SOURCE_COVERAGE_TARGETS,\n  UPRP_PL_SOURCE_COVERAGE_TARGETS,\n",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["PT", INPI_PT_SOURCE_COVERAGE_TARGETS, ["inpi.justica.gov.pt"]],\n',
    '  ["PT", INPI_PT_SOURCE_COVERAGE_TARGETS, ["inpi.justica.gov.pt"]],\n  ["PL", UPRP_PL_SOURCE_COVERAGE_TARGETS, ["uprp.gov.pl"]],\n',
    "priority test authority set",
)
priority_test = priority_test.replace(
    'ships explicit, official, unique coverage for twenty-three priority national offices',
    'ships explicit, official, unique coverage for twenty-four priority national offices',
)
priority_test = priority_test.replace("toHaveLength(172)", "toHaveLength(180)", 1)
priority_test = priority_test.replace("toBe(\n      172,\n", "toBe(\n      180,\n", 1)
priority_test = priority_test.replace(").toBe(172);", ").toBe(180);", 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
poland_probes = r'''  {
    id: "pl-trademarks-name",
    targetId: "pl-uprp-trademarks",
    query: "znaki towarowe informacje podstawowe UPRP",
  },
  {
    id: "pl-trademark-filing-name",
    targetId: "pl-uprp-trademark-filing",
    query: "procedura krajowa zgłoszenie znaku towarowego",
  },
  {
    id: "pl-trademark-search-name",
    targetId: "pl-uprp-trademark-search",
    query: "e-Wyszukiwarka znaki towarowe UPRP",
  },
  {
    id: "pl-trademark-fees-name",
    targetId: "pl-uprp-trademark-fees",
    query: "opłaty zgłoszeniowe znaki towarowe UPRP",
  },
  {
    id: "pl-trademark-classification-name",
    targetId: "pl-uprp-trademark-classification",
    query: "Klasyfikacja nicejska towary usługi UPRP",
  },
  {
    id: "pl-trademark-guidelines-name",
    targetId: "pl-uprp-trademark-guidelines",
    query: "wytyczne znaki towarowe Prezesa UPRP",
  },
  {
    id: "pl-trademark-law-proceedings-name",
    targetId: "pl-uprp-trademark-law-proceedings",
    query: "Prawo własności przemysłowej procedura sprzeciwowa znak towarowy",
  },
'''
retrieval = replace_once(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    poland_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    "retrieval Poland probes",
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace("toHaveLength(183)", "toHaveLength(190)", 2)
retrieval_test = retrieval_test.replace("toBe(\n      183,\n", "toBe(\n      190,\n", 1)
retrieval_test = replace_once(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "PT", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "PT", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "PL", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    "retrieval test Poland jurisdiction",
)
retrieval_test_path.write_text(retrieval_test)

print("Poland UPRP source coverage patch applied")
