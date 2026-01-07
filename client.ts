/**
 * Browser client for TurfJS Debug Visualizer
 * Connects to WebSocket relay and displays incoming debug messages
 */

import type { GeoJSON, Feature, FeatureCollection } from "geojson";
import type { Map as MapboxMap } from "mapbox-gl";
import { config } from "./config.js";
import { feature } from "@turf/helpers";
import bbox from "@turf/bbox";

// MapBox GL is loaded via CDN script tag
declare const mapboxgl: typeof import("mapbox-gl");

interface DebugMessage {
  label: string;
  ts: number;
  geojson: GeoJSON;
}

// ========================================
// Constants
// ========================================

const STORAGE_KEY_THEME = "turf-debug-theme";
const STORAGE_KEY_AUTOFIT = "turf-debug-autofit";
const MAP_FIT_OPTIONS = {
  padding: 50,
  maxZoom: 15,
  duration: 500,
} as const;
const WEBSOCKET_RECONNECT_DELAY = 300;

// TokyoNight color palettes for feature visualization
const COLOR_PALETTE_LIGHT = [
  "#2e7de9", // blue
  "#587539", // green
  "#9854f1", // purple
  "#007197", // cyan
  "#b15c00", // orange
  "#7847bd", // magenta
  "#8c6c3e", // yellow
  "#f52a65", // red
];

const COLOR_PALETTE_DARK = [
  "#82aaff", // blue
  "#c3e88d", // green
  "#fca7ea", // purple
  "#86e1fc", // cyan
  "#ff966c", // orange
  "#c099ff", // magenta
  "#ffc777", // yellow
  "#ff757f", // red
];

// ========================================
// DOM Element References
// ========================================

const statusIndicator = document.getElementById("status") as HTMLDivElement;
const messageLog = document.getElementById("log") as HTMLDivElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const themeToggle = document.getElementById("theme-toggle") as HTMLButtonElement;
const autofitCheckbox = document.getElementById("autofit-checkbox") as HTMLInputElement;
const mapContainerParent = document.getElementById("content") as HTMLDivElement;

// ========================================
// State Variables
// ========================================

let webSocket: WebSocket | undefined;
let rows: DebugMessage[] = [];
let expandedRows = new Set<number>();
let hiddenRows = new Set<number>(); // Track which rows are hidden from map

let map: MapboxMap | undefined;
let currentMapStyle: string | undefined;
const mapSources = new Map<number, string>(); // row index -> source ID

// ========================================
// Theme Management
// ========================================

type Theme = "system" | "light" | "dark";

function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY_THEME);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY_THEME, theme);
  applyTheme(theme);
}

// Auto-fit management
function getAutoFit(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY_AUTOFIT);
  return stored !== "false"; // Default to true
}

function setAutoFit(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY_AUTOFIT, enabled.toString());
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getMapStyle(theme: Theme): string {
  if ((theme === "system" && prefersDark()) || theme === "dark") {
    return "mapbox://styles/mapbox/dark-v11";
  } else {
    return "mapbox://styles/mapbox/light-v11";
  }
}

function applyTheme(theme: Theme): void {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
    themeToggle.textContent = "System";
  } else {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.textContent = theme === "light" ? "Light" : "Dark";
  }

  // Update map style if map exists
  if (map) {
    const newStyle = getMapStyle(theme);

    // If style URL is the same, just update colors
    if (newStyle === currentMapStyle) {
      updateMapColors();
    } else {
      currentMapStyle = newStyle;
      map.setStyle(newStyle);
    }
  }

  // Update row color swatches
  render();
}

// Update colors of existing map features
function updateMapColors(): void {
  if (!map) return;

  const theme = getTheme();

  mapSources.forEach((_, index) => {
    const color = getFeatureColor(index, theme);

    map!.setPaintProperty(`layer-${index}-fill`, "fill-color", color);
    map!.setPaintProperty(`layer-${index}-line`, "line-color", color);
    map!.setPaintProperty(`layer-${index}-circle`, "circle-color", color);
  });
}

function cycleTheme(): void {
  const current = getTheme();
  const next: Theme = current === "system" ? "light" : current === "light" ? "dark" : "system";
  setTheme(next);
}

// ========================================
// Map Initialization
// ========================================

function initMap(): void {
  // Set MapBox access token
  mapboxgl.accessToken = config.mapboxToken;

  // Create map container div
  const mapContainer = document.createElement("div");
  mapContainer.id = "map-container";
  mapContainerParent.appendChild(mapContainer);

  // Create map instance
  const initialStyle = getMapStyle(getTheme());
  currentMapStyle = initialStyle;

  map = new mapboxgl.Map({
    container: "map-container",
    style: initialStyle,
    center: [0, 0],
    zoom: 1,
  });

  // Add navigation controls
  map.addControl(new mapboxgl.NavigationControl());

  // Re-add all existing features when style loads
  map.on("style.load", () => {
    // When style changes (e.g., theme switch), re-add all features
    const currentSources = new Map(mapSources);

    mapSources.clear();

    rows.forEach((row, index) => {
      // Only re-add if it was previously on the map
      if (currentSources.has(index)) {
        addToMap(index, row);
      }
    });
  });
}

