import type { SourceParserPort } from "./source-parser-port";

export type ParsedTrademarkRecord = {
  source: "USPTO";
  applicationNumber?: string;
  registrationNumber?: string;
  mark?: string;
  owner?: string;
  status?: string;
  raw: unknown;
};

export class UsptoSourceParser implements SourceParserPort<ParsedTrademarkRecord> {
  parse(input: unknown): ParsedTrademarkRecord {
    const data = input as Record<string, unknown>;

    return {
      source: "USPTO",
      applicationNumber:
        typeof data.applicationNumber === "string" ? data.applicationNumber : undefined,
      registrationNumber:
        typeof data.registrationNumber === "string" ? data.registrationNumber : undefined,
      mark: typeof data.mark === "string" ? data.mark : undefined,
      owner: typeof data.owner === "string" ? data.owner : undefined,
      status: typeof data.status === "string" ? data.status : undefined,
      raw: input,
    };
  }
}
