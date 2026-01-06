/**
 * Browser client for TurfJS Debug Visualizer
 * Connects to WebSocket relay and displays incoming debug messages
 */

import type { GeoJSON } from "geojson";

interface DebugMessage {
  label: string;
  ts: number;
  geojson: GeoJSON;
}

const statusEl = document.getElementById("status") as HTMLDivElement;
const logEl = document.getElementById("log") as HTMLDivElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const filterEl = document.getElementById("filter") as HTMLInputElement;
const maxRowsEl = document.getElementById("maxRows") as HTMLSelectElement;

let ws: WebSocket | undefined;
let rows: DebugMessage[] = [];

function setStatus(s: string): void {
  statusEl.textContent = s;
}

function connect(): void {
  const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  ws = new WebSocket(wsUrl);

  ws.addEventListener("open", () => setStatus("connected"));

  ws.addEventListener("close", () => {
    setStatus("disconnected (reconnecting...)");
    setTimeout(connect, 300);
  });

  ws.addEventListener("error", () => {
    // close event will trigger reconnect
    try {
      ws?.close();
    } catch {
      // ignore close errors
    }
  });

  ws.addEventListener("message", async (ev) => {
    let msg: DebugMessage;
    try {
      msg = JSON.parse(ev.data) as DebugMessage;
    } catch (err) {
      console.error("Failed to parse message:", ev.data, err);
      return;
    }

    const filter = filterEl.value.trim();
    if (filter && msg.label !== filter) return;

    rows.push(msg);
    const max = Number(maxRowsEl.value);
    if (rows.length > max) {
      rows = rows.slice(rows.length - max);
    }
    render();
  });
}

function render(): void {
  logEl.innerHTML = "";

  // Display in reverse chronological order
  for (let i = rows.length - 1; i >= 0; i--) {
    const m = rows[i];
    const div = document.createElement("div");
    div.className = "row";

    const ts = new Date(m.ts || Date.now()).toISOString();
    const header = document.createElement("div");
    header.className = "meta";
    header.textContent = `[${ts}] ${m.label ?? "(no label)"}`;

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(m.geojson, null, 2);

    div.appendChild(header);
    div.appendChild(pre);
    logEl.appendChild(div);
  }
}

clearBtn.addEventListener("click", () => {
  rows = [];
  render();
});

connect();
