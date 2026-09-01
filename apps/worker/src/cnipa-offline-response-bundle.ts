import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CNIPA_CANDIDATE_ENDPOINTS,
  CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE,
  type CnipaDocumentKind,
} from "@markorbit/worker-runtime";
import { assertPathOutsideWorkingTree } from "./cnipa-live-acceptance";

const DESCRIPTOR_SCHEMA = "markorbit-cnipa-offline-response-bundle-v1" as const;
export const CNIPA_OFFLINE_RESPONSE_ASSESSMENT_SCHEMA =
  "markorbit-cnipa-offline-response-assessment-v1" as const;

const MAX_DESCRIPTOR_BYTES = 1 * 1024 * 1024;
const MAX_ENTRIES = 50;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_RESPONSE_BYTES = 100 * 1024 * 1024;
const ENTRY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESPONSE_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SENSITIVE_FIELD =
  /(authorization|cookie|token|secret|password|passwd|credential|api[-_.]?key|access[-_.]?key)/i;
const AUTH_FIELD = /(?:^|[-_.])auth(?:$|[-_.])/i;

const DESCRIPTOR_ROOT_KEYS = ["version", "entries"] as const;
const DESCRIPTOR_ENTRY_KEYS = [
  "id",
  "documentKind",
  "surface",
  "method",
  "path",
  "responseFile",
  "status",
  "contentType",
] as const;

export type CnipaOfflineResponseBundleEntry = {
  id: string;
  documentKind: CnipaDocumentKind;
  surface: "LIST" | "DETAIL";
  method: "POST";
  path: string;
  responseFile: string;
  status: number;
  contentType: "application/json";
};

export type CnipaOfflineResponseBundleDescriptor = {
  version: 1;
  entries: CnipaOfflineResponseBundleEntry[];
};

export type CnipaOfflineResponseAssessmentStatus =
  | "CONFORMS_STATIC_EXPECTED_SHAPE"
  | "MISMATCH_STATIC_EXPECTED_SHAPE"
  | "INSUFFICIENT_EMPTY_LIST"
  | "INVALID_JSON";

export type CnipaOfflineResponseListStructure = {
  rootObject: boolean;
  dataObject: boolean;
  listArray: boolean;
  listLength: number | null;
  totalType: "number" | "string" | "null" | "missing" | "other";
  objectRowCount: number | null;
  nonObjectRowCount: number | null;
  expectedFields: readonly string[];
  expectedFieldsPresentOnEveryObjectRow: string[];
  expectedFieldsMissingFromAnyObjectRow: string[];
};

export type CnipaOfflineResponseDetailStructure = {
  rootObject: boolean;
  dataObject: boolean;
  requiredExpectedFields: readonly string[];
  requiredExpectedFieldsPresent: string[];
  requiredExpectedFieldsMissing: string[];
  optionalReturnDatePresent: boolean;
};

export type CnipaOfflineResponseAssessmentEntry = {
  entryIndex: number;
  documentKind: CnipaDocumentKind;
  surface: "LIST" | "DETAIL";
  method: "POST";
  path: string;
  status: number;
  contentType: "application/json";
  responseSha256: string;
  responseBytes: number;
  jsonValid: boolean;
  assessmentStatus: CnipaOfflineResponseAssessmentStatus;
  structure: CnipaOfflineResponseListStructure | CnipaOfflineResponseDetailStructure | null;
};

export type CnipaOfflineResponseAssessmentManifest = {
  schema: typeof CNIPA_OFFLINE_RESPONSE_ASSESSMENT_SCHEMA;
  generatedAt: string;
  descriptorSchema: typeof DESCRIPTOR_SCHEMA;
  descriptorSha256: string;
  entryCount: number;
  networkRequestPerformed: false;
  requestHeadersRead: false;
  cookiesRead: false;
  credentialValuesPersisted: false;
  responseValuesPersistedInManifest: false;
  verificationPromotionPerformed: false;
  entries: CnipaOfflineResponseAssessmentEntry[];
};

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fail(message: string): never {
  throw new Error(`CNIPA offline response bundle invalid: ${message}`);
}