// ========================================
// Map Feature Management
// ========================================

// GeoJSON normalization - convert all GeoJSON types to Feature array
function normalizeToFeatures(geojson: GeoJSON): Feature | FeatureCollection {
  switch (geojson.type) {
    case "Feature": return geojson;
    case "FeatureCollection": return geojson;
    // It's a geometry
    default: return feature(geojson);
  }
}

// Fit map bounds to show all features
function fitMapBounds(): void {
  if (!map || !getAutoFit() || !mapSources.size) return;

  const bounds = [Infinity, Infinity, -Infinity, -Infinity] as any;
  for (const idx of mapSources.keys()) {
    const cur = bbox(rows[idx].geojson);
    bounds[0] = cur[0] < bounds[0] ? cur[0] : bounds[0];
    bounds[1] = cur[1] < bounds[1] ? cur[1] : bounds[1];
    bounds[2] = cur[2] > bounds[2] ? cur[2] : bounds[2];
    bounds[3] = cur[3] > bounds[3] ? cur[3] : bounds[3];
  }

  map.fitBounds(bounds, MAP_FIT_OPTIONS);
}

// Zoom map to a single feature
function zoomToFeature(index: number): void {
  if (!map || index >= rows.length) return;

  const bounds = bbox(rows[index].geojson) as mapboxgl.LngLatBoundsLike;

  map.fitBounds(bounds, MAP_FIT_OPTIONS);
}

// Get theme-appropriate color for map features using indexed palette
function getFeatureColor(index: number, theme: Theme): string {
  const isDark = theme === "dark" || (theme === "system" && prefersDark());
  const palette = isDark ? COLOR_PALETTE_DARK : COLOR_PALETTE_LIGHT;
  return palette[index % palette.length];
}

// Add GeoJSON to map
function addToMap(index: number, message: DebugMessage): void {
  if (!map) return;

  try {
    const sourceId = `source-${index}`;

    // Add source
    map.addSource(sourceId, {
      type: "geojson",
      data: normalizeToFeatures(message.geojson),
    });

    mapSources.set(index, sourceId);

    const color = getFeatureColor(index, getTheme());

    // Add all layer types for each shape
    // This is wasteful (as is having multiple sources), but easier to manage for MVP
    const fillLayerId = `layer-${index}-fill`;
    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": color,
        "fill-opacity": 0.3,
      },
      filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    });

    const lineLayerId = `layer-${index}-line`;
    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": color,
        "line-width": 2,
      },
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]]],
    });

    const circleLayerId = `layer-${index}-circle`;
    map.addLayer({
      id: circleLayerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": color,
        "circle-radius": 5,
      },
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
    });

    // Fit bounds if auto-fit is enabled
    fitMapBounds();
  } catch (err) {
    console.error(`Failed to add GeoJSON to map for row ${index}:`, err);
  }
}

// Remove GeoJSON from map
function removeFromMap(index: number, fitBounds = true): void {
  if (!map) return;

  try {
    // Remove layers
    map!.removeLayer(`layer-${index}-fill`);
    map!.removeLayer(`layer-${index}-line`);
    map!.removeLayer(`layer-${index}-circle`);

    // Remove source
    const sourceId = mapSources.get(index);
    if (sourceId && map.getSource(sourceId)) {
      map.removeSource(sourceId);
      mapSources.delete(index);
    }

    // Refit bounds if auto-fit is enabled
    if (fitBounds) {
      fitMapBounds();
    }
  } catch (err) {
    console.error(`Failed to remove GeoJSON from map for row ${index}:`, err);
  }
}

// Toggle visibility of a feature on the map
function toggleVisibility(index: number): void {
  if (!map || !mapSources.has(index)) return;

  try {
    const isHidden = hiddenRows.has(index);
    const visibility = isHidden ? "visible" : "none";

    // Toggle layer visibility
    map.setLayoutProperty(`layer-${index}-fill`, "visibility", visibility);
    map.setLayoutProperty(`layer-${index}-line`, "visibility", visibility);
    map.setLayoutProperty(`layer-${index}-circle`, "visibility", visibility);

    // Update state
    if (isHidden) {
      hiddenRows.delete(index);
    } else {
      hiddenRows.add(index);
    }

    // Re-render to update row styling
    render();
  } catch (err) {
    console.error(`Failed to toggle visibility for row ${index}:`, err);
  }
}

