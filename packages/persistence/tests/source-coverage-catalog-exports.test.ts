import { describe, expect, it } from "vitest";
import * as catalog from "../src/source-coverage-catalog";

const postBoipCountryExports = [
  "DPPI_AL_SOURCE_COVERAGE_TARGETS",
  "IPR_BA_SOURCE_COVERAGE_TARGETS",
  "SOIP_MK_SOURCE_COVERAGE_TARGETS",
  "NCIP_BY_SOURCE_COVERAGE_TARGETS",
  "IPOM_MN_SOURCE_COVERAGE_TARGETS",
  "DIP_KH_SOURCE_COVERAGE_TARGETS",
  "DIP_LA_SOURCE_COVERAGE_TARGETS",
  "IPD_MM_SOURCE_COVERAGE_TARGETS",
  "BRUIPO_BN_SOURCE_COVERAGE_TARGETS",
  "SENADI_EC_SOURCE_COVERAGE_TARGETS",
  "DNPI_UY_SOURCE_COVERAGE_TARGETS",
  "RPI_GT_SOURCE_COVERAGE_TARGETS",
  "RPI_CR_SOURCE_COVERAGE_TARGETS",
  "DIGERPI_PA_SOURCE_COVERAGE_TARGETS",
  "ONAPI_DO_SOURCE_COVERAGE_TARGETS",
  "MOET_LB_SOURCE_COVERAGE_TARGETS",
  "DINAPI_PY_SOURCE_COVERAGE_TARGETS",
  "SAPI_VE_SOURCE_COVERAGE_TARGETS",
  "EIPA_ET_SOURCE_COVERAGE_TARGETS",
  "SENAPI_BO_SOURCE_COVERAGE_TARGETS",
  "DIGEPIH_HN_SOURCE_COVERAGE_TARGETS",
  "ISPI_SV_SOURCE_COVERAGE_TARGETS",
  "JIPO_JM_SOURCE_COVERAGE_TARGETS",
  "IPO_TT_SOURCE_COVERAGE_TARGETS",
] as const;

describe("source coverage catalog named exports", () => {
  it("publicly exports every post-BOIP curated country source set", () => {
    for (const exportName of postBoipCountryExports) {
      expect(exportName in catalog, exportName).toBe(true);
      expect(Array.isArray((catalog as Record<string, unknown>)[exportName])).toBe(true);
    }
  });
});
