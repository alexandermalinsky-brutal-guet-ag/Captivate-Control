import { BaseDirectory, exists, mkdir, readDir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import type { GuiLayoutSnapshot, GuiTableSnapshot } from "../core/guiTables";

interface GuiSnapshotStoreOptions {
  snapshotDirectory?: string;
}

export interface GuiSnapshotListItem {
  fileName: string;
  name: string;
  savedAt: number;
}

function formatSnapshotTimestamp(value: number): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function formatSnapshotLabel(value: number): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function isGuiLayoutSnapshot(value: unknown): value is GuiLayoutSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<GuiLayoutSnapshot>;
  return (
    snapshot.schema === "gui-snapshot.v1" &&
    typeof snapshot.name === "string" &&
    typeof snapshot.savedAt === "number" &&
    Array.isArray(snapshot.buttonRows) &&
    Array.isArray(snapshot.textRows)
  );
}

export class GuiSnapshotStore {
  private readonly snapshotDirectory: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private connectPromise: Promise<void> | null = null;

  constructor(options?: GuiSnapshotStoreOptions) {
    this.snapshotDirectory = options?.snapshotDirectory ?? "captivate/gui-snapshots";
  }

  async connect(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = mkdir(this.snapshotDirectory, {
        baseDir: BaseDirectory.AppData,
        recursive: true,
      }).then(() => undefined);
    }

    await this.connectPromise;
  }

  async disconnect(): Promise<void> {
    this.connectPromise = null;
    await this.writeQueue;
  }

  async saveSnapshot(snapshot: GuiTableSnapshot, name?: string): Promise<GuiSnapshotListItem> {
    await this.connect();

    const savedAt = Date.now();
    const snapshotName = name?.trim() || formatSnapshotLabel(savedAt);
    const fileName = `gui_snapshot_${formatSnapshotTimestamp(savedAt)}.ccgui`;
    const payload: GuiLayoutSnapshot = {
      schema: "gui-snapshot.v1",
      name: snapshotName,
      savedAt,
      buttonRows: snapshot.buttonRows,
      textRows: snapshot.textRows,
    };

    this.writeQueue = this.writeQueue.then(() => this.atomicWrite(fileName, JSON.stringify(payload, null, 2)));
    await this.writeQueue;

    return {
      fileName,
      name: snapshotName,
      savedAt,
    };
  }

  async listSnapshots(): Promise<GuiSnapshotListItem[]> {
    await this.connect();

    const directoryExists = await exists(this.snapshotDirectory, {
      baseDir: BaseDirectory.AppData,
    });

    if (!directoryExists) {
      return [];
    }

    const entries = await readDir(this.snapshotDirectory, {
      baseDir: BaseDirectory.AppData,
    });

    const snapshots = await Promise.all(
      entries
        .filter((entry) => entry.isFile && entry.name?.endsWith(".ccgui"))
        .map(async (entry) => {
          const fileName = entry.name;
          if (!fileName) {
            return null;
          }

          const loaded = await this.loadSnapshot(fileName);
          if (!loaded) {
            return null;
          }

          return {
            fileName,
            name: loaded.name,
            savedAt: loaded.savedAt,
          } satisfies GuiSnapshotListItem;
        })
    );

    return snapshots
      .filter((item): item is GuiSnapshotListItem => item !== null)
      .sort((left, right) => right.savedAt - left.savedAt);
  }

  async loadSnapshot(fileName: string): Promise<GuiLayoutSnapshot | null> {
    await this.connect();

    const path = `${this.snapshotDirectory}/${fileName}`;
    const fileExists = await exists(path, { baseDir: BaseDirectory.AppData });

    if (!fileExists) {
      return null;
    }

    const content = await readTextFile(path, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(content) as unknown;
    return isGuiLayoutSnapshot(parsed) ? parsed : null;
  }

  async exportSnapshotToPath(
    path: string,
    snapshot: GuiTableSnapshot,
    name?: string
  ): Promise<GuiLayoutSnapshot> {
    const savedAt = Date.now();
    const snapshotName = name?.trim() || formatSnapshotLabel(savedAt);
    const payload: GuiLayoutSnapshot = {
      schema: "gui-snapshot.v1",
      name: snapshotName,
      savedAt,
      buttonRows: snapshot.buttonRows,
      textRows: snapshot.textRows,
    };

    await writeTextFile(path, JSON.stringify(payload, null, 2));
    return payload;
  }

  async importSnapshotFromPath(path: string): Promise<GuiLayoutSnapshot | null> {
    const content = await readTextFile(path);
    const parsed = JSON.parse(content) as unknown;
    return isGuiLayoutSnapshot(parsed) ? parsed : null;
  }

  buildDefaultExportFileName(): string {
    return `gui_snapshot_${formatSnapshotTimestamp(Date.now())}.ccgui`;
  }

  private async atomicWrite(fileName: string, payload: string): Promise<void> {
    const targetPath = `${this.snapshotDirectory}/${fileName}`;
    const tmpPath = `${targetPath}.tmp`;

    await writeTextFile(tmpPath, payload, { baseDir: BaseDirectory.AppData });
    await rename(tmpPath, targetPath, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
  }
}
