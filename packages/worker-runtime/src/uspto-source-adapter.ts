import { type SourceAdapterPort } from "./source-adapter-port";

export class UsptoSourceAdapter implements SourceAdapterPort {
  readonly sourceId = "USPTO";

  async fetch(request: unknown): Promise<unknown> {
    return {
      source: this.sourceId,
      status: "SKELETON",
      request,
      message: "USPTO adapter ready for API implementation",
    };
  }
}
