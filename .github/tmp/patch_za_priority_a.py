from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '\nconst CIPO: Authority = {'
if anchor not in text:
    raise SystemExit('CIPO anchor not found')
block = r'''

const CIPC_ZA: Authority = {
  jurisdiction: "ZA",
  authorityName: "Companies and Intellectual Property Commission (CIPC), South Africa",
  languages: ["en-ZA"],
  verificationEvidenceUri: "https://www.cipc.co.za/?page_id=4118",
};

export const CIPC_ZA_SOURCE_COVERAGE_TARGETS = [
  target(CIPC_ZA, {
    id: "za-cipc-trademarks",
    family: "PORTAL",
    displayName: "South Africa CIPC Trade Mark Registration Portal",
    canonicalUri: "https://www.cipc.co.za/?page_id=4118",
    entrypoints: [
      { uri: "https://www.cipc.co.za/?page_id=4118", label: "Register Trade Mark guidance" },
      { uri: "https://iponline.cipc.co.za/", label: "CIPC Intellectual Property Online" },
    ],
    verificationEvidenceUri: "https://www.cipc.co.za/?page_id=4118",
    notes:
      "CIPC administers South Africa's Trade Marks Register and its registration page links the national search, application, classification, forms/fees, maintenance, practice guidance and legal resources.",
  }),
  target(CIPC_ZA, {
    id: "za-cipc-trademark-filing",
    family: "FILING",
    displayName: "South Africa CIPC IPOnline Trade Mark Filing",
    canonicalUri: "https://iponline.cipc.co.za/Trademarks/EFiling/NewMarkNotice.aspx",
    entrypoints: [
      {
        uri: "https://iponline.cipc.co.za/Trademarks/EFiling/NewMarkNotice.aspx",
        label: "IPOnline new trade mark filing",
      },
      {
        uri: "https://iponline.cipc.co.za/Publications/Notices.aspx",
        label: "CIPC IP e-filing notices and user documentation",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://iponline.cipc.co.za/",
    notes:
      "CIPC IPOnline exposes the dedicated Apply for Trade Mark transaction and manages authenticated IP e-filing through CIPC customer accounts.",
  }),
  target(CIPC_ZA, {
    id: "za-cipc-trademark-search",
    family: "SEARCH",
    displayName: "South Africa CIPC Free Trade Mark Search",
    canonicalUri: "https://iponline.cipc.co.za/Trademarks/Search/FreeTMSearchNotice.aspx",
    entrypoints: [
      {
        uri: "https://iponline.cipc.co.za/Trademarks/Search/FreeTMSearchNotice.aspx",
        label: "Free Trade Mark Search entry",
      },
      { uri: "https://iponline.cipc.co.za/", label: "IPOnline search navigation" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://iponline.cipc.co.za/",
    notes:
      "CIPC IPOnline provides a free cursory Trade Marks Register search and separate commercial search options; the free-search route is retained as the national public-search source.",
  }),
  target(CIPC_ZA, {
    id: "za-cipc-trademark-fees",
    family: "FEES",
    displayName: "South Africa CIPC Trade Mark Forms and Fees",
    canonicalUri: "https://www.cipc.co.za/?page_id=4074",
    verificationEvidenceUri: "https://www.cipc.co.za/?page_id=4074",
    notes:
      "CIPC publishes the prescribed trade mark forms and fees covering registration, advertisement, renewal, restoration, assignments, registered users and other registrar requests. Amounts remain sourced evidence rather than frozen catalog truth.",
  }),
  target(CIPC_ZA, {
    id: "za-cipc-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "South Africa CIPC Nice Classification 13-2026 Class Headings",
    canonicalUri: "https://www.cipc.co.za/wp-content/uploads/2025/12/20260101-en-classheadings.pdf",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["PDF"],
    verificationEvidenceUri: "https://www.cipc.co.za/?page_id=4118",
    notes:
      "CIPC publishes the South African class headings and explanatory notes for the Nice Classification, 13th Edition, Version 2026, from its trade mark registration guidance.",
  }),
  // __ZA_CIPC_CONTINUE__
] satisfies readonly SourceCoverageTarget[];
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
