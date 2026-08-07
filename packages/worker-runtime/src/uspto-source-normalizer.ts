export interface NormalizedTrademarkRecord {
  source: string;
  applicationNumber: string;
  registrationNumber?: string;
  mark: string;
  owner?: string;
  status?: string;
  normalizedAt: string;
}

export class UsptoSourceNormalizer {
  normalize(input: {
    applicationNumber?: string;
    registrationNumber?: string;
    mark?: string;
    owner?: string;
    status?: string;
  }): NormalizedTrademarkRecord {
    return {
      source: "USPTO",
      applicationNumber: input.applicationNumber ?? "",
      registrationNumber: input.registrationNumber,
      mark: (input.mark ?? "").trim(),
      owner: input.owner?.trim(),
      status: input.status?.trim(),
      normalizedAt: new Date().toISOString(),
    };
  }
}
