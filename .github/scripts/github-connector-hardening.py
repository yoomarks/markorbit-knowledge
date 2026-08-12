from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)


path = Path("packages/worker-runtime/src/github-acquirer.ts")
text = path.read_text()
text = replace_once(
    text,
    "const MAX_METADATA_RESPONSE_BYTES = 25 * 1024 * 1024;\n",
    "const MAX_METADATA_RESPONSE_BYTES = 25 * 1024 * 1024;\nconst MAX_BLOB_RESPONSE_BYTES = 32 * 1024 * 1024;\n",
    "blob response constant",
)
text = replace_once(
    text,
    '  if (value.startsWith("/") || value.endsWith("/") || value.includes("\\\\") || value.includes("\\u0000")) {',
    '  if (\n    value.startsWith("/") ||\n    value.endsWith("/") ||\n    value.includes("\\\\") ||\n    /[\\u0000-\\u001f\\u007f]/.test(value)\n  ) {',
    "path prefix controls",
)
text = replace_once(
    text,
    "function safeRepositoryPath(path: string): string {\n  if (\n    !path ||",
    "function safeRepositoryPath(path: unknown): string {\n  if (\n    typeof path !== \"string\" ||\n    !path ||",
    "tree path runtime type",
)
text = replace_once(
    text,
    '    path.includes("\\\\") ||\n    path.includes("\\u0000")',
    '    path.includes("\\\\") ||\n    /[\\u0000-\\u001f\\u007f]/.test(path)',
    "tree path controls",
)
text = replace_once(
    text,
    '''function normalizeTransportError(error: unknown): never {
  if (error instanceof CollectionAcquisitionError) throw error;
  const code = record(error)?.code;''',
    '''function normalizeTransportError(error: unknown): never {
  if (error instanceof CollectionAcquisitionError) {
    if (error.code === "API_TIMEOUT") {
      throw new CollectionAcquisitionError("GITHUB_TIMEOUT", "GitHub API request timed out", true);
    }
    if (error.code === "API_RESPONSE_TOO_LARGE") {
      throw new CollectionAcquisitionError(
        "GITHUB_RESPONSE_TOO_LARGE",
        "GitHub API response exceeded the governed response bound",
        false,
      );
    }
    if (error.code.startsWith("API_")) {
      throw new CollectionAcquisitionError(
        "GITHUB_TRANSPORT_FAILED",
        "GitHub HTTPS transport failed",
        error.retryable,
      );
    }
    throw error;
  }
  const code = record(error)?.code;''',
    "transport error mapping",
)
text = replace_once(
    text,
    '''    this.maxTotalBytes = positiveInteger(options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES, "maxTotalBytes", MAX_TOTAL_BYTES);
    this.maxTreeEntries = positiveInteger''',
    '''    this.maxTotalBytes = positiveInteger(
      options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
      "maxTotalBytes",
      MAX_TOTAL_BYTES,
    );
    if (this.maxTotalBytes < this.maxFileBytes) {
      throw new Error("maxTotalBytes must be at least maxFileBytes");
    }
    this.maxTreeEntries = positiveInteger''',
    "constructor total/file relation",
)
text = replace_once(
    text,
    '''  private async request(
    resolved: ApiResolvedAddress,
    path: string,
    maxResponseBytes: number,
  ): Promise<ApiTransportResponse> {''',
    '''  private async request(
    resolved: ApiResolvedAddress,
    path: string,
    maxResponseBytes: number,
    headers: Record<string, string>,
  ): Promise<ApiTransportResponse> {''',
    "request header parameter",
)
text = replace_once(
    text,
    '        headers: requestHeaders(this.environment),',
    '        headers,',
    "request frozen headers",
)
text = replace_once(
    text,
    '''    assertSupportedJob(context, this.maxItems, this.maxDepth);
    const config = sourceConfig(context);
    let resolved: ApiResolvedAddress[];''',
    '''    assertSupportedJob(context, this.maxItems, this.maxDepth);
    const config = sourceConfig(context);
    const headers = requestHeaders(this.environment);
    let resolved: ApiResolvedAddress[];''',
    "freeze request headers",
)
text = text.replace(
    "      MAX_METADATA_RESPONSE_BYTES,\n    );",
    "      MAX_METADATA_RESPONSE_BYTES,\n      headers,\n    );",
    2,
)
text = replace_once(
    text,
    '''    const tree = parseTree(treeResponse, this.maxTreeEntries);
    const authorizedKinds = new Set(context.job.planSnapshot.output.artifactKinds);''',
    '''    const tree = parseTree(treeResponse, this.maxTreeEntries);
    const metadataBytes = commitResponse.body.byteLength + treeResponse.body.byteLength;
    if (metadataBytes > this.maxTotalBytes) {
      throw new CollectionAcquisitionError(
        "GITHUB_TOTAL_BYTES_EXCEEDED",
        `GitHub commit/tree evidence exceeds the ${this.maxTotalBytes}-byte Worker aggregate limit`,
        false,
      );
    }
    const authorizedKinds = new Set(context.job.planSnapshot.output.artifactKinds);''',
    "metadata aggregate bound",
)
text = replace_once(
    text,
    '''        Math.min(MAX_METADATA_RESPONSE_BYTES, Math.max(256 * 1024, this.maxFileBytes * 2)),
      );''',
    '''        Math.min(
          MAX_BLOB_RESPONSE_BYTES,
          Math.max(256 * 1024, Math.ceil((this.maxFileBytes * 4) / 3) + 256 * 1024),
        ),
        headers,
      );''',
    "blob response bound",
)
text = replace_once(
    text,
    "    let totalBytes = commitResponse.body.byteLength + treeResponse.body.byteLength;",
    "    let totalBytes = metadataBytes;",
    "metadata total reuse",
)
path.write_text(text)