function assertOnlyKeys(input: Record<string, unknown>, allowed: readonly string[], label: string) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(input).filter((key) => !allowedSet.has(key));
  if (unexpected.length === 0) return;
  if (unexpected.some((key) => SENSITIVE_FIELD.test(key) || AUTH_FIELD.test(key))) {
    fail(`${label} contains a credential-like unsupported field`);
  }
  fail(`${label} contains unsupported fields`);
}

function parseDocumentKind(value: unknown): CnipaDocumentKind {
  if (
    value !== "REGISTRATION_EXAMINATION" &&
    value !== "OPPOSITION_DECISION" &&
    value !== "REVIEW_ADJUDICATION"
  ) {
    fail("entry documentKind is unsupported");
  }
  return value;
}

function parseContentType(value: unknown): "application/json" {
  if (typeof value !== "string" || value.length > 256) fail("entry contentType is invalid");
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
    fail("entry contentType must describe JSON");
  }
  return "application/json";
}

function parseEntry(value: unknown, index: number): CnipaOfflineResponseBundleEntry {
  const input = objectRecord(value);
  if (!input) fail(`entries[${index}] must be an object`);
  assertOnlyKeys(input, DESCRIPTOR_ENTRY_KEYS, `entries[${index}]`);

  if (typeof input.id !== "string" || !ENTRY_ID_PATTERN.test(input.id)) {
    fail(`entries[${index}].id must be a lowercase slug`);
  }
  const documentKind = parseDocumentKind(input.documentKind);
  if (input.surface !== "LIST" && input.surface !== "DETAIL") {
    fail(`entries[${index}].surface must be LIST or DETAIL`);
  }
  if (input.method !== "POST") fail(`entries[${index}].method must be POST`);

  const expectedEndpoint = CNIPA_CANDIDATE_ENDPOINTS[documentKind];
  const expectedPath =
    input.surface === "LIST" ? expectedEndpoint.listPath : expectedEndpoint.detailPath;
  if (input.path !== expectedPath) {
    fail(`entries[${index}].path must exactly match the frozen candidate endpoint`);
  }

  if (
    typeof input.responseFile !== "string" ||
    path.isAbsolute(input.responseFile) ||
    !RESPONSE_FILE_PATTERN.test(input.responseFile)
  ) {
    fail(`entries[${index}].responseFile must be a simple relative filename`);
  }
  if (
    !Number.isSafeInteger(input.status) ||
    (input.status as number) < 100 ||
    (input.status as number) > 599
  ) {
    fail(`entries[${index}].status must be an HTTP status integer`);
  }

  return {
    id: input.id,
    documentKind,
    surface: input.surface,
    method: "POST",
    path: expectedPath,
    responseFile: input.responseFile,
    status: input.status as number,
    contentType: parseContentType(input.contentType),
  };
}

