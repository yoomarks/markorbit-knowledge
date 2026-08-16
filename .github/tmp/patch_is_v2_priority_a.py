from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '\nconst CIPO: Authority = {'
if anchor not in text:
    raise SystemExit('CIPO anchor not found')
block = r'''

const ISIPO_IS: Authority = {
  jurisdiction: "IS",
  authorityName: "Icelandic Intellectual Property Office (ISIPO)",
  languages: ["is-IS", "en-US"],
  verificationEvidenceUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks",
};

export const ISIPO_IS_SOURCE_COVERAGE_TARGETS = [
  target(ISIPO_IS, {
    id: "is-isipo-trademarks",
    family: "PORTAL",
    displayName: "Iceland ISIPO Trademark Portal",
    canonicalUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks",
    verificationEvidenceUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks",
    notes:
      "ISIPO's trademark portal explains Icelandic trademark protection and links filing, national search, goods/services, fees, Gazette publications, opposition, division and owner-maintenance guidance.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-filing",
    family: "FILING",
    displayName: "Iceland ISIPO Online Trademark Filing",
    canonicalUri: "https://www.hugverk.is/en/apply/apply-in-iceland/apply-for-a-trademark",
    entrypoints: [
      {
        uri: "https://www.hugverk.is/en/apply/apply-in-iceland/apply-for-a-trademark",
        label: "Authenticated online trademark application",
      },
      {
        uri: "https://www.hugverk.is/en/apply/apply-in-iceland",
        label: "Apply in Iceland service navigation",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri:
      "https://www.hugverk.is/en/apply/apply-in-iceland/apply-for-a-trademark",
    notes:
      "ISIPO provides a dedicated online trademark application route; electronic submission requires login with an electronic certificate.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-search",
    family: "SEARCH",
    displayName: "Iceland ISIPO Trademark Search",
    canonicalUri: "https://www.hugverk.is/en/search/trademark",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.hugverk.is/en/search/trademark",
    notes:
      "ISIPO's public trademark search supports text or number queries with class, status and advanced filters and links individual register records with timelines and goods/services.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-forms",
    family: "STATUS_AND_DOCUMENTS",
    displayName: "Iceland ISIPO Trademark Forms",
    canonicalUri: "https://www.hugverk.is/en/apply/forms",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.hugverk.is/en/apply/forms",
    notes:
      "ISIPO publishes trademark, collective-mark, certification/quality-mark and renewal forms together with general power-of-attorney, assignment and data-access forms.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-fees",
    family: "FEES",
    displayName: "Iceland ISIPO Trademark Fees",
    canonicalUri: "https://www.hugverk.is/en/apply/fees-and-banking/trademarks",
    verificationEvidenceUri: "https://www.hugverk.is/en/apply/fees-and-banking/trademarks",
    notes:
      "ISIPO publishes current trademark application, renewal, additional-class, change/division, opposition, administrative revocation, resumption and appeal fees under the applicable fee regulation. Amounts remain sourced evidence rather than frozen catalog truth.",
  }),
  // __IS_ISIPO_V2_CONTINUE__
] satisfies readonly SourceCoverageTarget[];
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
