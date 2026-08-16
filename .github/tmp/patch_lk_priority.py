from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '\nconst CIPO: Authority = {'
if anchor not in text:
    raise SystemExit('CIPO anchor not found')
block = r'''

const NIPO_LK: Authority = {
  jurisdiction: "LK",
  authorityName: "National Intellectual Property Office of Sri Lanka (NIPO)",
  languages: ["en-US", "si-LK", "ta-LK"],
  verificationEvidenceUri: "https://www.nipo.gov.lk/web/index.php?lang=en",
};

export const NIPO_LK_SOURCE_COVERAGE_TARGETS = [
  target(NIPO_LK, {
    id: "lk-nipo-trademarks",
    family: "PORTAL",
    displayName: "Sri Lanka NIPO Trademark Portal",
    canonicalUri: "https://www.nipo.gov.lk/web/index.php?lang=en",
    entrypoints: [
      { uri: "https://www.nipo.gov.lk/web/index.php?lang=en", label: "NIPO official portal" },
      {
        uri: "https://www.nipo.gov.lk/web/index.php?Itemid=101&id=10&lang=en&option=com_content&view=category",
        label: "Trademark service and procedure section",
      },
    ],
    verificationEvidenceUri: "https://www.nipo.gov.lk/web/index.php?lang=en",
    notes:
      "NIPO administers Sri Lanka's intellectual-property system under the Intellectual Property Act and exposes trademark procedures, forms, fees, legal materials, public search and operational updates from the official portal.",
  }),
  target(NIPO_LK, {
    id: "lk-nipo-trademark-filing",
    family: "FILING",
    displayName: "Sri Lanka NIPO Trademark Registration Procedure",
    canonicalUri:
      "https://www.nipo.gov.lk/web/index.php?Itemid=101&id=10&lang=en&option=com_content&view=category",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.nipo.gov.lk/web/index.php?Itemid=101&id=10&lang=en&option=com_content&view=category",
    notes:
      "NIPO's trademark procedure explains filing on Form M1, examination under the Act, refusal/hearing routes, Gazette publication, the opposition period, inquiry and registration workflow.",
  }),
  target(NIPO_LK, {
    id: "lk-nipo-trademark-search",
    family: "SEARCH",
    displayName: "Sri Lanka NIPO Online Public Search",
    canonicalUri: "https://nipo.lk.wipo.net/",
    entrypoints: [
      { uri: "https://nipo.lk.wipo.net/", label: "NIPO online public IP database" },
      {
        uri: "https://nipo.gov.lk/web/index.php?Itemid=155&catid=13%3Aevent-calendar&id=234%3Anipo-online-public-search&lang=en&option=com_content&view=article",
        label: "NIPO official announcement linking the free public database",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri:
      "https://nipo.gov.lk/web/index.php?Itemid=155&catid=13%3Aevent-calendar&id=234%3Anipo-online-public-search&lang=en&option=com_content&view=article",
    notes:
      "NIPO's current official site announces a free Online Public Search and directs users to the WIPO-hosted Sri Lanka NIPO database.",
  }),
  target(NIPO_LK, {
    id: "lk-nipo-trademark-forms",
    family: "STATUS_AND_DOCUMENTS",
    displayName: "Sri Lanka NIPO Trademark Application and Post-Filing Forms",
    canonicalUri:
      "https://www.nipo.gov.lk/web/index.php?Itemid=158&id=39&lang=en&option=com_content&view=article",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.nipo.gov.lk/web/index.php?Itemid=158&id=39&lang=en&option=com_content&view=article",
    notes:
      "NIPO publishes official trademark forms including M01 registration, M02 opposition, publication payments, renewal and assignment/transmission/license recordal forms in available language versions.",
  }),
  target(NIPO_LK, {
    id: "lk-nipo-trademark-fees",
    family: "FEES",
    displayName: "Sri Lanka NIPO Trademark Fee Schedule",
    canonicalUri:
      "https://www.nipo.gov.lk/web/index.php?Itemid=170&id=41&lang=en&option=com_content&view=article",
    verificationEvidenceUri:
      "https://www.nipo.gov.lk/web/index.php?Itemid=170&id=41&lang=en&option=com_content&view=article",
    notes:
      "NIPO publishes the trademark fee schedule covering applications, opposition and observations, hearings, registration, renewals, recordals, register inspection and Gazette publication charges. Amounts remain sourced evidence rather than frozen catalog truth.",
  }),
  target(NIPO_LK, {
    id: "lk-nipo-intellectual-property-act",
    family: "LEGAL_TEXTS",
    displayName: "Sri Lanka Intellectual Property Act No. 36 of 2003",
    canonicalUri:
      "https://nipo.gov.lk/web/index.php?Itemid=156&id=37&lang=en&option=com_content&view=article",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://nipo.gov.lk/web/index.php?Itemid=156&id=37&lang=en&option=com_content&view=article",
    notes:
      "NIPO publishes the Intellectual Property Act No. 36 of 2003, including the chapters governing marks, admissibility, registration procedure, duration, ownership, assignments, licences, cancellation and collective/certification marks.",
  }),
  target(NIPO_LK, {
    id: "lk-nipo-intellectual-property-regulations",
    family: "LEGAL_TEXTS",
    displayName: "Sri Lanka NIPO Intellectual Property Regulations",
    canonicalUri: "https://www.nipo.gov.lk/web/index.php?id=38&lang=en&option=com_content&view=article",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.nipo.gov.lk/web/index.php?id=38&lang=en&option=com_content&view=article",
    notes:
      "NIPO publishes Intellectual Property Regulations No. 01 of 2006 and subsequent Gazette amendments, including a regulation amendment posted in July 2026.",
  }),
  target(NIPO_LK, {
    id: "lk-nipo-trademark-weekly-updates",
    family: "STATUS_AND_DOCUMENTS",
    displayName: "Sri Lanka NIPO Weekly Trademark Processing Updates",
    canonicalUri: "https://www.nipo.gov.lk/web/index.php?id=8&lang=en&option=com_content&view=article",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.nipo.gov.lk/web/index.php?id=8&lang=en&option=com_content&view=article",
    notes:
      "NIPO publishes weekly trademark updates covering substantive examinations, Gazette publication, registrations and renewals; this operational surface is retained as a change signal rather than mislabeled as the Gazette itself.",
  }),
] satisfies readonly SourceCoverageTarget[];
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
