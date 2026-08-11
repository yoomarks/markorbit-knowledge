export const VAULT_BINDING_CONTRACT_VERSION = "1.0" as const;
export const VAULT_BINDING_OBJECT_TYPE = "VAULT_BINDING" as const;

export const VAULT_BINDING_ADAPTERS = ["LOCAL_FILESYSTEM"] as const;
export type VaultBindingAdapter = (typeof VAULT_BINDING_ADAPTERS)[number];

export const VAULT_BINDING_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type VaultBindingStatus = (typeof VAULT_BINDING_STATUSES)[number];

export type VaultBindingV1 = {
  contractVersion: typeof VAULT_BINDING_CONTRACT_VERSION;
  objectType: typeof VAULT_BINDING_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  name: string;
  adapter: VaultBindingAdapter;
  relativeRoot: string;
  status: VaultBindingStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
