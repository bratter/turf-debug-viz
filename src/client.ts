/**
 * Browser client for TurfJS Debug Visualizer
 * Connects to WebSocket relay and displays incoming debug messages
 */

import type { DebugMessage, ViewRow } from "../types.js";
import { uiThemeSwitcher, getTheme, setTheme } from "../node_modules/theme-switcher/dist/theme-switcher.js";
import { getFeatureColor, createMetadataHTML } from "./client/helpers.ts";
import { MapView } from "./client/map.ts";
import { Mode, changeMode, getAutoFit } from "./client/mode-menu.ts";
import { ViewState } from "./client/view.ts";

declare global {
  interface Window {
    map: MapView | undefined;
  }

  interface WindowEventMap {
    modechange: CustomEvent<Mode>;
  }
}

// ========================================
// Constants
// ========================================

const STORAGE_KEY_SIDEBAR = "turf-debug-sidebar";
const WEBSOCKET_RECONNECT_DELAY = 300;

// ========================================
// DOM Element References
// ========================================

const statusIndicator = document.getElementById("status") as HTMLDivElement;
const sidebarToggleBtn = document.getElementById("sidebar-toggle") as HTMLButtonElement;
const sidebar = document.getElementById("sidebar") as HTMLDivElement;
const messageLog = document.getElementById("log") as HTMLDivElement;

// ========================================
// State Variables
// ========================================

let webSocket: WebSocket | undefined;
// TODO: Consider moving this, diffState, and the map to a context module
// for better unilateral dependency flow
const viewState = new ViewState();

// ========================================
// Theme Management
// ========================================

// Set up the theme switcher
const themeSwitcherParent = document.getElementById("theme-switcher") as HTMLLIElement;
themeSwitcherParent.append(uiThemeSwitcher());

// Update row color swatches when the theme changes
window.addEventListener("themechange", () => {
  renderMessageLog();
});

function getSidebarVisible(): boolean {
  return localStorage.getItem(STORAGE_KEY_SIDEBAR) !== "false"; // Default true
}

function setSidebarVisible(visible: boolean): void {
  localStorage.setItem(STORAGE_KEY_SIDEBAR, visible.toString());
}

function toggleSidebar(): void {
  const isSidebarVisible = !sidebar.classList.contains("sidebar-collapsed");
  const newVisibility = !isSidebarVisible;

  setSidebarVisible(newVisibility);
  sidebar.classList.toggle("sidebar-collapsed", !newVisibility);
  window.map?.resize();
}

// ========================================
// Key Controls
// ========================================

// TODO: Can probably move into a key handling module that also has a register function
const keyMap = new Map<string, () => void>([
  ["v", () => changeMode(Mode.VIEW)],
  ["d", () => changeMode(Mode.DIFF)],
]);

window.addEventListener("keyup", (e) => {
  const keyWithMod = `${e.ctrlKey ? 'Ctrl+' : ''}${e.key}`;
  const handler = keyMap.get(keyWithMod);

  if (handler) {
    e.preventDefault();
    handler();
  }
});

// ========================================
// WebSocket Connection
// ========================================

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
        const row = viewState.addRow(msg);
        window.map?.addToMap(row);
        if (getAutoFit()) window.map?.fitAll();
        break;

      case "diff":
        // TODO: Process diff messages, likely in diff logic file
        break;

      default:
        console.error("Unknown message kind:", (msg as any).kind);
    }
  });
}

// ========================================
// Rendering Functions
// ========================================

// Delete a row by its stable index
function deleteRow(index: number): void {
  window.map?.removeFromMap(index);
  viewState.deleteRow(index);
  if (getAutoFit()) window.map?.fitAll();
}

// Create action buttons (visibility, zoom, and delete) for a row
function createActionButtons(index: number): HTMLDivElement {
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "row-buttons";

  const visibilityBtn = document.createElement("button");
  visibilityBtn.className = "visibility-btn";
  visibilityBtn.textContent = "👁️";
  visibilityBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const row = viewState.getRow(index);
    if (!row) return;
    const newHidden = !row.isHidden;
    viewState.setHidden(index, newHidden);
    window.map?.setLayerVisibility(index, !newHidden);
  });
  buttonContainer.appendChild(visibilityBtn);

  const zoomBtn = document.createElement("button");
  zoomBtn.className = "zoom-btn";
  zoomBtn.textContent = "🔍";
  zoomBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    window.map?.zoomToFeature(index);
  });
  buttonContainer.appendChild(zoomBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "🗑️";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteRow(index);
  });
  buttonContainer.appendChild(deleteBtn);

  return buttonContainer;
}

// Create header element for a row
function createRowHeader(row: ViewRow): HTMLDivElement {
  const header = document.createElement("div");
  header.className = "meta";

  // Create content container for text elements
  const contentSpan = document.createElement("span");
  contentSpan.className = "meta-content";
  contentSpan.innerHTML = createMetadataHTML(row);
  header.appendChild(contentSpan);

  // Add action buttons
  const buttonContainer = createActionButtons(row.index);
  header.appendChild(buttonContainer);

  // Toggle expand/collapse on header click
  header.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).tagName !== "BUTTON") {
      viewState.setExpanded(row.index, !row.isExpanded);
    }
  });

  return header;
}

// Create a complete row element
function createRowElement(row: ViewRow): HTMLDivElement {
  const rowElement = document.createElement("div");

  // Build class names
  const classNames = ["row"];
  if (!row.isExpanded) classNames.push("collapsed");
  if (row.isHidden) classNames.push("hidden");
  rowElement.className = classNames.join(" ");

  // Add color swatch using border-left
  const color = getFeatureColor(row.index);
  // Reduce opacity for hidden rows
  const borderColor = row.isHidden ? color + "40" : color; // 40 = 25% opacity in hex
  rowElement.style.borderLeftColor = borderColor;

  const header = createRowHeader(row);
  rowElement.appendChild(header);

  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(row.geojson, null, 2);
  rowElement.appendChild(pre);

  return rowElement;
}

function renderMessageLog(): void {
  messageLog.innerHTML = "";

  // Display in reverse order of arrival (most recent first)
  const rows = viewState.getRows();
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const rowElement = createRowElement(row);
    messageLog.appendChild(rowElement);
  }
}

// ========================================
// Initialization and Event Listeners
// ========================================

// Initialize theme and toggle
setTheme(getTheme());

// Initialize sidebar visibility
if (!getSidebarVisible()) {
  sidebar.classList.add("sidebar-collapsed");
}

// Sidebar toggle
sidebarToggleBtn.addEventListener("click", toggleSidebar);

// Initialize map with accessor function for render data
window.map = new MapView("map-view", () => viewState.getRows());

// Subscribe to viewState changes for re-rendering
viewState.addEventListener("change", (e) => {
  renderMessageLog();

  // Handle clear: also clear the map
  if (e.detail.type === "clear") {
    window.map?.clearMap();
  }
});

// Connect to WebSocket
connect();
