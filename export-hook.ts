/**
 * Data Export Hook for TurfJS Debug Visualizer
 *
 * Adds globalThis.DebugViz namespace with methods for sending GeoJSON to the relay server.
 *
 * Usage:
 *   node --import tsx --import ./export-hook.ts yourApp.ts
 *   or: npx tsx --import ./export-hook.ts yourApp.ts
 *
 * For TypeScript projects, see types.d.ts for type declarations to copy
 */

import type { GeoJSON } from "geojson";
import type { DebugMessage } from "./types.js";
import WebSocket from "ws";

const HOST = process.env.TURF_DEBUG_HOST ?? "127.0.0.1";
const PORT = process.env.TURF_DEBUG_PORT ?? "7777";
const RELAY_URL = `ws://${HOST}:${PORT}/ws`;

let ws: WebSocket | undefined;
let queue: string[] = [];
let connecting = false;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (connecting) return;
  connecting = true;
  ws = new WebSocket(RELAY_URL);

  ws.on("open", () => {
    connecting = false;
    flush();
  });

  ws.on("close", () => {
    connecting = false;
  });

  ws.on("error", () => {
    connecting = false;

    try {
      ws?.close();
    } catch { }
  });
}

function flush() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  while (queue.length) {
    ws.send(queue.shift()!);
  }
}

function send(jsonLine: string) {
  connect();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(jsonLine);
  } else {
    queue.push(jsonLine);
  }
}

globalThis.DebugViz = {
  send: (label: string, geojson: GeoJSON) => {
    const msg: DebugMessage = {
      label: String(label ?? "debug"),
      ts: Date.now(),
      geojson,
    };

    const body = JSON.stringify(msg);
    send(body);
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
    connecting = false;
  },

  isConnected: () => {
    return ws?.readyState === WebSocket.OPEN;
  },
};

// Auto-cleanup on process exit
process.on("beforeExit", () => {
  globalThis.DebugViz?.disconnect();
});