export function parseCnipaOfflineResponseBundleDescriptor(
  value: unknown,
): CnipaOfflineResponseBundleDescriptor {
  const input = objectRecord(value);
  if (!input) fail("root must be an object");
  assertOnlyKeys(input, DESCRIPTOR_ROOT_KEYS, "root");
  if (input.version !== 1) fail("version must be 1");
  if (
    !Array.isArray(input.entries) ||
    input.entries.length === 0 ||
    input.entries.length > MAX_ENTRIES
  ) {
    fail(`entries must contain between 1 and ${MAX_ENTRIES} items`);
  }
  const entries = input.entries.map(parseEntry);
  const ids = new Set<string>();
  const responseFiles = new Set<string>();
  for (const item of entries) {
    if (ids.has(item.id)) fail("entry ids must be unique");
    ids.add(item.id);
    const normalizedFile = item.responseFile.toLowerCase();
    if (responseFiles.has(normalizedFile)) fail("response filenames must be unique");
    responseFiles.add(normalizedFile);
  }
  return { version: 1, entries };
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function valueType(
  value: unknown,
  exists: boolean,
): CnipaOfflineResponseListStructure["totalType"] {
  if (!exists) return "missing";
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return "other";
}

function hasOwn(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function assessList(
  documentKind: CnipaDocumentKind,
  root: unknown,
): {
  assessmentStatus: CnipaOfflineResponseAssessmentStatus;
  structure: CnipaOfflineResponseListStructure;
} {
  const rootObject = objectRecord(root);
  const dataObject = rootObject ? objectRecord(rootObject.data) : null;
  const list = dataObject && Array.isArray(dataObject.list) ? dataObject.list : null;
  const expectedFields =
    CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.byDocumentKind[documentKind].frontendConsumedListFields;
  const objectRows =
    list?.map(objectRecord).filter((row): row is Record<string, unknown> => row !== null) ?? [];
  const presentOnEvery =
    objectRows.length === 0
      ? []
      : expectedFields.filter((field) => objectRows.every((row) => hasOwn(row, field)));
  const missingFromAny = expectedFields.filter((field) => !presentOnEvery.includes(field));
  const structure: CnipaOfflineResponseListStructure = {
    rootObject: rootObject !== null,
    dataObject: dataObject !== null,
    listArray: list !== null,
    listLength: list?.length ?? null,
    totalType: valueType(dataObject?.total, dataObject ? hasOwn(dataObject, "total") : false),
    objectRowCount: list ? objectRows.length : null,
    nonObjectRowCount: list ? list.length - objectRows.length : null,
    expectedFields,
    expectedFieldsPresentOnEveryObjectRow: presentOnEvery,
    expectedFieldsMissingFromAnyObjectRow: missingFromAny,
  };

  if (
    !rootObject ||
    !dataObject ||
    !list ||
    structure.totalType === "missing" ||
    structure.totalType === "other"
  ) {
    return { assessmentStatus: "MISMATCH_STATIC_EXPECTED_SHAPE", structure };
  }
  if (list.length === 0) return { assessmentStatus: "INSUFFICIENT_EMPTY_LIST", structure };
  if (objectRows.length !== list.length || missingFromAny.length > 0) {
    return { assessmentStatus: "MISMATCH_STATIC_EXPECTED_SHAPE", structure };
  }
  return { assessmentStatus: "CONFORMS_STATIC_EXPECTED_SHAPE", structure };
}

function assessDetail(root: unknown): {
  assessmentStatus: CnipaOfflineResponseAssessmentStatus;
  structure: CnipaOfflineResponseDetailStructure;
} {
  const rootObject = objectRecord(root);
  const dataObject = rootObject ? objectRecord(rootObject.data) : null;
  const allExpected = CNIPA_FRONTEND_STATIC_CONTRACT_EVIDENCE.sharedDetailViewConsumedFields;
  const requiredExpectedFields = allExpected.filter((field) => field !== "returnDate");
  const present = dataObject
    ? requiredExpectedFields.filter((field) => hasOwn(dataObject, field))
    : [];
  const missing = requiredExpectedFields.filter((field) => !present.includes(field));
  const structure: CnipaOfflineResponseDetailStructure = {
    rootObject: rootObject !== null,
    dataObject: dataObject !== null,
    requiredExpectedFields,
    requiredExpectedFieldsPresent: present,
    requiredExpectedFieldsMissing: missing,
    optionalReturnDatePresent: dataObject ? hasOwn(dataObject, "returnDate") : false,
  };
  return {
    assessmentStatus:
      rootObject && dataObject && missing.length === 0
        ? "CONFORMS_STATIC_EXPECTED_SHAPE"
        : "MISMATCH_STATIC_EXPECTED_SHAPE",
    structure,
  };
}

function decodeJson(bytes: Uint8Array): { valid: true; value: unknown } | { valid: false } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { valid: true, value: JSON.parse(text) as unknown };
  } catch {
    return { valid: false };
  }
}

async function resolveResponsePath(bundleDirectory: string, responseFile: string): Promise<string> {
  const candidate = path.join(bundleDirectory, responseFile);
  const resolved = await realpath(candidate);
  const relative = path.relative(bundleDirectory, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail("response file resolves outside the response bundle directory");
  }
  const metadata = await stat(resolved);
  if (!metadata.isFile()) fail("response evidence must be a regular file");
  if (metadata.size > MAX_RESPONSE_BYTES) fail("response evidence exceeds the per-file size limit");
  return resolved;
}

