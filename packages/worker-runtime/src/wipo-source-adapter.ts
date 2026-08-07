import { type SourceAdapterPort } from "./source-adapter-port";

export class WipoSourceAdapter implements SourceAdapterPort {
  readonly sourceId = "WIPO";

  async fetch(request: unknown): Promise<unknown> {
    return {
      source: this.sourceId,
      status: "SKELETON",
      request,
      message: "WIPO adapter ready for API implementation",
    };
  }
}
