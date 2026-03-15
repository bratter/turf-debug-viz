/**
 * Browser client for TurfJS Debug Visualizer
 * Connects to WebSocket relay and displays incoming debug messages
 */

import type { DebugMessage, SendMessage } from "../../types.js";
import {
  uiThemeSwitcher,
  getTheme,
  setTheme,
} from "../../vendor/theme-switcher.js";
import { MapView } from "./map.ts";
import { MapController } from "./map-controller.ts";
import { Mode, changeMode, getCurrentMode } from "./mode-menu.ts";
import { viewState } from "./view.ts";
import { diffState, focusDiffLabel } from "./diff.ts";
import { initList } from "./list.ts";
import { initGeoJsonView } from "./geojson-view.ts";
import { initDiffView } from "./diff-view.ts";

declare global {
  interface Window {
    map: MapView | undefined;
  }

  interface WindowEventMap {
    modechange: CustomEvent<Mode>;
    diffoverlaychange: CustomEvent<boolean>;
    clearrequest: Event;
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

const mapView = document.getElementById("map-view") as HTMLElement;
const geojsonView = document.getElementById("geojson-view") as HTMLElement;
const sidebar = document.getElementById("sidebar") as HTMLDivElement;

let panelState: PanelState = "both";
let sidebarState = true;

function cyclePanels() {
  panelState =
    panelState === "both" ? "map" : panelState === "map" ? "json" : "both";

  mapView.classList.toggle("collapsed", panelState === "json");
  geojsonView.classList.toggle("collapsed", panelState === "map");
  window.map?.resize();
}

function toggleSidebar() {
  sidebarState = !sidebarState;

  sidebar.classList.toggle("collapsed", !sidebarState);
  window.map?.resize();
}

// Sidebar toggle
(
  document.getElementById("sidebar-toggle") as HTMLButtonElement
).addEventListener("click", toggleSidebar);

// Initialize the sidebar list renderer (subscribes to state and mode changes)
initList();

// Initialize the GeoJSON tree view renderer (subscribes to activate events)
initGeoJsonView();

// Initialize the diff tree view renderer (subscribes to diff state and mode changes)
initDiffView();

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
  } else if (e.detail.type === "clear") {
    diffState.clear();
  }
});

// ========================================
// Map Setup
// ========================================

// Initialize map with accessor function for render data
// and set up MapController to handle state-to-map coordination
window.map = new MapView("map-view", () => viewState.getRows());
new MapController(window.map);

// ========================================
// Key Controls
// ========================================

const helpModal = document.getElementById("help-modal") as HTMLDialogElement;
document.getElementById("help-open")!.addEventListener("click", () => helpModal.showModal());
document.getElementById("help-close")!.addEventListener("click", () => helpModal.close());
helpModal.addEventListener("click", (e) => { if (e.target === helpModal) helpModal.close(); });

const confirmModal = document.getElementById("confirm-modal") as HTMLDialogElement;
let pendingConfirm: (() => void) | null = null;

document.getElementById("confirm-ok")!.addEventListener("click", () => {
  confirmModal.close();
  const cb = pendingConfirm;
  pendingConfirm = null;
  cb?.();
});
document.getElementById("confirm-cancel")!.addEventListener("click", () => {
  confirmModal.close();
  pendingConfirm = null;
});
confirmModal.addEventListener("cancel", () => { pendingConfirm = null; });
confirmModal.addEventListener("click", (e) => { if (e.target === confirmModal) { confirmModal.close(); pendingConfirm = null; } });
confirmModal.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("confirm-ok")!.click(); }
});

function confirmAction(message: string, callback: () => void) {
  (document.getElementById("confirm-message") as HTMLElement).textContent = message;
  pendingConfirm = callback;
  confirmModal.showModal();
}

window.addEventListener("clearrequest", () => confirmAction("Clear all items?", () => viewState.clear()));

