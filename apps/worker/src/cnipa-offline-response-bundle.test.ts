import { mkdtemp, readFile, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CNIPA_CANDIDATE_ENDPOINTS } from "@markorbit/worker-runtime";
import { describe, expect, it } from "vitest";
import {
  parseCnipaOfflineResponseBundleArguments,
  classifyCnipaOfflineResponseBundleFailure,
} from "./cnipa-offline-response-bundle-cli";
import {
  assessCnipaOfflineResponseBundle,
  parseCnipaOfflineResponseBundleDescriptor,
} from "./cnipa-offline-response-bundle";

function registrationListEntry(responseFile = "registration-list.json") {
  return {
    id: "registration-list-1",
    documentKind: "REGISTRATION_EXAMINATION",
    surface: "LIST",
    method: "POST",
    path: CNIPA_CANDIDATE_ENDPOINTS.REGISTRATION_EXAMINATION.listPath,
    responseFile,
    status: 200,
    contentType: "application/json; charset=utf-8",
  } as const;
}

function registrationDetailEntry(responseFile = "registration-detail.json") {
  return {
    id: "registration-detail-1",
    documentKind: "REGISTRATION_EXAMINATION",
    surface: "DETAIL",
    method: "POST",
    path: CNIPA_CANDIDATE_ENDPOINTS.REGISTRATION_EXAMINATION.detailPath,
    responseFile,
    status: 200,
    contentType: "application/json",
  } as const;
}