async function loadDescriptor(input: {
  descriptorPath: string;
  workingDirectory: string;
}): Promise<{
  descriptor: CnipaOfflineResponseBundleDescriptor;
  descriptorSha256: string;
  bundleDirectory: string;
}> {
  const lexicalPath = assertPathOutsideWorkingTree(input.descriptorPath, input.workingDirectory);
  const descriptorPath = await realpath(lexicalPath);
  assertPathOutsideWorkingTree(descriptorPath, input.workingDirectory);
  const metadata = await stat(descriptorPath);
  if (!metadata.isFile()) fail("descriptor must be a regular file");
  if (metadata.size > MAX_DESCRIPTOR_BYTES) fail("descriptor exceeds the size limit");
  const bytes = await readFile(descriptorPath);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    fail("descriptor must be valid UTF-8 JSON");
  }
  return {
    descriptor: parseCnipaOfflineResponseBundleDescriptor(value),
    descriptorSha256: sha256(bytes),
    bundleDirectory: await realpath(path.dirname(descriptorPath)),
  };
}

async function createOutputDirectory(
  outputDirectory: string,
  workingDirectory: string,
): Promise<string> {
  const lexicalPath = assertPathOutsideWorkingTree(outputDirectory, workingDirectory);
  const realParent = await realpath(path.dirname(lexicalPath));
  const resolved = path.join(realParent, path.basename(lexicalPath));
  assertPathOutsideWorkingTree(resolved, workingDirectory);
  await mkdir(resolved, { recursive: false });
  return resolved;
}

export async function assessCnipaOfflineResponseBundle(input: {
  descriptorPath: string;
  outputDirectory: string;
  workingDirectory?: string;
  now?: () => Date;
}): Promise<{ manifest: CnipaOfflineResponseAssessmentManifest; manifestPath: string }> {
  const workingDirectory = input.workingDirectory ?? process.cwd();
  const loaded = await loadDescriptor({ descriptorPath: input.descriptorPath, workingDirectory });
  const entries: CnipaOfflineResponseAssessmentEntry[] = [];
  let totalResponseBytes = 0;

  for (const [index, item] of loaded.descriptor.entries.entries()) {
    const responsePath = await resolveResponsePath(loaded.bundleDirectory, item.responseFile);
    const bytes = await readFile(responsePath);
    totalResponseBytes += bytes.byteLength;
    if (totalResponseBytes > MAX_TOTAL_RESPONSE_BYTES) {
      fail("response bundle exceeds the total size limit");
    }
    const decoded = decodeJson(bytes);
    if (!decoded.valid) {
      entries.push({
        entryIndex: index,
        documentKind: item.documentKind,
        surface: item.surface,
        method: item.method,
        path: item.path,
        status: item.status,
        contentType: item.contentType,
        responseSha256: sha256(bytes),
        responseBytes: bytes.byteLength,
        jsonValid: false,
        assessmentStatus: "INVALID_JSON",
        structure: null,
      });
      continue;
    }

    const assessed =
      item.surface === "LIST"
        ? assessList(item.documentKind, decoded.value)
        : assessDetail(decoded.value);
    entries.push({
      entryIndex: index,
      documentKind: item.documentKind,
      surface: item.surface,
      method: item.method,
      path: item.path,
      status: item.status,
      contentType: item.contentType,
      responseSha256: sha256(bytes),
      responseBytes: bytes.byteLength,
      jsonValid: true,
      assessmentStatus: assessed.assessmentStatus,
      structure: assessed.structure,
    });
  }

  const manifest: CnipaOfflineResponseAssessmentManifest = {
    schema: CNIPA_OFFLINE_RESPONSE_ASSESSMENT_SCHEMA,
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    descriptorSchema: DESCRIPTOR_SCHEMA,
    descriptorSha256: loaded.descriptorSha256,
    entryCount: entries.length,
    networkRequestPerformed: false,
    requestHeadersRead: false,
    cookiesRead: false,
    credentialValuesPersisted: false,
    responseValuesPersistedInManifest: false,
    verificationPromotionPerformed: false,
    entries,
  };

  const outputDirectory = await createOutputDirectory(input.outputDirectory, workingDirectory);
  const manifestPath = path.join(outputDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return { manifest, manifestPath };
}
