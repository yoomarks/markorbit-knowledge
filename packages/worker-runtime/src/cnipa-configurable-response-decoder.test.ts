import { describe, expect, it } from "vitest";
import {
  CnipaConfigurableResponseDecoder,
  parseCnipaResponseSchemaConfig,
} from "./cnipa-configurable-response-decoder";

const schema = parseCnipaResponseSchemaConfig({
  list: {
    recordsPath: ["data", "records"],
    sourceRecordIdField: "id",
    totalPath: ["data", "total"],
    hasMorePath: ["data", "hasMore"],
  },
  detail: {
    rootPath: ["data"],
    sourceRecordIdField: "id",
    fields: {
      registrationNumber: "regNo",
      trademarkName: "tmName",
      decisionDate: "decisionDate",
      documentNumber: "documentNo",
      contentHtml: "contentHtml",
    },
    parties: {
      REGISTRATION_EXAMINATION: [{ field: "applicantCnName", role: "APPLICANT" }],
      OPPOSITION_DECISION: [
        { field: "objenderCnName", role: "UNVERIFIED" },
        { field: "objeperCnName", role: "UNVERIFIED" },
      ],
    },
  },
});

describe("CnipaConfigurableResponseDecoder", () => {
  it("decodes only fields declared by the source snapshot schema", () => {
    const decoder = new CnipaConfigurableResponseDecoder(schema);
    expect(
      decoder.decodeList("REGISTRATION_EXAMINATION", {
        data: { records: [{ id: "abc" }], total: 1, hasMore: false },
      }),
    ).toEqual({ sourceRecordIds: ["abc"], total: 1, hasMore: false });

    expect(
      decoder.decodeDetail("REGISTRATION_EXAMINATION", "abc", {
        data: {
          id: "abc",
          regNo: 12345678,
          tmName: "Example",
          decisionDate: "2026-01-20",
          documentNo: "DOC-1",
          contentHtml: "<p>evidence</p>",
          applicantCnName: "Applicant Co.",
        },
      }),
    ).toMatchObject({
      sourceRecordId: "abc",
      registrationNumber: "12345678",
      trademarkName: "Example",
      parties: [{ role: "APPLICANT", name: "Applicant Co.", sourceField: "applicantCnName" }],
    });
  });

  it("keeps opposition roles unverified when the source snapshot says they are unverified", () => {
    const decoder = new CnipaConfigurableResponseDecoder(schema);
    const detail = decoder.decodeDetail("OPPOSITION_DECISION", "opp-1", {
      data: {
        id: "opp-1",
        objenderCnName: "Party A",
        objeperCnName: "Party B",
      },
    });
    expect(detail.parties.map((party) => party.role)).toEqual(["UNVERIFIED", "UNVERIFIED"]);
  });

  it("fails closed when the configured envelope drifts", () => {
    const decoder = new CnipaConfigurableResponseDecoder(schema);
    expect(() =>
      decoder.decodeList("REGISTRATION_EXAMINATION", { data: { items: [] } }),
    ).toThrow(/path is missing/i);
  });
});
