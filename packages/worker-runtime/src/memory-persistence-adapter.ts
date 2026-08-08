import type { PersistenceAdapterPort, PersistenceRecord } from "./persistence-adapter-port";

export class MemoryPersistenceAdapter implements PersistenceAdapterPort {
  private readonly records = new Map<string, PersistenceRecord>();

  async save(record: PersistenceRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async get(id: string): Promise<PersistenceRecord | null> {
    return this.records.get(id) ?? null;
  }

  async list(kind?: string): Promise<PersistenceRecord[]> {
    const records = [...this.records.values()];
    return kind === undefined ? records : records.filter((record) => record.kind === kind);
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }
}
