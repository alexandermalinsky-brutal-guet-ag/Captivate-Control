import net from "node:net";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 45454;

function parseFrame(frame) {
  const raw = JSON.parse(frame);
  if (!raw || raw.schema !== "captivate.bridge.v1" || raw.messageType !== "buttonTrigger") {
    return null;
  }
  return raw;
}

export function createCaptivateDispatcher(captivateApi) {
  return function dispatch(triggerMessage) {
    const payload = triggerMessage.payload;
    const layer = payload.captivateLayer;
    const target = payload.captivateTarget;

    switch (payload.actionId) {
      case "animate-in-out":
        captivateApi.animateIn?.(layer, target);
        captivateApi.animateOut?.(layer, target);
        return;
      case "animate-in":
        captivateApi.animateIn?.(layer, target);
        return;
      case "animate-out":
        captivateApi.animateOut?.(layer, target);
        return;
      case "cut-in":
        captivateApi.cutIn?.(layer, target);
        return;
      case "cut-out":
        captivateApi.cutOut?.(layer, target);
        return;
      case "table-select":
        captivateApi.tableSelect?.(layer, target, payload.sourceTable);
        return;
      default:
        captivateApi.onUnknownAction?.(payload);
    }
  };
}

export function startCaptivateConnector({
  captivateApi,
  host = process.env.CAPTIVATE_BRIDGE_HOST ?? DEFAULT_HOST,
  port = Number(process.env.CAPTIVATE_BRIDGE_PORT ?? DEFAULT_PORT),
  reconnectMs = 1200,
}) {
  const dispatch = createCaptivateDispatcher(captivateApi);
  let stopped = false;
  let socket = null;
  let buffer = "";

  const connect = () => {
    if (stopped) {
      return;
    }

    socket = net.createConnection({ host, port }, () => {
      captivateApi.onLog?.(`Connected to Captivate-Control bridge at ${host}:${port}`);
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newlineIndex = buffer.indexOf("\n");

      while (newlineIndex >= 0) {
        const frame = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (frame.length > 0) {
          try {
            const message = parseFrame(frame);
            if (message) {
              dispatch(message);
            }
          } catch (error) {
            captivateApi.onError?.(`Invalid bridge frame: ${String(error)}`);
          }
        }

        newlineIndex = buffer.indexOf("\n");
      }
    });

    socket.on("error", (error) => {
      captivateApi.onError?.(`Bridge socket error: ${String(error)}`);
    });

    socket.on("close", () => {
      captivateApi.onLog?.("Bridge connection closed");
      if (!stopped) {
        setTimeout(connect, reconnectMs);
      }
    });
  };

  connect();

  return {
    stop() {
      stopped = true;
      if (socket) {
        socket.destroy();
        socket = null;
      }
    },
  };
}