function navigateList(direction: 1 | -1) {
  const mode = getCurrentMode();
  if (mode === Mode.DIFF && !diffState.isSelecting()) {
    const diffs = [...diffState.getDiffs()].reverse();
    const active = diffState.getActiveDiff();
    const idx = active ? diffs.findIndex(d => d.id === active.id) : -1;
    const next = idx === -1 ? 0 : Math.max(0, Math.min(diffs.length - 1, idx + direction));
    if (diffs[next]) diffState.setActiveDiff(diffs[next].id);
  } else {
    const rows = [...viewState.getRows()].reverse();
    const active = viewState.getActiveRow();
    const idx = active ? rows.findIndex(r => r.index === active.index) : -1;
    const next = idx === -1 ? 0 : Math.max(0, Math.min(rows.length - 1, idx + direction));
    if (rows[next]) viewState.setActiveRow(rows[next].index);
  }
  requestAnimationFrame(() => {
    document.querySelector(".row.active")?.scrollIntoView({ block: "nearest" });
  });
}

function handleSpace() {
  const mode = getCurrentMode();
  if (mode === Mode.DIFF && diffState.isSelecting()) {
    const active = viewState.getActiveRow();
    if (active) diffState.select(active.index);
  } else if (mode === Mode.VIEW) {
    const active = viewState.getActiveRow();
    if (active) viewState.setHidden(active.index, !active.isHidden);
  }
}

function handleEnter() {
  const mode = getCurrentMode();
  if (mode === Mode.DIFF && diffState.isSelecting()) {
    if (diffState.selectionFrom() !== null && diffState.selectionTo() !== null) {
      focusDiffLabel();
    }
  } else if (mode === Mode.VIEW) {
    const active = viewState.getActiveRow();
    if (active) viewState.soloRow(active.index);
  }
}

function handleZoom() {
  const mode = getCurrentMode();
  if (mode === Mode.DIFF) {
    const diff = diffState.getActiveDiff();
    if (diff) window.map?.scheduleFit([diff.from.index, diff.to.index], false);
  } else {
    const active = viewState.getActiveRow();
    if (active) window.map?.scheduleFit([active.index]);
  }
}

function handleDelete() {
  const mode = getCurrentMode();
  if (mode === Mode.DIFF) {
    if (!diffState.isSelecting()) {
      const diff = diffState.getActiveDiff();
      if (diff) diffState.deleteDiff(diff.id);
    }
  } else {
    const active = viewState.getActiveRow();
    if (active) viewState.deleteRow(active.index);
  }
}

const keyMap = new Map<string, () => void>([
  ["j",         () => navigateList(1)],
  ["ArrowDown", () => navigateList(1)],
  ["k",         () => navigateList(-1)],
  ["ArrowUp",   () => navigateList(-1)],
  [" ",         handleSpace],
  ["Enter",     handleEnter],
  ["Escape",    () => {
    if (helpModal.open) { helpModal.close(); return; }
    if (confirmModal.open) { confirmModal.close(); pendingConfirm = null; return; }
    if (diffState.isSelecting()) diffState.cancelSelection();
  }],
  ["v",         () => changeMode(Mode.VIEW)],
  ["d",         () => changeMode(Mode.DIFF)],
  ["n",         () => { if (getCurrentMode() === Mode.DIFF) diffState.startSelection(); }],
  ["p",         cyclePanels],
  ["s",         toggleSidebar],
  ["z",         handleZoom],
  ["x",         handleDelete],
  ["a",         () => viewState.showAll()],
  ["c",         () => { if (getCurrentMode() === Mode.VIEW) window.dispatchEvent(new Event("clearrequest")); }],
  ["?",         () => helpModal.open ? helpModal.close() : helpModal.showModal()],
]);

const navKeys = new Set(["j", "k", "ArrowDown", "ArrowUp"]);

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  const isPrintable = e.key.length === 1;
  const keyWithMod = `${(!isPrintable && e.shiftKey) ? "Shift+" : ""}${e.ctrlKey ? "Ctrl+" : ""}${e.key}`;
  const handler = keyMap.get(keyWithMod);

  if (!handler) return;

  // Prevent arrow keys from scrolling the page even on repeat
  if (keyWithMod === "ArrowDown" || keyWithMod === "ArrowUp") {
    e.preventDefault();
  }

  if (!navKeys.has(keyWithMod) && e.repeat) return;

  e.preventDefault();
  handler();
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
