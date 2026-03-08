#!/usr/bin/env node
/**
 * Captivate plugin starter connector (reference implementation).
 * Connects to Captivate-Control bridge and logs incoming button trigger messages.
 */

import net from "node:net";

const host = process.env.CAPTIVATE_BRIDGE_HOST ?? "127.0.0.1";
const port = Number(process.env.CAPTIVATE_BRIDGE_PORT ?? "45454");

const socket = net.createConnection({ host, port }, () => {
  console.log(`[CaptivatePlugin] Connected to Captivate-Control bridge at ${host}:${port}`);
});

let buffer = "";

socket.on("data", (chunk) => {
  buffer += chunk.toString("utf8");

  let newlineIndex = buffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const frame = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    if (frame.length > 0) {
      try {
        const message = JSON.parse(frame);
        console.log("[CaptivatePlugin] Received:", message);
      } catch (error) {
        console.error("[CaptivatePlugin] Invalid JSON frame:", frame, error);
      }
    }

    newlineIndex = buffer.indexOf("\n");
  }
});

socket.on("close", () => {
  console.log("[CaptivatePlugin] Bridge connection closed");
});

socket.on("error", (error) => {
  console.error(`[CaptivatePlugin] Connection error: ${String(error)}`);
});