// Clear all GeoJSON from map
function clearMap(): void {
  if (!map) return;

  try {
    // Remove all sources
    mapSources.forEach((_, index) => {
      removeFromMap(index, false);
    });
    mapSources.clear();

    // Reset to world view
    map.flyTo({ center: [0, 0], zoom: 1, duration: MAP_FIT_OPTIONS.duration });
  } catch (err) {
    console.error("Failed to clear map:", err);
  }
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

    const newIndex = rows.length;
    rows.push(msg);
    addToMap(newIndex, msg);
    render();
  });
}

// ========================================
// Rendering Functions
// ========================================

// Adjust all tracking indices after deleting a row
function adjustIndicesAfterDeletion(deletedIndex: number): void {
  // Adjust expandedRows indices
  const newExpanded = new Set<number>();
  expandedRows.forEach((idx) => {
    if (idx > deletedIndex) newExpanded.add(idx - 1);
    else if (idx < deletedIndex) newExpanded.add(idx);
  });
  expandedRows = newExpanded;

  // Adjust hiddenRows indices
  const newHidden = new Set<number>();
  hiddenRows.forEach((idx) => {
    if (idx > deletedIndex) newHidden.add(idx - 1);
    else if (idx < deletedIndex) newHidden.add(idx);
  });
  hiddenRows = newHidden;

  // Adjust map tracking indices
  const newMapSources = new Map<number, string>();
  mapSources.forEach((sourceId, idx) => {
    if (idx > deletedIndex) newMapSources.set(idx - 1, sourceId);
    else if (idx < deletedIndex) newMapSources.set(idx, sourceId);
  });
  mapSources.clear();
  newMapSources.forEach((v, k) => mapSources.set(k, v));
}

// Delete a row and adjust all indices
function deleteRow(index: number): void {
  removeFromMap(index);
  rows.splice(index, 1);
  expandedRows.delete(index);
  hiddenRows.delete(index);
  adjustIndicesAfterDeletion(index);
  render();
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
    toggleVisibility(index);
  });
  buttonContainer.appendChild(visibilityBtn);

  const zoomBtn = document.createElement("button");
  zoomBtn.className = "zoom-btn";
  zoomBtn.textContent = "🔍";
  zoomBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    zoomToFeature(index);
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
function createRowHeader(message: DebugMessage, index: number): HTMLDivElement {
  const header = document.createElement("div");
  header.className = "meta";

  const ts = new Date(message.ts || Date.now()).toISOString();
  const labelSpan = document.createElement("span");
  labelSpan.innerHTML = `${message.label ?? "(no label)"}<br>[${ts}]`;
  header.appendChild(labelSpan);

  const buttonContainer = createActionButtons(index);
  header.appendChild(buttonContainer);

  // Toggle expand/collapse on header click
  header.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).tagName !== "BUTTON") {
      if (expandedRows.has(index)) {
        expandedRows.delete(index);
      } else {
        expandedRows.add(index);
      }
      render();
    }
  });

  return header;
}

// Create a complete row element
function createRowElement(message: DebugMessage, index: number): HTMLDivElement {
  const isExpanded = expandedRows.has(index);
  const isHidden = hiddenRows.has(index);
  const rowElement = document.createElement("div");

  // Build class names
  const classNames = ["row"];
  if (!isExpanded) classNames.push("collapsed");
  if (isHidden) classNames.push("hidden");
  rowElement.className = classNames.join(" ");

  // Add color swatch using border-left
  const color = getFeatureColor(index, getTheme());
  // Reduce opacity for hidden rows
  const borderColor = isHidden ? color + "40" : color; // 40 = 25% opacity in hex
  rowElement.style.borderLeftColor = borderColor;

  const header = createRowHeader(message, index);
  rowElement.appendChild(header);

  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(message.geojson, null, 2);
  rowElement.appendChild(pre);

  return rowElement;
}

function render(): void {
  messageLog.innerHTML = "";

  // Display in reverse order of arrival (most recent first)
  for (let i = rows.length - 1; i >= 0; i--) {
    const message = rows[i];
    const rowElement = createRowElement(message, i);
    messageLog.appendChild(rowElement);
  }
}

// ========================================
// Initialization and Event Listeners
// ========================================

// Initialize theme
applyTheme(getTheme());

// Initialize auto-fit checkbox
autofitCheckbox.checked = getAutoFit();
autofitCheckbox.addEventListener("change", () => {
  setAutoFit(autofitCheckbox.checked);
  if (autofitCheckbox.checked) {
    fitMapBounds();
  }
});

// Initialize map
initMap();

// Clear button
clearBtn.addEventListener("click", () => {
  clearMap();
  rows = [];
  expandedRows.clear();
  hiddenRows.clear();
  render();
});

// Theme toggle button
themeToggle.addEventListener("click", cycleTheme);

// Connect to WebSocket
connect();
