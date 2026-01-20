/**
 * Browser client for TurfJS Debug Visualizer
 * Connects to WebSocket relay and displays incoming debug messages
 */

import type { GeoJSON } from "geojson";
import { uiThemeSwitcher, getTheme, setTheme } from "../node_modules/theme-switcher/dist/theme-switcher.js";
import { getFeatureColor, createMetadataHTML } from "./client/helpers.ts";
import { MapView } from "./client/map.ts";

interface DebugMessage {
  label?: string | null;
  ts: number;
  geojson: GeoJSON;
}

interface RowData extends DebugMessage {
  // Stable index assigned at insertion
  index: number;
  isExpanded: boolean;
  isHidden: boolean;
}

// ========================================
// Constants
// ========================================

const STORAGE_KEY_AUTOFIT = "turf-debug-autofit";
const STORAGE_KEY_SIDEBAR = "turf-debug-sidebar";
const WEBSOCKET_RECONNECT_DELAY = 300;

// ========================================
// DOM Element References
// ========================================

const statusIndicator = document.getElementById("status") as HTMLDivElement;
const sidebarToggleBtn = document.getElementById("sidebar-toggle") as HTMLButtonElement;
const sidebar = document.getElementById("sidebar") as HTMLDivElement;
const messageLog = document.getElementById("log") as HTMLDivElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const zoomToFitBtn = document.getElementById("zoom-to-fit") as HTMLButtonElement;
const autofitCheckbox = document.getElementById("autofit-checkbox") as HTMLInputElement;
const showVerticesCheckbox = document.getElementById("show-vertices-checkbox") as HTMLInputElement;

// ========================================
// State Variables
// ========================================

let webSocket: WebSocket | undefined;
// FIX: Row data structure may need to be improved or abstracted
let rows: RowData[] = [];
let nextIndex = 0; // Global counter for stable row indices
let map: MapView | undefined;

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

function getAutoFit(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY_AUTOFIT);
  return stored !== "false"; // Default to true
}

function setAutoFit(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY_AUTOFIT, enabled.toString());
}

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
  map?.resize();
}

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
      msg = JSON.parse(ev.data) as DebugMessage;
    } catch (err) {
      console.error("Failed to parse message:", ev.data, err);
      return;
    }

    // Create RowData with stable index and initial state
    const row: RowData = {
      ...msg,
      index: nextIndex++,
      isExpanded: false,
      isHidden: false,
    };

    rows.push(row);
    map?.addToMap(row);
    renderMessageLog();
    if (getAutoFit()) map?.fitAll();
  });
}

// ========================================
// Rendering Functions
// ========================================

// Delete a row by its stable index
function deleteRow(index: number): void {
  const arrayIndex = rows.findIndex((row) => row.index === index);
  if (arrayIndex === -1) return;

  map?.removeFromMap(index);
  rows.splice(arrayIndex, 1);
  renderMessageLog();
  if (getAutoFit()) map?.fitAll();
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
    map?.toggleVisibility(index);
    // Re-render to update row styling
    renderMessageLog();
  });
  buttonContainer.appendChild(visibilityBtn);

  const zoomBtn = document.createElement("button");
  zoomBtn.className = "zoom-btn";
  zoomBtn.textContent = "🔍";
  zoomBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    map?.zoomToFeature(index);
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
function createRowHeader(row: RowData): HTMLDivElement {
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
      row.isExpanded = !row.isExpanded;
      renderMessageLog();
    }
  });

  return header;
}

// Create a complete row element
function createRowElement(row: RowData): HTMLDivElement {
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

// Initialize auto-fit checkbox
autofitCheckbox.checked = getAutoFit();
autofitCheckbox.addEventListener("change", () => {
  setAutoFit(autofitCheckbox.checked);
  if (getAutoFit()) map?.fitAll();
});

// Show vertices checkbox
showVerticesCheckbox.addEventListener("change", (e) => {
  if (map) {
    map.showVerticies = (e.currentTarget as HTMLInputElement)?.checked;
  }
});

// Initialize sidebar visibility
if (!getSidebarVisible()) {
  sidebar.classList.add("sidebar-collapsed");
}

// Sidebar toggle
sidebarToggleBtn.addEventListener("click", toggleSidebar);

// Initialize map with accessor function for render data

map = new MapView("map-view", () => rows);

// Clear button
clearBtn.addEventListener("click", () => {
  map?.clearMap();
  rows = [];
  nextIndex = 0;
  renderMessageLog();
});

// Zoom to fit button
zoomToFitBtn.addEventListener("click", () => {
  map?.fitAll();
});

// Connect to WebSocket
connect();

export { RowData };
