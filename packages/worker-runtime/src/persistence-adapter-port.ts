export type PersistenceRecord = {
  id: string;
  kind: string;
  payload: unknown;
  createdAt: string;
};

export interface PersistenceAdapterPort {
  save(record: PersistenceRecord): Promise<void>;
  get(id: string): Promise<PersistenceRecord | null>;
  list(kind?: string): Promise<PersistenceRecord[]>;
}
