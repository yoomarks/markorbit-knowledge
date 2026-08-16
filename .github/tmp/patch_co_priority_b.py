from pathlib import Path

path = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = path.read_text()
anchor = '  // __CO_SIC_CONTINUE__\n'
if anchor not in text:
    raise SystemExit('Colombia continuation anchor not found')
block = r'''  target(SIC_CO, {
    id: "co-sic-trademark-procedure-2026",
    family: "EXAMINATION_MANUAL",
    displayName: "Colombia SIC Trademark Registration Procedure PI01-P01 v12",
    canonicalUri: "https://sigi.sic.gov.co/SIGI/portal/document_tab.php?id_doc=645&version=12",
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://sigi.sic.gov.co/SIGI/portal/document_tab.php?id_doc=645&version=12",
    notes:
      "SIC's official PI01-P01 trademark registration procedure version 12 became effective 14 May 2026 and documents the workflow from filing through examination and the registrability decision, including Madrid-designated applications.",
  }),
  target(SIC_CO, {
    id: "co-sic-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Colombia SIC Trademark Legal Framework",
    canonicalUri: "https://sedeelectronica.sic.gov.co/transparencia/normativa/decision-486",
    entrypoints: [
      {
        uri: "https://sedeelectronica.sic.gov.co/transparencia/normativa/decision-486",
        label: "Andean Community Decision 486 industrial-property regime",
      },
      {
        uri: "https://sedeelectronica.sic.gov.co/transparencia/normativa/busqueda-de-normas/entidad",
        label: "SIC legal and regulatory search system",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://sedeelectronica.sic.gov.co/transparencia/normativa/decision-486",
    notes:
      "SIC publishes Andean Community Decision 486 as the common industrial-property regime and maintains a searchable legal library for Colombian implementing decrees, resolutions, Circular Única annexes and trademark-specific rules.",
  }),
  target(SIC_CO, {
    id: "co-sic-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Colombia SIC Trademark Opposition and Cancellation Proceedings",
    canonicalUri:
      "https://sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania/tramites/cancelacion-de-un-registro-de-marca-lema-comercial-o-de-autorizacion-de-uso-de-denominacion-de-origen",
    entrypoints: [
      {
        uri: "https://sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania/tramites/cancelacion-de-un-registro-de-marca-lema-comercial-o-de-autorizacion-de-uso-de-denominacion-de-origen",
        label: "Online trademark cancellation procedure",
      },
      {
        uri: "https://sedeelectronica.sic.gov.co/transparencia/normativa/busqueda-de-normas/entidad?combine=&field_clasificacion_target_id=183&field_fecha_publicacion_value=&page=153",
        label: "Circular Única Annex 6.12 opposition filing materials",
      },
    ],
    mode: "MIXED",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania/tramites/cancelacion-de-un-registro-de-marca-lema-comercial-o-de-autorizacion-de-uso-de-denominacion-de-origen",
    notes:
      "SIC publishes online cancellation procedures for non-use, notoriety and genericization and its Circular Única legal materials include the distinctive-sign opposition and cancellation filing annexes.",
  }),
  target(SIC_CO, {
    id: "co-sic-industrial-property-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Colombia SIC Industrial Property Gazette",
    canonicalUri: "https://serviciospub2.sic.gov.co/Sic/ServiciosPI/GacetaPI/index.php",
    coverageTier: "CHANGE_SIGNAL",
    expectedArtifactKinds: ["HTML", "XLSX"],
    verificationEvidenceUri: "https://serviciospub2.sic.gov.co/Sic/ServiciosPI/GacetaPI/index.php",
    notes:
      "SIC's official digital Industrial Property Gazette supports edition and filing-level queries, including trademark registration applications and downloadable indexes, and is retained as a publication change signal.",
  }),
'''
text = text.replace(anchor, block, 1)
path.write_text(text)
