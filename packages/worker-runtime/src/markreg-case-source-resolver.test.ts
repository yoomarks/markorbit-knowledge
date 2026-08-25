import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  type CaseCandidateV1,
} from "@markorbit/contracts";
import {
  ConfiguredMarkRegCaseSourceResolver,
  MARKREG_CASE_SOURCE_ENV,
  markRegCaseSourceResolverFromEnvironment,
} from "./markreg-case-source-resolver";

const workspaceId = "workspace:case-source";

function candidate(overrides: Partial<CaseCandidateV1> = {}): CaseCandidateV1 {
  return {
    protocolVersion: CASE_CANDIDATE_PROTOCOL_VERSION,
    objectType: CASE_CANDIDATE_OBJECT_TYPE,
    candidateId: "case-candidate_resolver_01",
    sourceSystem: CASE_CANDIDATE_SOURCE_SYSTEM,
    sourceMatterId: "formal-matter_resolver_01",
    sourceMatterVersion: 1,
    sourceSnapshotSha256: "a".repeat(64),
    sourceRetrievalRef: "/v1/formal-matters/formal-matter_resolver_01",
    promotedBy: "operator:resolver-test",
    promotedAt: "2026-08-25T17:55:00.000Z",
    accessScope: {
      sourceWorkspaceId: workspaceId,
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: "resolver-test-001",
    ...overrides,
  };
}

function options() {
  return {
    baseUrl: "https://markreg.internal.example/",
    workspaceId,
    internalServiceSecret: "server-to-server-secret",
    internalWorkspacePrincipal: "encoded-workspace-principal",
  };
}

describe("ConfiguredMarkRegCaseSourceResolver", () => {
  it("resolves exact configured access for the matching frozen Workspace", async () => {
    const resolver = new ConfiguredMarkRegCaseSourceResolver(options());

    await expect(resolver.resolve(candidate())).resolves.toEqual({
      baseUrl: "https://markreg.internal.example",
      workspaceId,
      internalAuthorization: "server-to-server-secret",
      internalPrincipal: "encoded-workspace-principal",
    });
  });

  it("fails closed before transport when the Case Candidate Workspace differs", async () => {
    const resolver = new ConfiguredMarkRegCaseSourceResolver(options());

    await expect(
      resolver.resolve(
        candidate({
          accessScope: {
            sourceWorkspaceId: "workspace:other",
            classification: "CONFIDENTIAL",
          },
        }),
      ),
    ).rejects.toMatchObject({
      code: "MARKREG_WORKSPACE_MISMATCH",
      retryable: false,
    });
  });

  it("rejects invalid service URLs and embedded credentials", () => {
    expect(
      () => new ConfiguredMarkRegCaseSourceResolver({ ...options(), baseUrl: "ftp://markreg.test" }),
    ).toThrowError(/HTTP\(S\)/u);
    expect(
      () =>
        new ConfiguredMarkRegCaseSourceResolver({
          ...options(),
          baseUrl: "https://user:secret@markreg.test",
        }),
    ).toThrowError(/without credentials/u);
    expect(
      () =>
        new ConfiguredMarkRegCaseSourceResolver({
          ...options(),
          baseUrl: "https://markreg.test?workspace=other",
        }),
    ).toThrowError(/query/u);
  });

  it("rejects blank or oversized sensitive runtime configuration", () => {
    expect(
      () =>
        new ConfiguredMarkRegCaseSourceResolver({
          ...options(),
          internalServiceSecret: "   ",
        }),
    ).toThrowError(/internal service secret/u);
    expect(
      () =>
        new ConfiguredMarkRegCaseSourceResolver({
          ...options(),
          internalWorkspacePrincipal: "p".repeat(32_769),
        }),
    ).toThrowError(/Workspace Principal/u);
  });

  it("builds from explicit environment configuration and fails closed when one value is absent", async () => {
    const environment = {
      [MARKREG_CASE_SOURCE_ENV.baseUrl]: "https://markreg.internal.example",
      [MARKREG_CASE_SOURCE_ENV.workspaceId]: workspaceId,
      [MARKREG_CASE_SOURCE_ENV.internalServiceSecret]: "runtime-secret",
      [MARKREG_CASE_SOURCE_ENV.internalWorkspacePrincipal]: "runtime-principal",
    };
    const resolver = markRegCaseSourceResolverFromEnvironment(environment);

    await expect(resolver.resolve(candidate())).resolves.toMatchObject({
      baseUrl: "https://markreg.internal.example",
      workspaceId,
      internalAuthorization: "runtime-secret",
      internalPrincipal: "runtime-principal",
    });

    const incomplete = { ...environment };
    delete incomplete[MARKREG_CASE_SOURCE_ENV.internalWorkspacePrincipal];
    expect(() => markRegCaseSourceResolverFromEnvironment(incomplete)).toThrowError(
      new RegExp(MARKREG_CASE_SOURCE_ENV.internalWorkspacePrincipal, "u"),
    );
  });

  it("does not accept a non-MarkReg source at runtime", async () => {
    const resolver = new ConfiguredMarkRegCaseSourceResolver(options());
    const invalid = { ...candidate(), sourceSystem: "OTHER" } as unknown as CaseCandidateV1;

    await expect(resolver.resolve(invalid)).rejects.toMatchObject({
      code: "MARKREG_SOURCE_SYSTEM_UNSUPPORTED",
      retryable: false,
    });
  });
});
