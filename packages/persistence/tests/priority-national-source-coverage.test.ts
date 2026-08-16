import { describe, expect, it } from "vitest";
import {
  CIPO_SOURCE_COVERAGE_TARGETS,
  CNIPA_SOURCE_COVERAGE_TARGETS,
  DPMA_SOURCE_COVERAGE_TARGETS,
  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,
  IP_INDIA_SOURCE_COVERAGE_TARGETS,
  INPI_FR_SOURCE_COVERAGE_TARGETS,
  INPI_BR_SOURCE_COVERAGE_TARGETS,
  IMPI_MX_SOURCE_COVERAGE_TARGETS,
  IPONZ_NZ_SOURCE_COVERAGE_TARGETS,
  OEPM_ES_SOURCE_COVERAGE_TARGETS,
  UIBM_IT_SOURCE_COVERAGE_TARGETS,
  IPI_CH_SOURCE_COVERAGE_TARGETS,
  PRV_SE_SOURCE_COVERAGE_TARGETS,
  NIPO_NO_SOURCE_COVERAGE_TARGETS,
  DKPTO_DK_SOURCE_COVERAGE_TARGETS,
  PRH_FI_SOURCE_COVERAGE_TARGETS,
  PATENTAMT_AT_SOURCE_COVERAGE_TARGETS,
  IPOI_IE_SOURCE_COVERAGE_TARGETS,
  INPI_PT_SOURCE_COVERAGE_TARGETS,
  UPRP_PL_SOURCE_COVERAGE_TARGETS,
  UPV_CZ_SOURCE_COVERAGE_TARGETS,
  INDPROP_SK_SOURCE_COVERAGE_TARGETS,
  HIPO_HU_SOURCE_COVERAGE_TARGETS,
  OSIM_RO_SOURCE_COVERAGE_TARGETS,
  BPO_BG_SOURCE_COVERAGE_TARGETS,
  DZIV_HR_SOURCE_COVERAGE_TARGETS,
  SIPO_SI_SOURCE_COVERAGE_TARGETS,
  OBI_GR_SOURCE_COVERAGE_TARGETS,
  CY_IP_SOURCE_COVERAGE_TARGETS,
  IPRD_MT_SOURCE_COVERAGE_TARGETS,
  EPA_EE_SOURCE_COVERAGE_TARGETS,
  LPO_LV_SOURCE_COVERAGE_TARGETS,
  VPB_LT_SOURCE_COVERAGE_TARGETS,
  TURKPATENT_TR_SOURCE_COVERAGE_TARGETS,
  ZIS_RS_SOURCE_COVERAGE_TARGETS,
  SAIP_SA_SOURCE_COVERAGE_TARGETS,
  MOET_AE_SOURCE_COVERAGE_TARGETS,
  MOCI_QA_SOURCE_COVERAGE_TARGETS,
  MOCIIP_OM_SOURCE_COVERAGE_TARGETS,
  MOIC_BH_SOURCE_COVERAGE_TARGETS,
  MOCI_KW_SOURCE_COVERAGE_TARGETS,
  IPPD_JO_SOURCE_COVERAGE_TARGETS,
  DPDT_BD_SOURCE_COVERAGE_TARGETS,
  DOI_NP_SOURCE_COVERAGE_TARGETS,
  MYIPO_MY_SOURCE_COVERAGE_TARGETS,
  IPOPHL_PH_SOURCE_COVERAGE_TARGETS,
  IPOS_SOURCE_COVERAGE_TARGETS,
  JPO_SOURCE_COVERAGE_TARGETS,
  KOREA_SOURCE_COVERAGE_TARGETS,
  PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,
  UKIPO_SOURCE_COVERAGE_TARGETS,
} from "../src/priority-national-source-coverage";
import { listSourceCoverageTargets } from "../src/source-coverage-catalog";

