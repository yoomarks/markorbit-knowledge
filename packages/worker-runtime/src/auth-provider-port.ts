export interface AuthContext {
  headers: Record<string, string>;
  expiresAt?: string;
}

export interface AuthProviderPort {
  getAuthContext(): Promise<AuthContext>;
  refresh?(): Promise<AuthContext>;
}
