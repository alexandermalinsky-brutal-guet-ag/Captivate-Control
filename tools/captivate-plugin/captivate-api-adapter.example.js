/*
  Replace this file with your real Captivate plugin API bindings.
  Keep the same function names so connector-core can dispatch actions.
*/

export function createCaptivateApiAdapter() {
  return {
    animateIn(layer, target) {
      console.log(`[CaptivateAPI] animateIn layer=${layer} target=${target}`);
      // TODO: call Captivate animate-in API
    },
    animateOut(layer, target) {
      console.log(`[CaptivateAPI] animateOut layer=${layer} target=${target}`);
      // TODO: call Captivate animate-out API
    },
    cutIn(layer, target) {
      console.log(`[CaptivateAPI] cutIn layer=${layer} target=${target}`);
      // TODO: call Captivate cut-in API
    },
    cutOut(layer, target) {
      console.log(`[CaptivateAPI] cutOut layer=${layer} target=${target}`);
      // TODO: call Captivate cut-out API
    },
    tableSelect(layer, target, sourceTable) {
      console.log(`[CaptivateAPI] tableSelect layer=${layer} target=${target} sourceTable=${sourceTable}`);
      // TODO: call Captivate data table select API
    },
    onUnknownAction(payload) {
      console.warn(`[CaptivateAPI] Unknown action: ${payload.actionId}`);
    },
    onLog(message) {
      console.log(`[CaptivatePlugin] ${message}`);
    },
    onError(message) {
      console.error(`[CaptivatePlugin] ${message}`);
    },
  };
}
