import { invoke } from "@tauri-apps/api/core";

export interface CaptivateIntegrationStatus {
  platform: string;
  captivateAppPath: string | null;
  controllerInstallPath: string | null;
  pluginInstallPath: string | null;
  controllerInstalled: boolean;
  pluginInstalled: boolean;
  canInstall: boolean;
  restartSupported: boolean;
  packagedAssetsEmbedded: boolean;
  statusMessage: string | null;
}

export interface CaptivateIntegrationInstallResult {
  controllerInstallPath: string | null;
  pluginInstallPath: string | null;
  controllerBackupPath: string | null;
  pluginBackupPath: string | null;
  controllerInstallSucceeded: boolean;
  pluginInstallSucceeded: boolean;
  controllerError: string | null;
  pluginError: string | null;
  statusMessage: string;
}

export interface CaptivateIntegrationAdminCommand {
  command: string;
  stagedPluginPath: string;
  targetPluginPath: string;
  statusMessage: string;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getCaptivateIntegrationStatus(): Promise<CaptivateIntegrationStatus | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke<CaptivateIntegrationStatus>("captivate_integration_status");
}

export async function installCaptivateIntegration(): Promise<CaptivateIntegrationInstallResult | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke<CaptivateIntegrationInstallResult>("captivate_integration_install");
}

export async function restartCaptivateIntegrationHost(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("captivate_integration_restart");
}

export async function getCaptivateIntegrationAdminCommand(): Promise<CaptivateIntegrationAdminCommand | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  return invoke<CaptivateIntegrationAdminCommand>("captivate_integration_admin_command");
}
