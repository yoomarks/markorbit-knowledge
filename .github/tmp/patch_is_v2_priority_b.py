from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '  // __IS_ISIPO_V2_CONTINUE__\n'
if anchor not in text:
    raise SystemExit('Iceland continuation anchor not found')
block = r'''  target(ISIPO_IS, {
    id: "is-isipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Iceland ISIPO Trademark Goods and Services Classification",
    canonicalUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks/good-and-services",
    expectedArtifactKinds: ["HTML", "MARKDOWN"],
    verificationEvidenceUri:
      "https://www.hugverk.is/en/knowledge/on-ip/trademarks/good-and-services",
    notes:
      "ISIPO publishes the current 45 Nice classes and Iceland-specific guidance for preparing trademark goods/services; the office does not accept class-heading bold terms when they are considered too broad.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Iceland ISIPO Trademark Act, Regulation and 2026 Classification Notice",
    canonicalUri: "https://www.hugverk.is/en/knowledge/ip-law/trademarks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.hugverk.is/en/knowledge/ip-law/trademarks",
    notes:
      "ISIPO's trademark-law page publishes Trademark Act No. 45/1997, Trademark Regulation No. 850/2020 and identifies Advertisement No. 1355/2025 as the current Nice-classification notice applying from 1 January 2026.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Iceland ISIPO Trademark Opposition Proceedings",
    canonicalUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks/opposition",
    entrypoints: [
      {
        uri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks/opposition",
        label: "Opposition procedure, deadlines and appeal route",
      },
      {
        uri: "https://www.hugverk.is/en/search/form/opposition-trademark",
        label: "Official opposition submission route",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.hugverk.is/en/knowledge/on-ip/trademarks/opposition",
    notes:
      "ISIPO documents the two-month post-publication opposition period, filing requirements, evidence exchange, settlement postponements, rulings, transfer remedies and appeal deadlines, with filing linked from trademark records.",
  }),
  target(ISIPO_IS, {
    id: "is-isipo-ip-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Iceland ISIPO Intellectual Property Gazette",
    canonicalUri: "https://www.hugverk.is/en/newsroom/gazettes",
    coverageTier: "CHANGE_SIGNAL",
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.hugverk.is/en/newsroom/gazettes",
    notes:
      "Hugverkatíðindi is ISIPO's official electronic Gazette. From January 2026 it is issued every Wednesday and includes trademark publications plus opposition and appeal notices, making it a high-value publication change signal.",
  }),
'''
text = text.replace(anchor, block, 1)
path.write_text(text)
