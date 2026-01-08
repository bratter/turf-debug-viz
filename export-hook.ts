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

/**
 * Synchronously connects to the WebSocket relay server.
 * Blocks until connection is established or error occurs.
 * Returns a Connection instance with an active WebSocket.
 *
 * Note: Uses synchronous blocking to ensure connection is ready before returning.
 * This is intentional for debug instrumentation - the tool should work reliably
 * in debuggers and when stepping through code.
 */
function connect(): Connection {
  const ws = new WebSocket(RELAY_URL);

  let isOpen = false;
  let hasError = false;

  const waitForOpen = (cb: (err?: Error) => void) => {
    ws.once("open", () => {
      isOpen = true;
      cb();
    });
    ws.once("error", (err) => {
      hasError = true;
      cb(err);
    });
  };

  const innerWait = deasync(waitForOpen) as () => void;
  innerWait();

  if (!isOpen || hasError) {
    throw new Error("Failed to connect to debug relay server");
  }

  // Allow process to exit even if WebSocket is still open by setting unref on
  // underlying socket instance
  (ws as any)._socket.unref();


  return new Connection(ws);
}

/**
 * Connection instance with an active WebSocket.
 * Assumes the WebSocket is already connected.
 */
class Connection {
  private ws: WebSocket;

  constructor(ws: WebSocket) {
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error("Connection requires an open WebSocket");
    }
    this.ws = ws;
  }

  /**
   * Synchronously sends a message to the relay server.
   * Blocks until message is sent.
   */
  send(message: string) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket connection is not open");
    }

    const innerSender = deasync(this.ws.send.bind(this.ws)) as (s: string) => void;
    innerSender(message);
  }

  /**
   * Disconnects from the relay server
   */
  disconnect() {
    try {
      this.ws.close();
    } catch {
      // Ignore close errors
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance - lazily created on first use
let connection: Connection | undefined;

globalThis.DebugViz = {
  /**
   * Synchronously sends GeoJSON to the relay server.
   * Blocks until connection is established and message is sent.
   * Works correctly in debuggers when stepping through code.
   *
   * Note: This API is intentionally synchronous for debug instrumentation.
   * It ensures messages are sent before continuing execution, which is
   * essential when stepping through code in a debugger.
   */
  send: (label: string, geojson: GeoJSON) => {
    // Lazily create connection on first use
    if (!connection) {
      connection = connect();
    }

    const msg: DebugMessage = {
      label: String(label ?? "debug"),
      ts: Date.now(),
      geojson,
    };

    const body = JSON.stringify(msg);
    connection.send(body);
  },

  /**
   * Disconnects from the relay server.
   * Note: Not required for process exit - WebSocket is unref'd and won't prevent exit.
   */
  disconnect: () => {
    if (connection) {
      connection.disconnect();
      connection = undefined;
    }
  },

  /**
   * Check if currently connected to the relay server.
   */
  isConnected: () => {
    return connection?.isConnected() ?? false;
  }
};
