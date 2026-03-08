import { invoke } from "@tauri-apps/api/core";
import type { GuiCaptivateButtonBindingRow } from "../core/guiTables";

const DEFAULT_BRIDGE_PORT = 45454;

export interface CaptivateBridgeStatus {
  running: boolean;
  bindAddr: string | null;
  connectedClients: number;
}

export interface CaptivateTriggerTransportPayload extends GuiCaptivateButtonBindingRow {
  triggeredAt: number;
}

export interface CaptivateDataPushPayload {
  mode: "input" | "title";
  target: string;
  action?: string;
  variables: Record<string, unknown>;
}

let bridgeStartPromise: Promise<CaptivateBridgeStatus> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function startCaptivateBridge(port: number = DEFAULT_BRIDGE_PORT): Promise<CaptivateBridgeStatus | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!bridgeStartPromise) {
    bridgeStartPromise = invoke<CaptivateBridgeStatus>("captivate_start_bridge", { port }).catch((error) => {
      bridgeStartPromise = null;
      throw error;
    });
  }

  return bridgeStartPromise;
}

export async function getCaptivateBridgeStatus(): Promise<CaptivateBridgeStatus | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke<CaptivateBridgeStatus>("captivate_bridge_status");
}

export async function sendCaptivateButtonTrigger(trigger: CaptivateTriggerTransportPayload): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("captivate_send_button_trigger", {
    trigger,
  });
}

export async function requestCaptivateLayerSync(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("captivate_request_layer_sync");
}

export async function getCaptivateLayerNames(): Promise<string[] | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke<string[]>("captivate_get_layer_names");
}

export async function sendCaptivateDataPush(payload: CaptivateDataPushPayload): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("captivate_send_data_push", { payload });
}

export async function sendCaptivateCommand(
  command: string,
  parameters: Record<string, unknown> = {},
  variables: Record<string, unknown> = {}
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("captivate_send_command", { command, parameters, variables });
}
