import net from "node:net";
import { NBPlugin } from "../lib/plugins.js";
import { Titler } from "../lib/titler-client.js";
import { createLogger, default_log_threshold } from "../lib/logger.js";

const BRIDGE_HOST = process.env.CAPTIVATE_BRIDGE_HOST || "127.0.0.1";
const BRIDGE_PORT = Number(process.env.CAPTIVATE_BRIDGE_PORT || "45454");
const RECONNECT_DELAY_MS = Number(process.env.CAPTIVATE_BRIDGE_RECONNECT_MS || "1500");

const log = createLogger("captivate-control-bridge.plugin.js", default_log_threshold);

function mapActionId(actionId) {
  if (actionId === "animate-in-out") return "auto";
  if (actionId === "animate-in") return "animatein";
  if (actionId === "animate-out") return "animateout";
  if (actionId === "cut-in") return "takein";
  if (actionId === "cut-out") return "stop";
  return null;
}

function parseTarget(payload) {
  const target = (payload.captivateTarget || "").trim();
  const layer = (payload.captivateLayer || "").trim();

  if (target.indexOf("input:") === 0) {
    return { input: target.slice("input:".length).trim(), title: "" };
  }
  if (target.indexOf("title:") === 0) {
    return { input: "", title: target.slice("title:".length).trim() };
  }
  if (target.length > 0) {
    return { input: "", title: target };
  }
  return { input: "", title: layer };
}

class CaptivateControlBridgePlugin extends NBPlugin {
  constructor() {
    super();
    this.socket = null;
    this.buffer = "";
    this.reconnectTimer = null;
    this.stopped = false;
  }

  async init(server) {
    this.server = server;
    this.connect();
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  connect() {
    if (this.stopped) {
      return;
    }

    try {
      this.socket = net.createConnection({ host: BRIDGE_HOST, port: BRIDGE_PORT }, () => {
        log("Connected to Captivate-Control bridge");
      });
    } catch (error) {
      log("Bridge connection create failed: " + String(error));
      this.scheduleReconnect();
      return;
    }

    this.socket.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      let i = this.buffer.indexOf("\n");
      while (i >= 0) {
        const frame = this.buffer.slice(0, i).trim();
        this.buffer = this.buffer.slice(i + 1);
        if (frame.length > 0) {
          this.handleFrame(frame);
        }
        i = this.buffer.indexOf("\n");
      }
    });

    this.socket.on("error", (error) => {
      log("Bridge socket error: " + String(error));
    });

    this.socket.on("close", () => {
      log("Bridge socket closed");
      this.socket = null;
      this.scheduleReconnect();
    });
  }

  handleFrame(frame) {
    let message = null;
    try {
      message = JSON.parse(frame);
    } catch (error) {
      log("Invalid bridge JSON frame: " + String(error));
      return;
    }

    if (!message || message.schema !== "captivate.bridge.v1") {
      return;
    }

    if (message.messageType === "buttonTrigger") {
      this.handleButtonTrigger(message.payload || {});
    }
  }

  handleButtonTrigger(payload) {
    if (!payload.enabled) {
      return;
    }

    const action = mapActionId(payload.actionId);
    if (!action) {
      return;
    }

    const target = parseTarget(payload);

    Titler.action(action, target.input, target.title, {})
      .then((reply) => {
        log("Titler action reply: " + String(reply));
      })
      .catch((error) => {
        log("Titler action failed: " + String(error));
      });
  }
}

const plugin = new CaptivateControlBridgePlugin();
export default plugin;
