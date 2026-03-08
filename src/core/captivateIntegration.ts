import type { GuiCaptivateButtonBindingRow } from "./guiTables";
import { sendCaptivateButtonTrigger, startCaptivateBridge } from "../adapters/captivatePluginAdapter";

export interface CaptivateTriggerDetail extends GuiCaptivateButtonBindingRow {
  triggeredAt: number;
}

let bridgeInitialized = false;

async function ensureBridge(): Promise<void> {
  if (bridgeInitialized) {
    return;
  }

  await startCaptivateBridge();
  bridgeInitialized = true;
}

export function emitCaptivateButtonTrigger(binding: GuiCaptivateButtonBindingRow): CaptivateTriggerDetail | null {
  if (!binding.enabled) {
    return null;
  }

  const detail: CaptivateTriggerDetail = {
    ...binding,
    triggeredAt: Date.now(),
  };

  window.dispatchEvent(new CustomEvent<CaptivateTriggerDetail>("captivate:button-trigger", { detail }));
  void ensureBridge()
    .then(() => sendCaptivateButtonTrigger(detail))
    .catch((error) => {
      console.error("Failed to send Captivate trigger:", error);
    });

  return detail;
}
