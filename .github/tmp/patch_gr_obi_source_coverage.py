from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
retrieval_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
retrieval_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")


def replace_first(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"{label}: anchor not found")
    return text.replace(old, new, 1)


priority = priority_path.read_text()
greece_block = '''const OBI_GR: Authority = {
  jurisdiction: "GR",
  authorityName: "Hellenic Industrial Property Organisation (OBI)",
  languages: ["el-GR", "en"],
  verificationEvidenceUri: "https://www.obi.gr/en/trademarks/",
};

export const OBI_GR_SOURCE_COVERAGE_TARGETS = [
  target(OBI_GR, {
    id: "gr-obi-trademarks",
    family: "PORTAL",
    displayName: "OBI Trade Marks",
    canonicalUri: "https://www.obi.gr/en/trademarks/",
    verificationEvidenceUri: "https://www.obi.gr/en/trademarks/",
    notes:
      "OBI is the sole competent authority for trademark registration in Greece and maintains the official National Trademark Register under Law 4796/2021 and Law 4679/2020.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-filing",
    family: "FILING",
    displayName: "Greece OBI Electronic Trademark Filing",
    canonicalUri:
      "https://www.gov.gr/en/ipiresies/epikheirematike-drasterioteta/adeiodoteseis-kai-summorphose/elektronike-katathese-emporikou-sematos",
    entrypoints: [
      {
        uri: "https://www.gov.gr/en/ipiresies/epikheirematike-drasterioteta/adeiodoteseis-kai-summorphose/elektronike-katathese-emporikou-sematos",
        label: "Gov.gr trademark filing service",
      },
      {
        uri: "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/ethnika-simata/online-trade-marks-filing/",
        label: "OBI online filing guidance",
      },
      { uri: "https://tmfo.obi.gr/", label: "OBI trademark e-filing system" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri:
      "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/ethnika-simata/online-trade-marks-filing/",
    notes:
      "Current OBI/gov.gr filing guidance requires TAXIS credentials, filing documents and a Nice-classified goods/services list; the National Administrative Procedures Register was updated in July 2026.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-search",
    family: "SEARCH",
    displayName: "OBI Trademark Availability Check",
    canonicalUri:
      "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/trade-marks-availability-check/",
    entrypoints: [
      {
        uri: "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/trade-marks-availability-check/",
        label: "OBI official availability-check guidance",
      },
      { uri: "https://www.obi.gr/en/trademarks/", label: "National Trademark Register status guidance" },
    ],
    verificationEvidenceUri:
      "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/trade-marks-availability-check/",
    notes:
      "OBI recommends TMview for prior-mark availability searching but explicitly states that TMview is informational rather than the binding National Trademark Register; results should be verified against the official register maintained by OBI.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-fees",
    family: "FEES",
    displayName: "OBI Trademark Fees",
    canonicalUri: "https://www.obi.gr/teli/teli-emporikon-simaton/",
    entrypoints: [
      { uri: "https://www.obi.gr/en/trademarks/fees/", label: "English trademark fees guidance" },
      { uri: "https://www.obi.gr/teli/teli-emporikon-simaton/", label: "Detailed trademark fee table" },
    ],
    verificationEvidenceUri: "https://www.obi.gr/teli/teli-emporikon-simaton/",
    notes:
      "The current OBI fee table publishes electronic and paper filing, additional-class, renewal, assignment, licence, opposition/appeal and other trademark proceeding fees.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "OBI Trademark Classification Classes",
    canonicalUri: "https://www.obi.gr/emporika-simata/taxinomisi-simaton-klaseis/",
    entrypoints: [
      {
        uri: "https://www.obi.gr/emporika-simata/taxinomisi-simaton-klaseis/",
        label: "Current Greek trademark classification page",
      },
      {
        uri: "https://www.obi.gr/en/trademarks/trade-marks-classification-classes/",
        label: "English trademark class guidance",
      },
      {
        uri: "https://www.obi.gr/en/trademarks/trade-mark-registration-procedure/ethnika-simata/online-trade-marks-filing/",
        label: "TMclass and acceptable-term filing guidance",
      },
    ],
    verificationEvidenceUri: "https://www.obi.gr/emporika-simata/taxinomisi-simaton-klaseis/",
    notes:
      "OBI's current classification page announces Nice Classification 13th Edition effective from 1 January 2026; its e-filing guidance recommends TMclass acceptable terminology and explains class-heading scope.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "OBI Trademark Legislation",
    canonicalUri: "https://www.obi.gr/en/trademarks/related-legislation-trademarks/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.obi.gr/en/trademarks/related-legislation-trademarks/",
    notes:
      "The official trademark legislation page publishes Law 4679/2020 and current OBI guidance spanning filing, registration, opposition and cancellation procedures.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "OBI Administrative Committee of Trademarks Proceedings",
    canonicalUri: "https://www.obi.gr/emporika-simata/dioikitiki-epitropi-simaton/",
    entrypoints: [
      {
        uri: "https://www.obi.gr/emporika-simata/dioikitiki-epitropi-simaton/",
        label: "Administrative Committee of Trademarks",
      },
      {
        uri: "https://www.obi.gr/emporika-simata/dioikitiki-epitropi-simaton/ekthemata/",
        label: "2026 committee hearing exhibits and schedules",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.obi.gr/emporika-simata/dioikitiki-epitropi-simaton/",
    notes:
      "The Administrative Committee handles trademark oppositions, appeals, interventions and applications under Law 4679/2020; the official site publishes 2026 hearing schedules and exhibits.",
  }),
  target(OBI_GR, {
    id: "gr-obi-trademark-decisions",
    family: "OFFICIAL_GAZETTE",
    displayName: "Greece Official Trademark Registration Decisions",
    canonicalUri:
      "https://www.gov.gr/en/upourgeia/upourgeio-anaptuxes/organismos-biomekhanikes-idioktesias-obi/apophaseis-katokhuroses-emporikon-sematon",
    entrypoints: [
      {
        uri: "https://www.gov.gr/en/upourgeia/upourgeio-anaptuxes/organismos-biomekhanikes-idioktesias-obi/apophaseis-katokhuroses-emporikon-sematon",
        label: "Gov.gr trademark registration decisions service",
      },
      {
        uri: "https://www.obi.gr/emporika-simata/dioikitiki-epitropi-simaton/ekthemata/",
        label: "Current Administrative Committee hearing exhibits",
      },
    ],
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF"],
    verificationEvidenceUri:
      "https://www.gov.gr/en/upourgeia/upourgeio-anaptuxes/organismos-biomekhanikes-idioktesias-obi/apophaseis-katokhuroses-emporikon-sematon",
    notes:
      "Gov.gr exposes a current OBI service for examiner and Administrative Committee trademark-registration decisions; together with current committee exhibits it provides a high-value official change signal for newly issued decisions and contested matters.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', greece_block + 'const CIPO: Authority = {', 'insert Greece block')
priority = replace_first(
    priority,
    '  ...SIPO_SI_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...SIPO_SI_SOURCE_COVERAGE_TARGETS,\n  ...OBI_GR_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Greece targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  SIPO_SI_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  SIPO_SI_SOURCE_COVERAGE_TARGETS,\n  OBI_GR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Greece targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Greece targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  SIPO_SI_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  SIPO_SI_SOURCE_COVERAGE_TARGETS,\n  OBI_GR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Greece targets',
)
priority_test = replace_first(
    priority_test,
    '  ["SI", SIPO_SI_SOURCE_COVERAGE_TARGETS, ["gov.si", "uil-sipo.si", "pisrs.si"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["SI", SIPO_SI_SOURCE_COVERAGE_TARGETS, ["gov.si", "uil-sipo.si", "pisrs.si"]],\n  ["GR", OBI_GR_SOURCE_COVERAGE_TARGETS, ["obi.gr", "gov.gr"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Greece authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for thirty-one priority national offices',
    'ships explicit, official, unique coverage for thirty-two priority national offices',
    'priority office count label',
)
priority_test = priority_test.replace('toHaveLength(236)', 'toHaveLength(244)', 1)
priority_test = priority_test.replace('      236,\n', '      244,\n', 1)
priority_test = priority_test.replace('    ).toBe(236);', '    ).toBe(244);', 1)
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
greece_probes = '''  {
    id: "gr-trademarks-name",
    targetId: "gr-obi-trademarks",
    query: "Greece OBI National Trademark Register trademarks",
  },
  {
    id: "gr-trademark-filing-name",
    targetId: "gr-obi-trademark-filing",
    query: "Greece OBI electronic trademark filing TAXIS Nice classes",
  },
  {
    id: "gr-trademark-search-name",
    targetId: "gr-obi-trademark-search",
    query: "Greece OBI trademark availability check TMview national register",
  },
  {
    id: "gr-trademark-fees-name",
    targetId: "gr-obi-trademark-fees",
    query: "Greece OBI trademark fees filing additional class opposition renewal",
  },
  {
    id: "gr-trademark-classification-name",
    targetId: "gr-obi-trademark-classification",
    query: "Greece OBI Nice Classification 13 2026 TMclass",
  },
  {
    id: "gr-trademark-law-name",
    targetId: "gr-obi-trademark-law",
    query: "Greece trademark Law 4679 2020 OBI legislation",
  },
  {
    id: "gr-trademark-proceedings-name",
    targetId: "gr-obi-trademark-proceedings",
    query: "Greece OBI Administrative Committee trademarks opposition appeals 2026",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    greece_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Greece retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = retrieval_test.replace('expect(targets).toHaveLength(239);', 'expect(targets).toHaveLength(246);', 1)
retrieval_test = retrieval_test.replace('expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(239);', 'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(246);', 1)
retrieval_test = retrieval_test.replace('      239,\n', '      246,\n', 1)
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "SI", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    '''    expect(
      listSourceCoverageTargets({ jurisdiction: "SI", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
    expect(
      listSourceCoverageTargets({ jurisdiction: "GR", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
''',
    'retrieval test Greece jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