const authoritySets = [
  ["CN", CNIPA_SOURCE_COVERAGE_TARGETS, ["cnipa.gov.cn"]],
  ["JP", JPO_SOURCE_COVERAGE_TARGETS, ["jpo.go.jp"]],
  ["KR", KOREA_SOURCE_COVERAGE_TARGETS, ["kipo.go.kr"]],
  ["GB", UKIPO_SOURCE_COVERAGE_TARGETS, ["gov.uk", "ipo.gov.uk"]],
  ["AU", IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS, ["ipaustralia.gov.au"]],
  ["SG", IPOS_SOURCE_COVERAGE_TARGETS, ["ipos.gov.sg"]],
  ["DE", DPMA_SOURCE_COVERAGE_TARGETS, ["dpma.de"]],
  ["IN", IP_INDIA_SOURCE_COVERAGE_TARGETS, ["ipindia.gov.in"]],
  ["FR", INPI_FR_SOURCE_COVERAGE_TARGETS, ["inpi.fr"]],
  ["BR", INPI_BR_SOURCE_COVERAGE_TARGETS, ["gov.br", "inpi.gov.br"]],
  ["MX", IMPI_MX_SOURCE_COVERAGE_TARGETS, ["gob.mx", "impi.gob.mx"]],
  ["NZ", IPONZ_NZ_SOURCE_COVERAGE_TARGETS, ["iponz.govt.nz"]],
  ["ES", OEPM_ES_SOURCE_COVERAGE_TARGETS, ["oepm.es"]],
  ["IT", UIBM_IT_SOURCE_COVERAGE_TARGETS, ["mise.gov.it", "uibm.gov.it"]],
  ["CH", IPI_CH_SOURCE_COVERAGE_TARGETS, ["ige.ch"]],
  ["SE", PRV_SE_SOURCE_COVERAGE_TARGETS, ["prv.se"]],
  ["NO", NIPO_NO_SOURCE_COVERAGE_TARGETS, ["patentstyret.no"]],
  ["DK", DKPTO_DK_SOURCE_COVERAGE_TARGETS, ["dkpto.org", "dkpto.dk"]],
  ["FI", PRH_FI_SOURCE_COVERAGE_TARGETS, ["prh.fi"]],
  ["AT", PATENTAMT_AT_SOURCE_COVERAGE_TARGETS, ["patentamt.at"]],
  ["IE", IPOI_IE_SOURCE_COVERAGE_TARGETS, ["ipoi.gov.ie"]],
  ["PT", INPI_PT_SOURCE_COVERAGE_TARGETS, ["inpi.justica.gov.pt"]],
  ["PL", UPRP_PL_SOURCE_COVERAGE_TARGETS, ["uprp.gov.pl"]],
  ["CZ", UPV_CZ_SOURCE_COVERAGE_TARGETS, ["upv.gov.cz"]],
  ["SK", INDPROP_SK_SOURCE_COVERAGE_TARGETS, ["indprop.gov.sk"]],
  ["HU", HIPO_HU_SOURCE_COVERAGE_TARGETS, ["sztnh.gov.hu"]],
  ["RO", OSIM_RO_SOURCE_COVERAGE_TARGETS, ["osim.ro"]],
  ["BG", BPO_BG_SOURCE_COVERAGE_TARGETS, ["bpo.bg"]],
  ["HR", DZIV_HR_SOURCE_COVERAGE_TARGETS, ["dziv.hr"]],
  ["SI", SIPO_SI_SOURCE_COVERAGE_TARGETS, ["gov.si", "uil-sipo.si", "pisrs.si"]],
  ["GR", OBI_GR_SOURCE_COVERAGE_TARGETS, ["obi.gr", "gov.gr"]],
  ["CY", CY_IP_SOURCE_COVERAGE_TARGETS, ["gov.cy"]],
  ["MT", IPRD_MT_SOURCE_COVERAGE_TARGETS, ["commerce.gov.mt", "ips.gov.mt"]],
  ["EE", EPA_EE_SOURCE_COVERAGE_TARGETS, ["epa.ee", "riigiteataja.ee"]],
  ["LV", LPO_LV_SOURCE_COVERAGE_TARGETS, ["lrpv.gov.lv"]],
  ["LT", VPB_LT_SOURCE_COVERAGE_TARGETS, ["vpb.lrv.lt"]],
  ["TR", TURKPATENT_TR_SOURCE_COVERAGE_TARGETS, ["turkpatent.gov.tr"]],
  ["RS", ZIS_RS_SOURCE_COVERAGE_TARGETS, ["zis.gov.rs"]],
  ["SA", SAIP_SA_SOURCE_COVERAGE_TARGETS, ["saip.gov.sa"]],
  ["AE", MOET_AE_SOURCE_COVERAGE_TARGETS, ["moet.gov.ae"]],
  ["QA", MOCI_QA_SOURCE_COVERAGE_TARGETS, ["moci.gov.qa"]],
  ["OM", MOCIIP_OM_SOURCE_COVERAGE_TARGETS, ["gov.om", "mjla.gov.om"]],
  ["BH", MOIC_BH_SOURCE_COVERAGE_TARGETS, ["moic.gov.bh", "bahrain.bh", "legalaffairs.gov.bh"]],
  ["KW", MOCI_KW_SOURCE_COVERAGE_TARGETS, ["moci.gov.kw", "e.gov.kw", "media.gov.kw"]],
  ["JO", IPPD_JO_SOURCE_COVERAGE_TARGETS, ["mit.gov.jo"]],
  ["BD", DPDT_BD_SOURCE_COVERAGE_TARGETS, ["dpdt.gov.bd"]],
  ["NP", DOI_NP_SOURCE_COVERAGE_TARGETS, ["doind.gov.np"]],
  ["MY", MYIPO_MY_SOURCE_COVERAGE_TARGETS, ["myipo.gov.my"]],
  ["PH", IPOPHL_PH_SOURCE_COVERAGE_TARGETS, ["ipophil.gov.ph"]],
  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],
] as const;

