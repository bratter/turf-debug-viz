/**
 * Browser client for TurfJS Debug Visualizer
 * Connects to WebSocket relay and displays incoming debug messages
 */

import type { DebugMessage, SendMessage } from "../../types.js";
import {
  uiThemeSwitcher,
  getTheme,
  setTheme,
} from "../../node_modules/theme-switcher/dist/theme-switcher.js";
import { MapView } from "./map.ts";
import { MapController } from "./client/map-controller.ts";
import { Mode, changeMode } from "./mode-menu.ts";
import { viewState } from "./view.ts";
import { diffState } from "./diff.ts";
import { initList } from "./list.ts";

declare global {
  interface Window {
    map: MapView | undefined;
  }

  interface WindowEventMap {
    modechange: CustomEvent<Mode>;
  }
}

// ========================================
// Theme Management
// ========================================

// Set up the theme switcher and initialize
const themeSwitcherParent = document.getElementById(
  "theme-switcher",
) as HTMLLIElement;
themeSwitcherParent.append(uiThemeSwitcher());
setTheme(getTheme());

// ========================================
// Panel and Sidebar Visibility
// ========================================

type PanelState = "both" | "map" | "json";

const STORAGE_KEY_SIDEBAR = "turf-debug-sidebar";
const STORAGE_KEY_PANEL_MODE = "turf-debug-panel-mode";

const mapView = document.getElementById("map-view") as HTMLElement;
const geojsonView = document.getElementById("geojson-view") as HTMLElement;
const sidebar = document.getElementById("sidebar") as HTMLDivElement;

let panelState =
  (localStorage.getItem(STORAGE_KEY_PANEL_MODE) as PanelState | null) || "both";
let sidebarState = localStorage.getItem(STORAGE_KEY_SIDEBAR) !== "false";

function cyclePanels() {
  panelState =
    panelState === "both" ? "map" : panelState === "map" ? "json" : "both";
  localStorage.setItem(STORAGE_KEY_PANEL_MODE, panelState);

  mapView.classList.toggle("collapsed", panelState === "json");
  geojsonView.classList.toggle("collapsed", panelState === "map");
  window.map?.resize();
}

function toggleSidebar() {
  sidebarState = !sidebarState;
  localStorage.setItem(STORAGE_KEY_SIDEBAR, sidebarState.toString());

  sidebar.classList.toggle("collapsed", !sidebarState);
  window.map?.resize();
}

// Sidebar toggle
(
  document.getElementById("sidebar-toggle") as HTMLButtonElement
).addEventListener("click", toggleSidebar);

// Initialize the sidebar list renderer (subscribes to state and mode changes)
initList();

// Cascade ViewRow deletions: remove any diffs referencing the deleted row
viewState.addEventListener("change", (e) => {
  if (e.detail.type === "delete") {
    for (const diff of diffState.getDiffs()) {
      if (
        diff.from.index === e.detail.index ||
        diff.to.index === e.detail.index
      ) {
        diffState.deleteDiff(diff.id);
      }
    }
  }
});

// ========================================
// Map Setup
// ========================================

// Initialize map with accessor function for render data
// and set up MapController to handle state-to-map coordination
// FIX: Reactivate when ready
//window.map = new MapView("map-view", () => viewState.getRows());
//new MapController(window.map);

// ========================================
// Key Controls
// ========================================

const keyMap = new Map<string, () => void>([
  ["w", () => changeMode(Mode.VIEW)],
  ["d", () => changeMode(Mode.DIFF)],
  ["v", cyclePanels],
  ["s", toggleSidebar],
]);

window.addEventListener("keyup", (e) => {
  const keyWithMod = `${e.ctrlKey ? "Ctrl+" : ""}${e.key}`;
  const handler = keyMap.get(keyWithMod);

  if (handler) {
    e.preventDefault();
    handler();
  }
});

// ========================================
// WebSocket Connection
// ========================================

const WEBSOCKET_RECONNECT_DELAY = 300;

const statusIndicator = document.getElementById("status") as HTMLDivElement;

let webSocket: WebSocket | undefined;

function setStatus(status: string): void {
  statusIndicator.textContent = status;
}

function connect(): void {
  const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  webSocket = new WebSocket(wsUrl);

  webSocket.addEventListener("open", () => setStatus("connected"));

  webSocket.addEventListener("close", () => {
    setStatus("disconnected (reconnecting...)");
    setTimeout(connect, WEBSOCKET_RECONNECT_DELAY);
  });

  webSocket.addEventListener("error", () => {
    // close event will trigger reconnect
    try {
      webSocket?.close();
    } catch {
      // ignore close errors
    }
  });

  webSocket.addEventListener("message", async (ev) => {
    let msg: DebugMessage;
    try {
      msg = JSON.parse(ev.data);
    } catch (err) {
      console.error("Failed to parse message:", ev.data, err);
      return;
    }

    switch (msg.kind) {
      case "send":
        viewState.addRow(msg);
        break;

      case "diff": {
        // Create ViewRows for each GeoJSON in the diff
        const fromMessage: SendMessage = {
          kind: "send",
          geojson: msg.from,
          label: msg.label ? `${msg.label} (from)` : "(from)",
          ts: msg.ts,
        };
        const toMessage: SendMessage = {
          kind: "send",
          geojson: msg.to,
          label: msg.label ? `${msg.label} (to)` : "(to)",
          ts: msg.ts,
        };

        const fromRow = viewState.addRow(fromMessage);
        const toRow = viewState.addRow(toMessage);

        // Create the diff entry (MapController handles map updates via events)
        diffState.addDiff(fromRow, toRow, msg.label);
        break;
      }

      default:
        console.error("Unknown message kind:", (msg as any).kind);
    }
  });
}

// Connect to WebSocket
connect();
