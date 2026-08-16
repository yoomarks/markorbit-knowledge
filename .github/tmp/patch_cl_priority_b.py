from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '  // __CL_INAPI_CONTINUE__\n'
if anchor not in text:
    raise SystemExit('Chile continuation anchor not found')
block = r'''  target(INAPI_CL, {
    id: "cl-inapi-trademark-directives-2026",
    family: "EXAMINATION_MANUAL",
    displayName: "Chile INAPI Trademark Directives 2026",
    canonicalUri: "https://www.inapi.cl/centro-de-documentacion/directrices/marcas",
    expectedArtifactKinds: ["HTML", "MARKDOWN"],
    verificationEvidenceUri: "https://www.inapi.cl/centro-de-documentacion/directrices/marcas",
    notes:
      "INAPI's Trademark Directives 2026, published 28 May 2026, replace earlier trademark directives and systematize current registration, maintenance, contentious procedure, appeal and substantive examination practice.",
  }),
  target(INAPI_CL, {
    id: "cl-inapi-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Chile INAPI Industrial Property Legislation",
    canonicalUri: "https://www.inapi.cl/centro-de-documentacion/legislacion",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.inapi.cl/centro-de-documentacion/legislacion",
    notes:
      "INAPI's legislation library provides the Industrial Property Law and implementing legal materials governing Chilean trademarks and related industrial-property procedures.",
  }),
  target(INAPI_CL, {
    id: "cl-inapi-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Chile INAPI Trademark Opposition Proceedings",
    canonicalUri: "https://tramites.inapi.cl/Trademark/TrademarkOpposition",
    entrypoints: [
      {
        uri: "https://tramites.inapi.cl/Trademark/TrademarkOpposition",
        label: "Online opposition filing transaction",
      },
      {
        uri: "https://www.inapi.cl/centro-de-documentacion/directrices/marcas",
        label: "2026 directives covering opposition and cancellation proceedings",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://tramites.inapi.cl/Trademark/TrademarkOpposition",
    notes:
      "INAPI provides an authenticated online transaction for trademark oppositions, while its 2026 directives document contentious trademark proceedings, nullity actions and appeal routes.",
  }),
  target(INAPI_CL, {
    id: "cl-inapi-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Chile INAPI New Trademark Gazette",
    canonicalUri: "https://tramites.inapi.cl/GacetaMarcas",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF", "ZIP"],
    verificationEvidenceUri: "https://tramites.inapi.cl/GacetaMarcas",
    notes:
      "INAPI publishes the New Trademark Gazette on a recurring weekly cadence with downloadable current and historical files, making it a high-value publication change signal.",
  }),
'''
text = text.replace(anchor, block, 1)
path.write_text(text)
