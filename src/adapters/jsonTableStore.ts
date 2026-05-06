import { BaseDirectory, exists, mkdir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";

interface JsonTableStoreOptions {
  tableDirectory?: string;
}

export class JsonTableStore {
  private readonly tableDirectory: string;
  private isConnected = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options?: JsonTableStoreOptions) {
    this.tableDirectory = options?.tableDirectory ?? "captivate/tables";
  }

  async connect(): Promise<void> {
    await mkdir(this.tableDirectory, {
      baseDir: BaseDirectory.AppData,
      recursive: true,
    });

    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    await this.writeQueue;
  }

  async loadTable<TRecord>(tableName: string): Promise<TRecord[]> {
    const path = this.getTablePath(tableName);
    const tableExists = await exists(path, { baseDir: BaseDirectory.AppData });

    if (!tableExists) {
      return [];
    }

    const content = await readTextFile(path, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(content) as TRecord[];

    return Array.isArray(parsed) ? parsed : [];
  }

  async loadRecord<TRecord>(recordName: string): Promise<TRecord | null> {
    const path = this.getTablePath(recordName);
    const recordExists = await exists(path, { baseDir: BaseDirectory.AppData });

    if (!recordExists) {
      return null;
    }

    const content = await readTextFile(path, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(content) as TRecord | null;

    return parsed && typeof parsed === "object" ? parsed : null;
  }

  async saveTable<TRecord>(tableName: string, records: TRecord[]): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    const payload = JSON.stringify(records, null, 2);
    this.writeQueue = this.writeQueue.then(() => this.atomicWrite(tableName, payload));
    await this.writeQueue;
  }

  async saveRecord<TRecord>(recordName: string, record: TRecord): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    const payload = JSON.stringify(record, null, 2);
    this.writeQueue = this.writeQueue.then(() => this.atomicWrite(recordName, payload));
    await this.writeQueue;
  }

  private async atomicWrite(tableName: string, payload: string): Promise<void> {
    const targetPath = this.getTablePath(tableName);
    const tmpPath = `${targetPath}.tmp`;

    await writeTextFile(tmpPath, payload, { baseDir: BaseDirectory.AppData });
    await rename(tmpPath, targetPath, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
  }

  private getTablePath(tableName: string): string {
    return `${this.tableDirectory}/${tableName}.json`;
  }
}
