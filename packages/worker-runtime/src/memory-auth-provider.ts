import type { AuthContext, AuthProviderPort } from "./auth-provider-port";

export class MemoryAuthProvider implements AuthProviderPort {
  constructor(private readonly context: AuthContext) {}

  async getAuthContext(): Promise<AuthContext> {
    return this.context;
  }

  async refresh(): Promise<AuthContext> {
    return this.context;
  }
}
