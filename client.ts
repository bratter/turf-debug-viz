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
const themeToggle = document.getElementById("theme-toggle") as HTMLButtonElement;

let ws: WebSocket | undefined;
let rows: DebugMessage[] = [];
let expandedRows = new Set<number>();

// Theme management
type Theme = "system" | "light" | "dark";
const THEME_KEY = "turf-debug-theme";

function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

function applyTheme(theme: Theme): void {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
    themeToggle.textContent = "System";
  } else {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.textContent = theme === "light" ? "Light" : "Dark";
  }
}

function cycleTheme(): void {
  const current = getTheme();
  const next: Theme = current === "system" ? "light" : current === "light" ? "dark" : "system";
  setTheme(next);
}

// Initialize theme
applyTheme(getTheme());

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

    rows.push(msg);
    render();
  });
}

function render(): void {
  logEl.innerHTML = "";

  // Display in reverse order of arrival (most recent first)
  for (let i = rows.length - 1; i >= 0; i--) {
    const m = rows[i];
    const div = document.createElement("div");
    const isExpanded = expandedRows.has(i);
    div.className = isExpanded ? "row" : "row collapsed";

    const ts = new Date(m.ts || Date.now()).toISOString();
    const header = document.createElement("div");
    header.className = "meta";

    const labelSpan = document.createElement("span");
    labelSpan.textContent = `[${ts}] ${m.label ?? "(no label)"}`;
    header.appendChild(labelSpan);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      rows.splice(i, 1);
      expandedRows.delete(i);
      // Adjust indices in expandedRows
      const newExpanded = new Set<number>();
      expandedRows.forEach(idx => {
        if (idx > i) newExpanded.add(idx - 1);
        else if (idx < i) newExpanded.add(idx);
      });
      expandedRows = newExpanded;
      render();
    });
    header.appendChild(deleteBtn);

    header.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).tagName !== "BUTTON") {
        if (expandedRows.has(i)) {
          expandedRows.delete(i);
        } else {
          expandedRows.add(i);
        }
        render();
      }
    });

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(m.geojson, null, 2);

    div.appendChild(header);
    div.appendChild(pre);
    logEl.appendChild(div);
  }
}

clearBtn.addEventListener("click", () => {
  rows = [];
  expandedRows.clear();
  render();
});

themeToggle.addEventListener("click", cycleTheme);

connect();