function officialHost(uri: string, suffixes: readonly string[]): boolean {
  const hostname = new URL(uri).hostname.toLowerCase();
  return suffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

describe("priority national trademark source coverage", () => {
  it("ships explicit, official, unique coverage for fifty priority national offices", () => {
    expect(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS).toHaveLength(391);
    expect(new Set(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.id)).size).toBe(
      391,
    );
    expect(
      new Set(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.canonicalUri)).size,
    ).toBe(391);

    for (const [jurisdiction, targets, officialSuffixes] of authoritySets) {
      expect(targets.length).toBeGreaterThanOrEqual(5);
      for (const item of targets) {
        expect(item.jurisdiction).toBe(jurisdiction);
        expect(item.authorityBasis).toBe("EXPLICIT_CURATED");
        expect(item.authorityLevel).toBe("PRIMARY_OFFICIAL");
        expect(item.category).toBe("OFFICIAL_AUTHORITY");
        expect(item.catalogState).toBe("ACTIVE");
        expect(item.entrypoints.length).toBeGreaterThan(0);
        expect(item.acquisition.expectedArtifactKinds.length).toBeGreaterThan(0);
        expect(officialHost(item.canonicalUri, officialSuffixes)).toBe(true);
        expect(officialHost(item.verificationEvidenceUri, officialSuffixes)).toBe(true);
      }
    }
  });

  it("covers filing, fees and high-value guidance without granting collection authority", () => {
    for (const [, targets] of authoritySets) {
      expect(targets.some((item) => item.family === "FILING")).toBe(true);
      expect(targets.some((item) => item.family === "FEES")).toBe(true);
      expect(
        targets.some((item) =>
          [
            "EXAMINATION_MANUAL",
            "LEGAL_TEXTS",
            "PROCEEDINGS",
            "GOODS_SERVICES_ID",
            "OFFICIAL_GAZETTE",
          ].includes(item.family),
        ),
      ).toBe(true);
    }

    const serialized = JSON.stringify(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS);
    expect(serialized).not.toContain('"schedule"');
    expect(serialized).not.toContain('"authorized"');
    expect(serialized).not.toContain('"collectionPlanId"');
  });

  it("uses the current Korean ministry identity while retaining the official kipo.go.kr surface", () => {
    expect(
      KOREA_SOURCE_COVERAGE_TARGETS.every(
        (item) => item.authorityName === "Ministry of Intellectual Property (Republic of Korea)",
      ),
    ).toBe(true);
    expect(
      KOREA_SOURCE_COVERAGE_TARGETS.every((item) =>
        officialHost(item.canonicalUri, ["kipo.go.kr"]),
      ),
    ).toBe(true);
  });

  it("integrates all priority jurisdictions into the version-controlled catalog", () => {
    for (const [jurisdiction, targets] of authoritySets) {
      const catalogTargets = listSourceCoverageTargets({ jurisdiction });
      expect(catalogTargets.map((item) => item.id).sort()).toEqual(
        targets.map((item) => item.id).sort(),
      );
    }
  });
});
