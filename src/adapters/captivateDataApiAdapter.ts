import { invoke } from "@tauri-apps/api/core";
import type { DataTable } from "../core/dataTables";

const DEFAULT_DATA_API_PORT = 45455;

export interface CaptivateDataApiRequestLogEntry {
  ts: number;
  method: string;
  path: string;
  status: number;
}

export interface CaptivateDataApiStatus {
  running: boolean;
  bindAddr: string | null;
  tableCount: number;
  publishedAt: number | null;
  recentRequests: CaptivateDataApiRequestLogEntry[];
}

let dataApiStartPromise: Promise<CaptivateDataApiStatus> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function startCaptivateDataApi(
  port: number = DEFAULT_DATA_API_PORT
): Promise<CaptivateDataApiStatus | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!dataApiStartPromise) {
    dataApiStartPromise = invoke<CaptivateDataApiStatus>("data_api_start", { port }).catch((error) => {
      dataApiStartPromise = null;
      throw error;
    });
  }

  return dataApiStartPromise;
}

export async function getCaptivateDataApiStatus(): Promise<CaptivateDataApiStatus | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke<CaptivateDataApiStatus>("data_api_status");
}

export async function publishCaptivateDataTables(tables: DataTable[]): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("data_api_publish_tables", { tables });
}

export interface CaptivateTableSelectInstance {
  id: string;
  label: string;
  sourceTableId: string;
}

export async function publishCaptivateTableSelects(
  instances: CaptivateTableSelectInstance[]
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("data_api_publish_table_selects", { instances });
}

export async function stopCaptivateDataApi(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("data_api_stop");
  dataApiStartPromise = null;
}
