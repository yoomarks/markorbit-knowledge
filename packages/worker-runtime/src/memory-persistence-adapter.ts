import type { PersistenceAdapter, StoredRecord } from "./persistence-adapter-port";

export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly records = new Map<string, StoredRecord>();

  async save(record: StoredRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async get(id: string): Promise<StoredRecord | null> {
    return this.records.get(id) ?? null;
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }
}
