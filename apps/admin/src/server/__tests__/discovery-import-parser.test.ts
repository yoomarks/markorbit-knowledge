import { describe, expect, it } from "vitest";
import { parseDiscoveryImport } from "../discovery-import-parser";

function storedZip(files: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const content = Buffer.from(file.content, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

describe("parseDiscoveryImport", () => {
  it("parses CSV rows, normalizes metadata, and flags duplicate origins", () => {
    const csv = [
      "url,category,authority,jurisdiction,language,note,tags",
      'https://www.uspto.gov/trademarks,official_authority,primary,us,en,"Official, trademark source",official|trademark',
      "https://uspto.gov/patents,official_guidance,secondary,us,en,Same website,guide",
      "not-a-url,law_firm,professional,cn,zh-CN,Bad URL,peer",
    ].join("\n");

    const preview = parseDiscoveryImport({
      fileName: "sources.csv",
      content: Buffer.from(csv),
    });

    expect(preview.format).toBe("CSV");
    expect(preview.summary).toEqual({
      parsed: 3,
      valid: 1,
      invalid: 1,
      duplicate: 1,
      truncated: false,
    });
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 2,
      locator: "https://www.uspto.gov/trademarks",
      origin: "https://www.uspto.gov",
      status: "VALID",
      intake: {
        category: "OFFICIAL_AUTHORITY",
        authorityLevel: "PRIMARY_OFFICIAL",
        jurisdictions: ["US"],
        languages: ["en"],
        note: "Official, trademark source",
        tags: ["official", "trademark"],
      },
    });
    expect(preview.rows[1]?.status).toBe("DUPLICATE");
    expect(preview.rows[2]?.status).toBe("INVALID");
  });

  it("reads the first worksheet from a basic XLSX package without a spreadsheet dependency", () => {
    const workbook = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sources" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const relationships = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>`;
    const worksheet = `<?xml version="1.0"?><worksheet><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>url</t></is></c><c r="B1" t="inlineStr"><is><t>category</t></is></c><c r="C1" t="inlineStr"><is><t>jurisdiction</t></is></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>https://www.wipo.int/madrid/</t></is></c><c r="B2" t="inlineStr"><is><t>official_authority</t></is></c><c r="C2" t="inlineStr"><is><t>wipo</t></is></c></row>
    </sheetData></worksheet>`;
    const xlsx = storedZip([
      { name: "xl/workbook.xml", content: workbook },
      { name: "xl/_rels/workbook.xml.rels", content: relationships },
      { name: "xl/worksheets/sheet1.xml", content: worksheet },
    ]);

    const preview = parseDiscoveryImport({ fileName: "sources.xlsx", content: xlsx });

    expect(preview.format).toBe("XLSX");
    expect(preview.sheetName).toBe("Sources");
    expect(preview.summary.valid).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      locator: "https://www.wipo.int/madrid/",
      status: "VALID",
      intake: {
        category: "OFFICIAL_AUTHORITY",
        jurisdictions: ["WIPO"],
      },
    });
  });
});
