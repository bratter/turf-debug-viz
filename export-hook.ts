/**
 * Data Export Hook for TurfJS Debug Visualizer
 *
 * Adds globalThis.DebugViz namespace with methods for sending GeoJSON to the relay server.
 *
 * Usage:
 *   node --import tsx --import ./export-hook.ts yourApp.ts
 *   or: npx tsx --import ./export-hook.ts yourApp.ts
 *   debug: npx tsx --inspect-brk --import ./export-hook.ts ypurApp.ts
 *
 * For TypeScript projects, see types.d.ts for type declarations to copy
 */

import type { GeoJSON } from "geojson";
import type { DebugMessage } from "./types.js";
import WebSocket from "ws";
import deasync from "deasync";

const HOST = process.env.TURF_DEBUG_HOST ?? "127.0.0.1";
const PORT = process.env.TURF_DEBUG_PORT ?? "7777";
const RELAY_URL = `ws://${HOST}:${PORT}/ws`;

let ws: WebSocket | undefined;
let queue: string[] = [];
let isOpen = false;

/**
 * Internal async connect function.
 * Initiates connection if not already open or connecting.
 */
function connectAsync(cb?: (err?: Error) => {}) {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    cb?.();
    return;
  }

  isOpen = false;
  ws = new WebSocket(RELAY_URL);

  ws.on("open", () => {
    isOpen = true;
    flush();
    cb?.();
  });

  ws.on("close", () => {
    isOpen = false;
  });

  ws.on("error", (err) => {
    isOpen = false;
    try {
      ws?.close();
    } catch { }
    cb?.(err);
  });
}

/**
 * Synchronously connects to the WebSocket relay server.
 * Blocks until connection is established or error occurs.
 */
function connectSync() {
  const rs = ws?.readyState;
  if (rs === WebSocket.OPEN) return;
  else if (ws?.readyState === WebSocket.CONNECTING)
    throw new Error("When using sync API shouldn't be in this state");

  const innerConn = deasync(connectAsync) as () => {};

  innerConn();
}

function flush() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  while (queue.length) {
    ws.send(queue.shift()!);
  }
}

/**
 * Internal async send function.
 * Queues if not connected.
 */
function sendAsync(jsonLine: string) {
  connectAsync();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(jsonLine);
  } else {
    queue.push(jsonLine);
  }
}

/**
 * Synchronously sends a message to the relay server.
 * Blocks until connection is established and message is sent.
 */
function sendSync(jsonLine: string) {
  // Guarantees an open ws, so no need to check
  connectSync();

  const innerSender = deasync(ws!.send.bind(ws)) as (s: string) => {};

  innerSender(jsonLine);
}

globalThis.DebugViz = {
  /**
   * Synchronously sends GeoJSON to the relay server (default).
   * Blocks until connection is established and message is sent.
   * Works correctly in debuggers when stepping through code.
   */
  send: (label: string, geojson: GeoJSON) => {
    const msg: DebugMessage = {
      label: String(label ?? "debug"),
      ts: Date.now(),
      geojson,
    };

    const body = JSON.stringify(msg);
    sendSync(body);
  },

  /**
   * Asynchronously sends GeoJSON to the relay server.
   * Does not block - queues messages if not connected.
   * Use for high-frequency sends where blocking is undesirable.
   */
  sendAsync: (label: string, geojson: GeoJSON) => {
    const msg: DebugMessage = {
      label: String(label ?? "debug"),
      ts: Date.now(),
      geojson,
    };

    const body = JSON.stringify(msg);
    sendAsync(body);
  },

  disconnect: () => {
    if (ws) {
      try {
        ws.close();
      } catch {
        // Ignore close errors
      }
      ws = undefined;
    }
    queue = [];
    isOpen = false;
  },

  isConnected: () => {
    return ws?.readyState === WebSocket.OPEN;
  },

  queueLen: () => {
    return queue.length;
  }
};

// Auto-cleanup on process exit
process.on("beforeExit", () => {
  globalThis.DebugViz?.disconnect();
});
