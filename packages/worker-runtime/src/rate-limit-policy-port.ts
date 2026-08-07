export interface RateLimitPolicyPort {
  wait(): Promise<void>;
}