tests = Path("packages/worker-runtime/tests/github-acquirer.test.ts")
text = tests.read_text()
anchor = '  it("rejects mixed or private GitHub API DNS answers before transport", async () => {'
addition = '''  it("rejects an invalid Worker token before DNS or transport", async () => {
    const resolver = vi.fn(async () => [{ address: "140.82.112.6", family: 4 as const }]);
    const transport = vi.fn(async () => response("{}"));
    const acquirer = new GitHubArtifactAcquirer({
      environment: { MARKORBIT_GITHUB_TOKEN: "bad\\nsecret" },
      resolver,
      transport,
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("GITHUB_CREDENTIAL_INVALID");
    expect(resolver).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("maps shared API transport failures into the GitHub error domain", async () => {
    const acquirer = new GitHubArtifactAcquirer({
      resolver: async () => [{ address: "140.82.112.6", family: 4 }],
      transport: async () => {
        throw new CollectionAcquisitionError("API_TIMEOUT", "shared timeout", true);
      },
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("GITHUB_TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain("API_");
  });

  it("fails immediately when immutable commit/tree evidence exceeds the aggregate bound", async () => {
    const blob = blobBody("a");
    const oversizedTree = treeBody([
      { path: "docs/a.md", mode: "100644", type: "blob", sha: blob.sha, size: blob.size },
    ]);
    const acquirer = new GitHubArtifactAcquirer({
      maxFileBytes: 32,
      maxTotalBytes: 64,
      resolver: async () => [{ address: "140.82.112.6", family: 4 }],
      transport: async (request) => {
        if (request.path.endsWith("/commits/main")) return response(commitBody());
        if (request.path.includes("/git/trees/")) return response(oversizedTree);
        throw new Error("blob request must not occur after metadata overflow");
      },
    });
    const error = await acquisitionError(acquirer.acquire(context()));
    expect(error.code).toBe("GITHUB_TOTAL_BYTES_EXCEEDED");
  });

'''
text = replace_once(text, anchor, addition + anchor, "hardening tests anchor")
tests.write_text(text)
