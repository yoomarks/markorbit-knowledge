from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '\nconst CIPO: Authority = {'
if anchor not in text:
    raise SystemExit('CIPO anchor not found')
block = r'''

const INAPI_CL: Authority = {
  jurisdiction: "CL",
  authorityName: "Instituto Nacional de Propiedad Industrial (INAPI), Chile",
  languages: ["es-CL"],
  verificationEvidenceUri: "https://www.inapi.cl/marcas",
};

export const INAPI_CL_SOURCE_COVERAGE_TARGETS = [
  target(INAPI_CL, {
    id: "cl-inapi-trademarks",
    family: "PORTAL",
    displayName: "Chile INAPI Trademark Portal",
    canonicalUri: "https://www.inapi.cl/marcas",
    verificationEvidenceUri: "https://www.inapi.cl/marcas",
    notes:
      "INAPI's trademark portal links the national trademark database, online filing and payment, renewals, filings, goods/services classifier, daily notifications and trademark procedures.",
  }),
  target(INAPI_CL, {
    id: "cl-inapi-trademark-filing",
    family: "FILING",
    displayName: "Chile INAPI Online Trademark Filing",
    canonicalUri: "https://tramites.inapi.cl/Trademark/TrademarkApplication/IndexTrademark",
    entrypoints: [
      {
        uri: "https://tramites.inapi.cl/Trademark/TrademarkApplication/IndexTrademark",
        label: "Online trademark application transaction",
      },
      { uri: "https://tramites.inapi.cl/", label: "INAPI online transactions portal" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://tramites.inapi.cl/Trademark/TrademarkApplication/IndexTrademark",
    notes:
      "INAPI provides a dedicated authenticated transaction for new trademark applications and online payment through its official transactions portal.",
  }),
  target(INAPI_CL, {
    id: "cl-inapi-trademark-search",
    family: "SEARCH",
    displayName: "Chile INAPI Trademark Database Search",
    canonicalUri: "https://buscadormarcas.inapi.cl/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.inapi.cl/marcas/buscadores",
    notes:
      "INAPI's free trademark database supports search by application or registration number, sign name, owner, status, class and dates and exposes administrative-proceeding history for records.",
  }),
  target(INAPI_CL, {
    id: "cl-inapi-trademark-fees",
    family: "FEES",
    displayName: "Chile INAPI Trademark Fees",
    canonicalUri: "https://www.inapi.cl/marcas/para-informarse?acordeon=1",
    verificationEvidenceUri: "https://www.inapi.cl/marcas/para-informarse?acordeon=1",
    notes:
      "INAPI publishes the national trademark fee structure, including staged application/registration charges and renewal information. Amounts remain sourced evidence rather than frozen catalog truth.",
  }),
  target(INAPI_CL, {
    id: "cl-inapi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Chile INAPI Goods and Services Classifier",
    canonicalUri: "https://tramites.inapi.cl/Trademark/TrademarkNizaClassifier",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://tramites.inapi.cl/Trademark/TrademarkNizaClassifier",
    notes:
      "INAPI's official goods/services classifier searches Nice classes and descriptions and distinguishes NIZA, INAPI, Pacific Alliance harmonized and Madrid-source terms, with Spanish and English descriptions where available.",
  }),
  // __CL_INAPI_CONTINUE__
] satisfies readonly SourceCoverageTarget[];
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
