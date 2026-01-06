// Data Export Hook
//
// Add an export function to globalThis that lets you call it to send data to
// the relay server.
//
// Add to a call using:
//
// node --import tsx --import ./export-hook.ts --inspect yourApp.ts
// or: npx tsx --inspect --import ./export-hook.ts yourApp.ts (depending on your setup)
// TODO: Overall this can be made more specific - we are only going to be exporting GeoJSON objects
// Any valid geojson can be exported, and this geojson should be wrapped in a simple JSON container that
// can have a label and the geojson payload
// TODO: Have to declare the global when you use it in other ts projects? Document what you have to include (e.g., copy the declare block?)
// My question is: is this required as in other projects we won't know that the function is available in the global scope
// We want to do this declaration in an ergonomic way
// TODO: Have to have some way of disconnecting the web socket for in-code use
// and this disconnection should be fairly ergonomic

import WebSocket from "ws";

// TODO: Better specify relay url
const RELAY_URL = process.env.DEBUG_RELAY_WS ?? "ws://127.0.0.1:7777/ws";

declare global {
  // eslint-disable-next-line no-var
  var exportDebug: <T>(
    label: string,
    value: T,
  ) => void;
}

let ws: WebSocket | undefined;
let queue: string[] = [];
let connecting = false;

// TODO: Not necessary
function safeStringify(obj: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(obj, (_k, v) => {
    if (typeof v === "bigint") return `${v.toString()}n`;
    if (typeof v === "function") return `[Function ${(v as Function).name || "anonymous function"}]`;
    if (typeof v === "object" && v !== null) {
      const o = v as object;
      if (seen.has(o)) return "[Circular]";
      seen.add(o);
    }
    return v;
  });
}

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

function sendRaw(jsonLine: string) {
  connect();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(jsonLine);
  } else {
    queue.push(jsonLine);
    if (queue.length > 2000) queue = queue.slice(queue.length - 2000);
  }
}

globalThis.exportDebug = <T>(label: string, value: T) => {
  const msg: {
    label: string;
    ts: number;
    value: unknown;
  } = {
    label: String(label ?? "debug"),
    ts: Date.now(),
    value,
  };

  let body = safeStringify(msg);

  sendRaw(body);
};
