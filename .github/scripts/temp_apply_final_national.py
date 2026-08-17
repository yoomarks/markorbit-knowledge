from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"marker not found in {path}: {old[:140]}")
    file.write_text(text.replace(old, new, 1))


coverage_path = "packages/persistence/src/priority-national-source-coverage.ts"
coverage = Path(coverage_path).read_text()
marker = "const CIPO: Authority = {"
if marker not in coverage:
    raise SystemExit("CIPO insertion marker not found")

block = r'''
const OCPI_CU: Authority = {
  jurisdiction: "CU",
  authorityName: "Cuban Industrial Property Office (OCPI)",
  languages: ["es"],
  verificationEvidenceUri: "https://www.ocpi.cu/",
};

export const OCPI_CU_SOURCE_COVERAGE_TARGETS = [
  target(OCPI_CU, {
    id: "cu-ocpi-portal",
    family: "PORTAL",
    displayName: "Cuban Industrial Property Office Portal",
    canonicalUri: "https://www.ocpi.cu/",
    verificationEvidenceUri: "https://www.ocpi.cu/",
  }),
  target(OCPI_CU, {
    id: "cu-ocpi-trademarks",
    family: "FILING",
    displayName: "OCPI Trademark Services",
    canonicalUri: "https://www.ocpi.cu/marcas/",
    verificationEvidenceUri: "https://www.ocpi.cu/",
    notes:
      "Official OCPI trademark service route retained as the national filing and registration entrypoint.",
  }),
  target(OCPI_CU, {
    id: "cu-ocpi-trademark-search",
    family: "SEARCH",
    displayName: "OCPI Trademark Search Services",
    canonicalUri: "https://www.ocpi.cu/smarcas/",
    verificationEvidenceUri: "https://www.ocpi.cu/",
    notes:
      "Official OCPI trademark-search service route; the office site is crawler-light, so the OCPI root is retained as verification evidence.",
  }),
  target(OCPI_CU, {
    id: "cu-ocpi-fees-2021",
    family: "FEES",
    displayName: "Cuba OCPI Tariffs – Resolution No. 112 of 2021",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/21650",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/21650",
    notes: "Latest WIPO Lex tariff resolution specifically governing fees applied by OCPI.",
  }),
  target(OCPI_CU, {
    id: "cu-trademark-decree-law-203",
    family: "LEGAL_TEXTS",
    displayName: "Cuba Decree-Law No. 203 on Trademarks and Other Distinctive Signs",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/897",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/897",
  }),
  target(OCPI_CU, {
    id: "cu-trademark-regulation-63-2000",
    family: "EXAMINATION_MANUAL",
    displayName: "Cuba Regulation of Decree-Law No. 203 – Resolution No. 63/2000",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/898",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/898",
  }),
] satisfies readonly SourceCoverageTarget[];

const BRELA_TZ: Authority = {
  jurisdiction: "TZ",
  authorityName: "Business Registrations and Licensing Agency of Tanzania (BRELA)",
  languages: ["sw", "en"],
  verificationEvidenceUri: "https://www.brela.go.tz/",
};

export const BRELA_TZ_SOURCE_COVERAGE_TARGETS = [
  target(BRELA_TZ, {
    id: "tz-brela-portal",
    family: "PORTAL",
    displayName: "Tanzania BRELA Portal",
    canonicalUri: "https://www.brela.go.tz/",
    verificationEvidenceUri: "https://www.brela.go.tz/",
  }),
  target(BRELA_TZ, {
    id: "tz-brela-trademark-filing",
    family: "FILING",
    displayName: "Tanzania Trade and Service Mark Registration Guidance",
    canonicalUri: "https://www.brela.go.tz/index.php/services/business-licence",
    verificationEvidenceUri: "https://www.brela.go.tz/index.php/services/business-licence",
    notes:
      "Current BRELA page describing trade/service mark filing criteria, documents, ORS steps and payment workflow despite its legacy URL slug.",
  }),
  target(BRELA_TZ, {
    id: "tz-brela-ors-trademarks",
    family: "SEARCH",
    displayName: "Tanzania BRELA Online Registration System",
    canonicalUri: "https://ors.brela.go.tz/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.brela.go.tz/index.php/services/business-licence",
    notes:
      "Official ORS entrypoint linked by BRELA for online trade/service mark operations and registry lookup workflow.",
  }),
  target(BRELA_TZ, {
    id: "tz-brela-trademark-fees",
    family: "FEES",
    displayName: "Tanzania Trade and Service Marks Fees",
    canonicalUri: "https://brela.go.tz/index.php/pages/trade-and-service-marks-fees",
    verificationEvidenceUri: "https://brela.go.tz/index.php/pages/trade-and-service-marks-fees",
  }),
  target(BRELA_TZ, {
    id: "tz-brela-trademark-act",
    family: "LEGAL_TEXTS",
    displayName: "Tanzania Trade and Service Marks Act",
    canonicalUri: "https://www.brela.go.tz/documents/acts",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.brela.go.tz/documents/acts",
    notes: "Current BRELA Acts collection includes the Trade and Service Marks Act.",
  }),
  target(BRELA_TZ, {
    id: "tz-brela-trademark-forms",
    family: "FILING",
    displayName: "Tanzania Trade and Service Mark Forms",
    canonicalUri: "https://www.brela.go.tz/documents/trade-marks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.brela.go.tz/documents/trade-marks",
    notes: "Official BRELA collection of trade/service mark application, fee and renewal forms.",
  }),
] satisfies readonly SourceCoverageTarget[];

const IAPI_AO: Authority = {
  jurisdiction: "AO",
  authorityName: "Angolan Institute of Industrial Property (IAPI)",
  languages: ["pt"],
  verificationEvidenceUri: "https://www.iapi.gov.ao/",
};

export const IAPI_AO_SOURCE_COVERAGE_TARGETS = [
  target(IAPI_AO, {
    id: "ao-iapi-portal",
    family: "PORTAL",
    displayName: "Angola IAPI Portal",
    canonicalUri: "https://www.iapi.gov.ao/",
    verificationEvidenceUri: "https://www.iapi.gov.ao/",
  }),
  target(IAPI_AO, {
    id: "ao-iapi-trademark-filing",
    family: "FILING",
    displayName: "Angola IAPI Trademark Registration",
    canonicalUri: "https://iapi.gov.ao/web/actos/68/marca-iapi",
    verificationEvidenceUri: "https://iapi.gov.ao/web/actos/68/marca-iapi",
  }),
  target(IAPI_AO, {
    id: "ao-iapi-prior-art-search",
    family: "SEARCH",
    displayName: "Angola IAPI Industrial Property Prior-Art Search",
    canonicalUri: "https://iapi.gov.ao/web/actos/87/busca-de-anterioridade",
    verificationEvidenceUri: "https://iapi.gov.ao/web/actos/87/busca-de-anterioridade",
  }),
  target(IAPI_AO, {
    id: "ao-iapi-fee-table",
    family: "FEES",
    displayName: "Angola Industrial Property Fee Table – Presidential Decree No. 62/20",
    canonicalUri: "https://iapi.gov.ao/web/documentos?page=2&type=Legisla%C3%A7%C3%A3o",
    verificationEvidenceUri: "https://iapi.gov.ao/web/documentos?page=2&type=Legisla%C3%A7%C3%A3o",
    notes:
      "Current IAPI legislation collection exposes Presidential Decree No. 62/20 containing the industrial-property fee table.",
  }),
  target(IAPI_AO, {
    id: "ao-industrial-property-law",
    family: "LEGAL_TEXTS",
    displayName: "Angola Industrial Property Law No. 3/92",
    canonicalUri: "https://iapi.gov.ao/web/documentos?type=Legisla%C3%A7%C3%A3o",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://iapi.gov.ao/web/documentos?type=Legisla%C3%A7%C3%A3o",
  }),
  target(IAPI_AO, {
    id: "ao-gue-iapi-filing-requirements",
    family: "EXAMINATION_MANUAL",
    displayName: "Angola GUE IAPI Marks and Patents Requirements",
    canonicalUri: "https://gue.gov.ao/sigue2/marcas-e-patentes-iapi",
    verificationEvidenceUri: "https://gue.gov.ao/sigue2/marcas-e-patentes-iapi",
    notes:
      "Official government one-stop service detailing IAPI filing documents, mark requirements, phases, forms and fee links.",
  }),
] satisfies readonly SourceCoverageTarget[];

const IPI_MZ: Authority = {
  jurisdiction: "MZ",
  authorityName: "Industrial Property Institute of Mozambique (IPI)",
  languages: ["pt"],
  verificationEvidenceUri: "https://www.ipi.gov.mz/",
};

export const IPI_MZ_SOURCE_COVERAGE_TARGETS = [
  target(IPI_MZ, {
    id: "mz-ipi-portal",
    family: "PORTAL",
    displayName: "Mozambique Industrial Property Institute Portal",
    canonicalUri: "https://www.ipi.gov.mz/",
    verificationEvidenceUri: "https://www.ipi.gov.mz/",
  }),
  target(IPI_MZ, {
    id: "mz-ipi-trademark-forms",
    family: "FILING",
    displayName: "Mozambique IPI Industrial Property Forms",
    canonicalUri: "https://ipi.gov.mz/minutas-e-formularios",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://ipi.gov.mz/minutas-e-formularios",
    notes: "Official forms collection includes trademark registration and renewal forms.",
  }),
  target(IPI_MZ, {
    id: "mz-ipi-search-request",
    family: "SEARCH",
    displayName: "Mozambique IPI Industrial Property Search Request",
    canonicalUri: "https://www.ipi.gov.mz/index.php/minutas-e-formularios/184-formulario-de-pedido-de-pesquisa",
    verificationEvidenceUri: "https://www.ipi.gov.mz/index.php/minutas-e-formularios/184-formulario-de-pedido-de-pesquisa",
  }),
  target(IPI_MZ, {
    id: "mz-ipi-current-fees",
    family: "FEES",
    displayName: "Mozambique IPI Current Industrial Property Fees Notice",
    canonicalUri: "https://ipi.gov.mz/homepage/377-aviso",
    verificationEvidenceUri: "https://ipi.gov.mz/homepage/377-aviso",
    notes:
      "Official notice identifies Ministerial Diploma No. 154/2023 as the new industrial-property fee schedule effective February 2024.",
  }),
  target(IPI_MZ, {
    id: "mz-industrial-property-code-47-2015",
    family: "LEGAL_TEXTS",
    displayName: "Mozambique Industrial Property Code – Decree No. 47/2015",
    canonicalUri: "https://www.ipi.gov.mz/item/151/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.ipi.gov.mz/item/151/",
  }),
  target(IPI_MZ, {
    id: "mz-ipi-rights-maintenance-guidance",
    family: "EXAMINATION_MANUAL",
    displayName: "Mozambique IPI Industrial Property Rights Maintenance Guidance",
    canonicalUri:
      "https://ipi.gov.mz/homepage/320-mecanismos-de-manutencao-de-direitos-da-propriedade-industrial",
    verificationEvidenceUri:
      "https://ipi.gov.mz/homepage/320-mecanismos-de-manutencao-de-direitos-da-propriedade-industrial",
    notes:
      "Official IPI operational guidance for maintaining registered industrial-property rights; current fees remain sourced separately.",
  }),
] satisfies readonly SourceCoverageTarget[];

const PACRA_ZM: Authority = {
  jurisdiction: "ZM",
  authorityName: "Patents and Companies Registration Agency of Zambia (PACRA)",
  languages: ["en"],
  verificationEvidenceUri: "https://www.pacra.org.zm/",
};

export const PACRA_ZM_SOURCE_COVERAGE_TARGETS = [
  target(PACRA_ZM, {
    id: "zm-pacra-portal",
    family: "PORTAL",
    displayName: "Zambia PACRA Intellectual Property Portal",
    canonicalUri: "https://www.pacra.org.zm/",
    verificationEvidenceUri: "https://www.pacra.org.zm/",
  }),
  target(PACRA_ZM, {
    id: "zm-pacra-ip-online",
    family: "FILING",
    displayName: "Zambia PACRA IP Online",
    canonicalUri: "https://www.pacra.org.zm/ip-online",
    verificationEvidenceUri: "https://www.pacra.org.zm/",
    notes:
      "Official trademark-filing quick link currently points to the PACRA IP Online surface, which is being migrated to a new platform.",
  }),
  target(PACRA_ZM, {
    id: "zm-pacra-tmview-search",
    family: "SEARCH",
    displayName: "Zambia PACRA-Linked TMView Trademark Search",
    canonicalUri: "https://www.tmdn.org/tmview/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.pacra.org.zm/",
    notes: "PACRA's current official homepage links TMView directly as its trademark-search resource.",
  }),
  target(PACRA_ZM, {
    id: "zm-pacra-forms-fees",
    family: "FEES",
    displayName: "Zambia PACRA Forms and Fees",
    canonicalUri: "https://www.pacra.org.zm/fees-and-forms",
    verificationEvidenceUri: "https://www.pacra.org.zm/fees-and-forms",
    notes: "Current PACRA forms-and-fees catalogue for online and walk-in services.",
  }),
  target(PACRA_ZM, {
    id: "zm-trade-marks-act-2023",
    family: "LEGAL_TEXTS",
    displayName: "Zambia Trade Marks Act 2023",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/22407",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/22407",
    notes: "Current Trade Marks Act, operational from 31 December 2025.",
  }),
  target(PACRA_ZM, {
    id: "zm-pacra-nice-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Zambia PACRA Nice Classification",
    canonicalUri: "https://www.pacra.org.zm/classifications",
    verificationEvidenceUri: "https://www.pacra.org.zm/classifications",
    notes: "Current PACRA classification resource includes the Nice Classification for trademarks.",
  }),
] satisfies readonly SourceCoverageTarget[];

const CIPZ_ZW: Authority = {
  jurisdiction: "ZW",
  authorityName: "Companies and Intellectual Property Office of Zimbabwe (CIPZ)",
  languages: ["en"],
  verificationEvidenceUri:
    "https://opcbyometro.gov.zw/deeds-companies-and-intellectual-property-information/",
};

export const CIPZ_ZW_SOURCE_COVERAGE_TARGETS = [
  target(CIPZ_ZW, {
    id: "zw-cipz-government-portal",
    family: "PORTAL",
    displayName: "Zimbabwe Government CIPZ Information",
    canonicalUri:
      "https://opcbyometro.gov.zw/deeds-companies-and-intellectual-property-information/",
    verificationEvidenceUri:
      "https://opcbyometro.gov.zw/deeds-companies-and-intellectual-property-information/",
    notes:
      "Zimbabwe government page identifying the Companies and Intellectual Property Office and its official website.",
  }),
  target(CIPZ_ZW, {
    id: "zw-cipz-filing-portal",
    family: "FILING",
    displayName: "Companies and Intellectual Property Office of Zimbabwe Portal",
    canonicalUri: "https://www.cipz.gov.zw/",
    verificationEvidenceUri:
      "https://opcbyometro.gov.zw/deeds-companies-and-intellectual-property-information/",
  }),
  target(CIPZ_ZW, {
    id: "zw-trade-marks-act-current",
    family: "LEGAL_TEXTS",
    displayName: "Zimbabwe Trade Marks Act Chapter 26:04",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/18709",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/18709",
  }),
  target(CIPZ_ZW, {
    id: "zw-trade-mark-regulations-2005",
    family: "EXAMINATION_MANUAL",
    displayName: "Zimbabwe Trade Mark Regulations 2005",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/8943",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/8943",
    notes:
      "WIPO Lex implementing regulations covering filing, examination, register operations, searches, forms and schedules.",
  }),
  target(CIPZ_ZW, {
    id: "zw-trade-mark-regulations-fees",
    family: "FEES",
    displayName: "Zimbabwe Trade Mark Regulations Fee Schedule",
    canonicalUri: "https://www.wipo.int/wipolex/en/text/215254",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/8943",
    notes: "WIPO Lex text exposes the First Schedule of trademark fees in the regulations.",
  }),
  target(CIPZ_ZW, {
    id: "zw-trademark-search-regulations",
    family: "SEARCH",
    displayName: "Zimbabwe Trade Mark Register Search Provisions",
    canonicalUri: "https://wipolex-res.wipo.int/edocs/lexdocs/laws/en/zw/zw032en.html",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/8943",
    notes: "Official WIPO-hosted regulations text includes the national trademark-search provisions.",
  }),
] satisfies readonly SourceCoverageTarget[];

const DPI_CD: Authority = {
  jurisdiction: "CD",
  authorityName: "Direction de la Propriété Industrielle, Ministry of Industry of the DRC",
  languages: ["fr"],
  verificationEvidenceUri: "https://industrie.gouv.cd/",
};

export const DPI_CD_SOURCE_COVERAGE_TARGETS = [
  target(DPI_CD, {
    id: "cd-industry-ministry-portal",
    family: "PORTAL",
    displayName: "DRC Ministry of Industry Portal",
    canonicalUri: "https://industrie.gouv.cd/",
    verificationEvidenceUri: "https://industrie.gouv.cd/",
  }),
  target(DPI_CD, {
    id: "cd-industrial-property-authority",
    family: "FILING",
    displayName: "DRC Ministry Industrial Property Mandate",
    canonicalUri: "https://industrie.gouv.cd/le-ministere/mission-et-vision/",
    verificationEvidenceUri: "https://industrie.gouv.cd/le-ministere/mission-et-vision/",
    notes:
      "Official Ministry mandate confirms responsibility for industrial property, including trademarks, and is retained as the national office entrypoint where no dedicated filing portal is publicly exposed.",
  }),
  target(DPI_CD, {
    id: "cd-wipo-national-ip-office-profile",
    family: "SEARCH",
    displayName: "WIPO DRC National IP Office and Statistics Profile",
    canonicalUri: "https://www.wipo.int/fr/web/country-profiles/CD",
    verificationEvidenceUri: "https://www.wipo.int/fr/web/country-profiles/CD",
    notes:
      "WIPO country profile identifies the Direction de la propriété industrielle as the national IP office and exposes trademark statistics and office coordinates.",
  }),
  target(DPI_CD, {
    id: "cd-official-journal-fee-order-search",
    family: "FEES",
    displayName: "DRC Official Journal Search for Industrial Property Fee Orders",
    canonicalUri: "https://journalofficiel.cd/rech/5/1",
    verificationEvidenceUri: "https://www.journalofficiel.cd/",
    notes:
      "Official Journal search surface retained to acquire current Ministry of Industry fee orders and their annexed industrial-property tariffs rather than copying rates into Knowledge.",
  }),
  target(DPI_CD, {
    id: "cd-industrial-property-law-82-001",
    family: "LEGAL_TEXTS",
    displayName: "DRC Law No. 82-001 on Industrial Property",
    canonicalUri: "https://www.wipo.int/wipolex/fr/legislation/details/7499",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/fr/legislation/details/7499",
  }),
  target(DPI_CD, {
    id: "cd-industrial-property-law-filing-text",
    family: "EXAMINATION_MANUAL",
    displayName: "DRC Industrial Property Law – WIPO Full Text Filing Provisions",
    canonicalUri:
      "https://wipolex-res.wipo.int/edocs/lexdocs/laws/en/cd/cd002en.html",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/fr/legislation/details/7499",
    notes:
      "Official WIPO-hosted full text contains trademark filing, registration, publication, renewal and payment requirements under Law No. 82-001.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
Path(coverage_path).write_text(coverage.replace(marker, block + marker, 1))

replace_once(
    coverage_path,
    "  ...IPO_TT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...IPO_TT_SOURCE_COVERAGE_TARGETS,\n  ...OCPI_CU_SOURCE_COVERAGE_TARGETS,\n  ...BRELA_TZ_SOURCE_COVERAGE_TARGETS,\n  ...IAPI_AO_SOURCE_COVERAGE_TARGETS,\n  ...IPI_MZ_SOURCE_COVERAGE_TARGETS,\n  ...PACRA_ZM_SOURCE_COVERAGE_TARGETS,\n  ...CIPZ_ZW_SOURCE_COVERAGE_TARGETS,\n  ...DPI_CD_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
)

jurisdiction_path = "packages/persistence/src/priority-trademark-jurisdictions.ts"
text = Path(jurisdiction_path).read_text()
for code in ["CU", "TZ", "AO", "MZ", "ZM", "ZW", "CD"]:
    token = f'["{code}",'
    pos = text.find(token)
    if pos < 0:
        raise SystemExit(f"jurisdiction {code} not found")
    line_end = text.find("\n", pos)
    line = text[pos:line_end]
    if '"TARGET"' not in line:
        raise SystemExit(f"jurisdiction {code} is not TARGET: {line}")
    text = text[:pos] + line.replace('"TARGET"', '"CURATED"', 1) + text[line_end:]
Path(jurisdiction_path).write_text(text)

probes_path = "packages/persistence/src/retrieval-relevance-audit.ts"
probes = Path(probes_path).read_text()
probe_marker = "] satisfies readonly RetrievalRelevanceProbe[];"
if probe_marker not in probes:
    raise SystemExit("retrieval probe marker not found")

entries = [
    ("cu-ocpi-portal", "Cuba OCPI industrial property office trademarks"),
    ("cu-ocpi-trademarks", "Cuba OCPI trademark registration filing"),
    ("cu-ocpi-trademark-search", "Cuba OCPI trademark search service"),
    ("cu-ocpi-fees-2021", "Cuba OCPI Resolution 112 2021 tariffs fees"),
    ("cu-trademark-decree-law-203", "Cuba Decree Law 203 trademarks distinctive signs"),
    ("cu-trademark-regulation-63-2000", "Cuba Resolution 63 2000 trademark regulation"),
    ("tz-brela-portal", "Tanzania BRELA trade service marks portal"),
    ("tz-brela-trademark-filing", "Tanzania BRELA trade service mark registration filing"),
    ("tz-brela-ors-trademarks", "Tanzania BRELA ORS trademark online registry"),
    ("tz-brela-trademark-fees", "Tanzania BRELA trade service marks fees"),
    ("tz-brela-trademark-act", "Tanzania Trade and Service Marks Act BRELA"),
    ("tz-brela-trademark-forms", "Tanzania BRELA trade service mark forms TM SM"),
    ("ao-iapi-portal", "Angola IAPI industrial property portal"),
    ("ao-iapi-trademark-filing", "Angola IAPI trademark registration marca"),
    ("ao-iapi-prior-art-search", "Angola IAPI prior art trademark search"),
    ("ao-iapi-fee-table", "Angola IAPI Presidential Decree 62 20 industrial property fees"),
    ("ao-industrial-property-law", "Angola Law 3 92 industrial property trademarks"),
    ("ao-gue-iapi-filing-requirements", "Angola GUE IAPI marks patents requirements"),
    ("mz-ipi-portal", "Mozambique IPI industrial property portal"),
    ("mz-ipi-trademark-forms", "Mozambique IPI trademark registration forms"),
    ("mz-ipi-search-request", "Mozambique IPI industrial property search request"),
    ("mz-ipi-current-fees", "Mozambique IPI Ministerial Diploma 154 2023 fees"),
    ("mz-industrial-property-code-47-2015", "Mozambique Industrial Property Code Decree 47 2015"),
    ("mz-ipi-rights-maintenance-guidance", "Mozambique IPI industrial property rights maintenance"),
    ("zm-pacra-portal", "Zambia PACRA intellectual property trademarks"),
    ("zm-pacra-ip-online", "Zambia PACRA trademark filing IP Online"),
    ("zm-pacra-tmview-search", "Zambia PACRA TMView trademark search"),
    ("zm-pacra-forms-fees", "Zambia PACRA trademark forms fees"),
    ("zm-trade-marks-act-2023", "Zambia Trade Marks Act 2023"),
    ("zm-pacra-nice-classification", "Zambia PACRA Nice trademark classification"),
    ("zw-cipz-government-portal", "Zimbabwe Companies Intellectual Property Office government"),
    ("zw-cipz-filing-portal", "Zimbabwe CIPZ trademark filing portal"),
    ("zw-trade-marks-act-current", "Zimbabwe Trade Marks Act Chapter 26 04"),
    ("zw-trade-mark-regulations-2005", "Zimbabwe Trade Mark Regulations 2005"),
    ("zw-trade-mark-regulations-fees", "Zimbabwe trademark regulations fee schedule"),
    ("zw-trademark-search-regulations", "Zimbabwe trademark register search regulations"),
    ("cd-industry-ministry-portal", "DRC Ministry Industry industrial property"),
    ("cd-industrial-property-authority", "DRC Direction propriété industrielle Ministry trademarks"),
    ("cd-wipo-national-ip-office-profile", "DRC WIPO national IP office trademark profile"),
    ("cd-official-journal-fee-order-search", "DRC official journal industrial property fee order"),
    ("cd-industrial-property-law-82-001", "DRC Law 82 001 industrial property trademarks"),
    ("cd-industrial-property-law-filing-text", "DRC industrial property law trademark filing registration"),
]
probe_block = "".join(
    f'  {{\n    id: "{target_id}-name",\n    targetId: "{target_id}",\n    query: "{query}",\n  }},\n'
    for target_id, query in entries
)
Path(probes_path).write_text(probes.replace(probe_marker, probe_block + probe_marker, 1))

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
replace_once(
    catalog_path,
    "  IPO_TT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  IPO_TT_SOURCE_COVERAGE_TARGETS,\n  OCPI_CU_SOURCE_COVERAGE_TARGETS,\n  BRELA_TZ_SOURCE_COVERAGE_TARGETS,\n  IAPI_AO_SOURCE_COVERAGE_TARGETS,\n  IPI_MZ_SOURCE_COVERAGE_TARGETS,\n  PACRA_ZM_SOURCE_COVERAGE_TARGETS,\n  CIPZ_ZW_SOURCE_COVERAGE_TARGETS,\n  DPI_CD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
)
replace_once(
    catalog_path,
    "  IPO_TT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  IPO_TT_SOURCE_COVERAGE_TARGETS,\n  OCPI_CU_SOURCE_COVERAGE_TARGETS,\n  BRELA_TZ_SOURCE_COVERAGE_TARGETS,\n  IAPI_AO_SOURCE_COVERAGE_TARGETS,\n  IPI_MZ_SOURCE_COVERAGE_TARGETS,\n  PACRA_ZM_SOURCE_COVERAGE_TARGETS,\n  CIPZ_ZW_SOURCE_COVERAGE_TARGETS,\n  DPI_CD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
)

source_test = "packages/persistence/tests/priority-national-source-coverage.test.ts"
replace_once(
    source_test,
    "  IPO_TT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  IPO_TT_SOURCE_COVERAGE_TARGETS,\n  OCPI_CU_SOURCE_COVERAGE_TARGETS,\n  BRELA_TZ_SOURCE_COVERAGE_TARGETS,\n  IAPI_AO_SOURCE_COVERAGE_TARGETS,\n  IPI_MZ_SOURCE_COVERAGE_TARGETS,\n  PACRA_ZM_SOURCE_COVERAGE_TARGETS,\n  CIPZ_ZW_SOURCE_COVERAGE_TARGETS,\n  DPI_CD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
)
replace_once(
    source_test,
    '  ["TT", IPO_TT_SOURCE_COVERAGE_TARGETS, ["ipo.gov.tt"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["TT", IPO_TT_SOURCE_COVERAGE_TARGETS, ["ipo.gov.tt"]],\n  ["CU", OCPI_CU_SOURCE_COVERAGE_TARGETS, ["ocpi.cu", "wipo.int"]],\n  ["TZ", BRELA_TZ_SOURCE_COVERAGE_TARGETS, ["brela.go.tz"]],\n  ["AO", IAPI_AO_SOURCE_COVERAGE_TARGETS, ["iapi.gov.ao", "gue.gov.ao"]],\n  ["MZ", IPI_MZ_SOURCE_COVERAGE_TARGETS, ["ipi.gov.mz"]],\n  ["ZM", PACRA_ZM_SOURCE_COVERAGE_TARGETS, ["pacra.org.zm", "tmdn.org", "wipo.int"]],\n  ["ZW", CIPZ_ZW_SOURCE_COVERAGE_TARGETS, ["gov.zw", "cipz.gov.zw", "wipo.int"]],\n  ["CD", DPI_CD_SOURCE_COVERAGE_TARGETS, ["industrie.gouv.cd", "journalofficiel.cd", "wipo.int"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
)
replace_once(source_test, "one hundred nine priority national offices", "one hundred sixteen priority national offices")
replace_once(source_test, "toHaveLength(824)", "toHaveLength(866)")
replace_once(source_test, "      824,\n", "      866,\n")
replace_once(source_test, "    ).toBe(824);", "    ).toBe(866);")

jurisdiction_test = "packages/persistence/tests/priority-trademark-jurisdictions.test.ts"
replace_once(jurisdiction_test, "expect(curated).toHaveLength(110);", "expect(curated).toHaveLength(117);")
replace_once(jurisdiction_test, "expect(target).toHaveLength(10);", "expect(target).toHaveLength(3);")

relevance_test = "packages/persistence/tests/retrieval-relevance-audit.test.ts"
replace_once(relevance_test, "expect(targets).toHaveLength(773);", "expect(targets).toHaveLength(815);")
replace_once(
    relevance_test,
    "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(773);",
    "expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(815);",
)
replace_once(relevance_test, "      773,\n", "      815,\n")
