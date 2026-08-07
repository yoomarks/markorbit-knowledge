import { type SourceAdapterPort } from "./source-adapter-port";

export class CnipaSourceAdapter implements SourceAdapterPort {
  readonly sourceId = "CNIPA";

  async fetch(request: unknown): Promise<unknown> {
    return {
      source: this.sourceId,
      status: "SKELETON",
      request,
      message: "CNIPA adapter ready for API implementation",
    };
  }
}
