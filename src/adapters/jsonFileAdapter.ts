import { BaseDirectory, mkdir, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import type { GameState } from "../core/types";
import type { OutputAdapter } from "./outputAdapter";

interface JsonFileAdapterOptions {
  outputDirectory?: string;
  outputFileName?: string;
}

export class JsonFileAdapter implements OutputAdapter {
  private readonly outputDirectory: string;
  private readonly outputFileName: string;
  private readonly tmpFileName: string;
  private isConnected = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options?: JsonFileAdapterOptions) {
    this.outputDirectory = options?.outputDirectory ?? "captivate";
    this.outputFileName = options?.outputFileName ?? "game_state.json";
    this.tmpFileName = `${this.outputFileName}.tmp`;
  }

  async connect(): Promise<void> {
    await mkdir(this.outputDirectory, {
      baseDir: BaseDirectory.AppData,
      recursive: true,
    });

    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    await this.writeQueue;
  }

  async pushState(state: GameState): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    const payload = JSON.stringify(state, null, 2);
    this.writeQueue = this.writeQueue.then(() => this.atomicWrite(payload));
    await this.writeQueue;
  }

  async describeOutputPath(): Promise<string> {
    const basePath = await appDataDir();
    return join(basePath, this.outputDirectory, this.outputFileName);
  }

  private async atomicWrite(payload: string): Promise<void> {
    const tmpPath = `${this.outputDirectory}/${this.tmpFileName}`;
    const targetPath = `${this.outputDirectory}/${this.outputFileName}`;

    await writeTextFile(tmpPath, payload, { baseDir: BaseDirectory.AppData });
    await rename(tmpPath, targetPath, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
  }
}