describe("CNIPA offline response-bundle assessment", () => {
  it("emits structural evidence without raw response values, unknown fields, ids or filenames", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "markorbit-cnipa-response-"));
    const workingDirectory = path.join(root, "repo");
    const descriptorPath = path.join(root, "descriptor.json");
    const listPath = path.join(root, "registration-list.json");
    const detailPath = path.join(root, "registration-detail.json");
    const outputDirectory = path.join(root, "assessment");

    await writeFile(
      listPath,
      JSON.stringify({
        code: 200,
        data: {
          total: 1,
          list: [
            {
              adjuOpenId: "SECRET_DETAIL_ID",
              regNo: "SECRET_REGISTRATION_NUMBER",
              tmName: "SECRET_TRADEMARK_NAME",
              applicantCnName: "SECRET_PARTY_NAME",
              returnDateStr: "SECRET_DATE",
              privateField: "SECRET_UNKNOWN_VALUE",
            },
          ],
        },
      }),
      "utf8",
    );
    await writeFile(
      detailPath,
      JSON.stringify({
        code: 200,
        data: {
          title: "SECRET_TITLE",
          source: "SECRET_SOURCE",
          sendNoStr: "SECRET_DOCUMENT_NUMBER",
          fileContent: "SECRET_HTML_CONTENT",
          returnDate: "SECRET_RETURN_DATE",
          privateDetailField: "SECRET_DETAIL_UNKNOWN_VALUE",
        },
      }),
      "utf8",
    );
    await writeFile(
      descriptorPath,
      JSON.stringify({
        version: 1,
        entries: [registrationListEntry(), registrationDetailEntry()],
      }),
      "utf8",
    );

    const { manifest } = await assessCnipaOfflineResponseBundle({
      descriptorPath,
      outputDirectory,
      workingDirectory,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
    });
    const output = await readFile(path.join(outputDirectory, "manifest.json"), "utf8");

    expect(manifest.generatedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(manifest.entryCount).toBe(2);
    expect(manifest.networkRequestPerformed).toBe(false);
    expect(manifest.requestHeadersRead).toBe(false);
    expect(manifest.cookiesRead).toBe(false);
    expect(manifest.credentialValuesPersisted).toBe(false);
    expect(manifest.responseValuesPersistedInManifest).toBe(false);
    expect(manifest.verificationPromotionPerformed).toBe(false);
    expect(manifest.entries[0]).toMatchObject({
      entryIndex: 0,
      documentKind: "REGISTRATION_EXAMINATION",
      surface: "LIST",
      assessmentStatus: "CONFORMS_STATIC_EXPECTED_SHAPE",
      jsonValid: true,
      structure: {
        rootObject: true,
        dataObject: true,
        listArray: true,
        listLength: 1,
        totalType: "number",
        objectRowCount: 1,
        nonObjectRowCount: 0,
        expectedFieldsMissingFromAnyObjectRow: [],
      },
    });
    expect(manifest.entries[1]).toMatchObject({
      entryIndex: 1,
      documentKind: "REGISTRATION_EXAMINATION",
      surface: "DETAIL",
      assessmentStatus: "CONFORMS_STATIC_EXPECTED_SHAPE",
      jsonValid: true,
      structure: {
        rootObject: true,
        dataObject: true,
        requiredExpectedFieldsMissing: [],
        optionalReturnDatePresent: true,
      },
    });

    for (const forbidden of [
      "SECRET_",
      "privateField",
      "privateDetailField",
      "registration-list-1",
      "registration-detail-1",
      "registration-list.json",
      "registration-detail.json",
    ]) {
      expect(output).not.toContain(forbidden);
    }
    expect(output).toContain('"adjuOpenId"');
    expect(output).toContain('"title"');
  });

  it("reports empty list and invalid JSON without promoting verification", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "markorbit-cnipa-response-"));
    const descriptorPath = path.join(root, "descriptor.json");
    await writeFile(
      path.join(root, "empty.json"),
      JSON.stringify({ data: { total: 0, list: [] } }),
      "utf8",
    );
    await writeFile(path.join(root, "invalid.json"), "{not-json", "utf8");
    await writeFile(
      descriptorPath,
      JSON.stringify({
        version: 1,
        entries: [
          registrationListEntry("empty.json"),
          { ...registrationDetailEntry("invalid.json"), id: "registration-detail-invalid" },
        ],
      }),
      "utf8",
    );

    const { manifest } = await assessCnipaOfflineResponseBundle({
      descriptorPath,
      outputDirectory: path.join(root, "assessment"),
      workingDirectory: path.join(root, "repo"),
    });

    expect(manifest.entries.map((entry) => entry.assessmentStatus)).toEqual([
      "INSUFFICIENT_EMPTY_LIST",
      "INVALID_JSON",
    ]);
    expect(manifest.verificationPromotionPerformed).toBe(false);
  });

  it("rejects descriptor secrets and response path traversal before reading evidence", () => {
    expect(() =>
      parseCnipaOfflineResponseBundleDescriptor({
        version: 1,
        entries: [{ ...registrationListEntry(), cookie: "SECRET_VALUE" }],
      }),
    ).toThrow("credential-like unsupported field");

    expect(() =>
      parseCnipaOfflineResponseBundleDescriptor({
        version: 1,
        entries: [registrationListEntry("../outside.json")],
      }),
    ).toThrow("simple relative filename");
  });

  it("rejects response files above the per-file size ceiling without reading them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "markorbit-cnipa-response-"));
    const responsePath = path.join(root, "oversized.json");
    const descriptorPath = path.join(root, "descriptor.json");
    await writeFile(responsePath, "", "utf8");
    await truncate(responsePath, 20 * 1024 * 1024 + 1);
    await writeFile(
      descriptorPath,
      JSON.stringify({
        version: 1,
        entries: [registrationListEntry("oversized.json")],
      }),
      "utf8",
    );

    await expect(
      assessCnipaOfflineResponseBundle({
        descriptorPath,
        outputDirectory: path.join(root, "assessment"),
        workingDirectory: path.join(root, "repo"),
      }),
    ).rejects.toThrow("per-file size limit");
  });

  it("rejects assessment output inside the repository working tree", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "markorbit-cnipa-response-"));
    const workingDirectory = path.join(root, "repo");
    const descriptorPath = path.join(root, "descriptor.json");
    await writeFile(
      path.join(root, "registration-list.json"),
      JSON.stringify({ data: { total: 0, list: [] } }),
      "utf8",
    );
    await writeFile(
      descriptorPath,
      JSON.stringify({ version: 1, entries: [registrationListEntry()] }),
      "utf8",
    );

    await expect(
      assessCnipaOfflineResponseBundle({
        descriptorPath,
        outputDirectory: path.join(workingDirectory, "evidence"),
        workingDirectory,
      }),
    ).rejects.toThrow("outside the repository working tree");
  });
});

describe("CNIPA offline response-bundle CLI", () => {
  it("accepts only the documented descriptor/output arguments", () => {
    expect(
      parseCnipaOfflineResponseBundleArguments([
        "--",
        "--descriptor",
        "D:\\private\\descriptor.json",
        "--output",
        "D:\\private\\assessment",
      ]),
    ).toEqual({
      descriptorPath: "D:\\private\\descriptor.json",
      outputDirectory: "D:\\private\\assessment",
    });
    expect(() => parseCnipaOfflineResponseBundleArguments(["--token", "SECRET_VALUE"])).toThrow(
      "Unsupported CNIPA offline response-bundle argument",
    );
  });

  it("classifies CLI errors without exposing argument values", () => {
    const error = new Error("Unsupported CNIPA offline response-bundle argument: --token");
    expect(classifyCnipaOfflineResponseBundleFailure(error)).toBe("ARGUMENT_ERROR");
  });
});
