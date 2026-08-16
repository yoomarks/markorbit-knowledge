from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '\nconst CIPO: Authority = {'
if anchor not in text:
    raise SystemExit('CIPO anchor not found')
block = r'''

const SIC_CO: Authority = {
  jurisdiction: "CO",
  authorityName: "Superintendencia de Industria y Comercio (SIC), Colombia",
  languages: ["es-CO"],
  verificationEvidenceUri: "https://sedeelectronica.sic.gov.co/temas/propiedad-industrial/marcas",
};

export const SIC_CO_SOURCE_COVERAGE_TARGETS = [
  target(SIC_CO, {
    id: "co-sic-trademarks",
    family: "PORTAL",
    displayName: "Colombia SIC Trademark Portal",
    canonicalUri: "https://sedeelectronica.sic.gov.co/temas/propiedad-industrial/marcas",
    verificationEvidenceUri: "https://sedeelectronica.sic.gov.co/temas/propiedad-industrial/marcas",
    notes:
      "SIC's trademark portal consolidates national registration guidance, SIPI search and filing, Nice and goods/services tools, fees, trademark documentation and the Industrial Property Gazette.",
  }),
  target(SIC_CO, {
    id: "co-sic-trademark-filing",
    family: "FILING",
    displayName: "Colombia SIC Online Trademark Registration",
    canonicalUri:
      "https://sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania/tramites/registro-de-marca-de-productos-y-servicios-y-lema-comercial",
    entrypoints: [
      {
        uri: "https://sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania/tramites/registro-de-marca-de-productos-y-servicios-y-lema-comercial",
        label: "Official online trademark registration transaction page",
      },
      { uri: "https://sipi.sic.gov.co/sipi/Extra/Default.aspx", label: "SIPI Virtual Industrial Property Office" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri:
      "https://sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania/tramites/registro-de-marca-de-productos-y-servicios-y-lema-comercial",
    notes:
      "SIC identifies trademark registration as an online procedure and uses SIPI, its Virtual Industrial Property Office, for electronic filing and portfolio management.",
  }),
  target(SIC_CO, {
    id: "co-sic-trademark-search",
    family: "SEARCH",
    displayName: "Colombia SIC SIPI Trademark Search",
    canonicalUri: "https://sipi.sic.gov.co/sipi/Extra/Default.aspx",
    entrypoints: [
      { uri: "https://sipi.sic.gov.co/sipi/Extra/Default.aspx", label: "SIPI public industrial-property search" },
      {
        uri: "https://sedeelectronica.sic.gov.co/temas/propiedad-industrial/marcas",
        label: "SIC trademark page linking the national SIPI database",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://sedeelectronica.sic.gov.co/temas/propiedad-industrial/marcas",
    notes:
      "SIPI is SIC's current public industrial-property database for distinctive signs and exposes bibliographic data, status, publication, classes, parties, documents and administrative history for trademark records.",
  }),
  target(SIC_CO, {
    id: "co-sic-trademark-fees",
    family: "FEES",
    displayName: "Colombia SIC 2026 Industrial Property Fees",
    canonicalUri: "https://serviciospub.sic.gov.co/Sic/Tarifas/Tarifas.php",
    mode: "MIXED",
    expectedArtifactKinds: ["HTML"],
    verificationEvidenceUri: "https://serviciospub.sic.gov.co/Sic/Tarifas/Tarifas.php",
    notes:
      "SIC's live tariff query publishes the 2026 industrial-property fee schedule, including online trademark filing, additional classes, opposition, notoriety, assignments, cancellation and other distinctive-sign transactions. Amounts remain sourced evidence rather than frozen catalog truth.",
  }),
  target(SIC_CO, {
    id: "co-sic-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Colombia SIC Nice Classification Search",
    canonicalUri:
      "https://sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania/servicios/consulta-clasificacion-internacional-de-niza",
    verificationEvidenceUri:
      "https://sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania/servicios/consulta-clasificacion-internacional-de-niza",
    notes:
      "SIC provides an immediate online service for consulting the Nice Classification of goods and services used in Colombian distinctive-sign applications; its trademark portal also links MSG and harmonization tools.",
  }),
  // __CO_SIC_CONTINUE__
] satisfies readonly SourceCoverageTarget[];
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
