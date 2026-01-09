/**
 * Browser client for TurfJS Debug Visualizer
 * Connects to WebSocket relay and displays incoming debug messages
 */

import type { GeoJSON, Feature, FeatureCollection } from "geojson";
import type { Map as MapboxMap } from "mapbox-gl";
import { config } from "./config.js";

// Turf is loaded locally via a script tag
declare const turf: typeof import("@turf/turf");
// MapBox GL is loaded via CDN script tag
declare const mapboxgl: typeof import("mapbox-gl");

interface DebugMessage {
  label: string;
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
let rows: RowData[] = [];
let nextIndex = 0; // Global counter for stable row indices
let map: MapboxMap | undefined;
let currentMapStyle: string | undefined;

// ========================================
// Theme Management
// ========================================

type Theme = "system" | "light" | "dark";

function getThemeName(): Theme {
  return localStorage.getItem(STORAGE_KEY_THEME) as Theme | null ?? "system";
}

function setTheme(theme: Theme): void {
  // Get the current map style before we override anything
  const currentMapStyle = getMapStyle(getThemeName());

  localStorage.setItem(STORAGE_KEY_THEME, theme);

  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
    themeToggle.textContent = "System";
  } else {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.textContent = theme === "light" ? "Light" : "Dark";
  }

  // Update map style if the map exists, which it may not becuase the theme is
  // set before the map is rendered
  if (map) {
    const newStyle = getMapStyle(theme);

    // If style URL has changed, set it on the map, this will re-add all the
    // shapes. If it hasn't changed, just in case ensure the colors are updates
    if (newStyle !== currentMapStyle) {
      map!.setStyle(newStyle);
    } else {
      rows.forEach((row) => {
        const color = getFeatureColor(row.index, theme);

        map!.setPaintProperty(`layer-${row.index}-fill`, "fill-color", color);
        map!.setPaintProperty(`layer-${row.index}-line`, "line-color", color);
        map!.setPaintProperty(`layer-${row.index}-circle`, "circle-color", color);
      });
    }
  }

  // Update row color swatches
  renderMessageLog();
}

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

function cycleTheme(): void {
  const current = getThemeName();
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
  const initialStyle = getMapStyle(getThemeName());
  currentMapStyle = initialStyle;

  map = new mapboxgl.Map({
    container: "map-container",
    style: initialStyle,
    center: [0, 0],
    zoom: 1,
  });

  // Add navigation controls
  map.addControl(new mapboxgl.NavigationControl());

  // When style changes (e.g., theme switch), re-add all features
  // because mapbox deletes them
  map.on("style.load", () => {
    rows.forEach(addToMap);
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
    default: return turf.feature(geojson);
  }
}

// Fit map bounds to show all features
function fitMapBounds(): void {
  if (!map || !getAutoFit() || !rows.length) return;

  const bounds = [Infinity, Infinity, -Infinity, -Infinity] as any;

  for (const row of rows) {
    const cur = turf.bbox(row.geojson);
    bounds[0] = cur[0] < bounds[0] ? cur[0] : bounds[0];
    bounds[1] = cur[1] < bounds[1] ? cur[1] : bounds[1];
    bounds[2] = cur[2] > bounds[2] ? cur[2] : bounds[2];
    bounds[3] = cur[3] > bounds[3] ? cur[3] : bounds[3];
  }

  map.fitBounds(bounds, MAP_FIT_OPTIONS);
}

// Zoom map to a single feature
function zoomToFeature(index: number): void {
  const row = rows.find((r) => r.index === index);
  if (!map || !row) return;

  const bounds = turf.bbox(row.geojson) as mapboxgl.LngLatBoundsLike;

  map.fitBounds(bounds, MAP_FIT_OPTIONS);
}

// Get theme-appropriate color for map features using indexed palette
function getFeatureColor(index: number, theme: Theme): string {
  const isDark = theme === "dark" || (theme === "system" && prefersDark());
  const palette = isDark ? COLOR_PALETTE_DARK : COLOR_PALETTE_LIGHT;
  return palette[index % palette.length];
}

// Add GeoJSON to map
function addToMap(row: RowData): void {
  try {
    const sourceId = `source-${row.index}`;
    const color = getFeatureColor(row.index, getThemeName());

    // Add source
    map!.addSource(sourceId, {
      type: "geojson",
      data: normalizeToFeatures(row.geojson),
    });

    // Add all layer types for each shape
    // This is wasteful (as is having multiple sources), but easier to manage for MVP
    map!.addLayer({
      id: `layer-${row.index}-fill`,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": color,
        "fill-opacity": 0.3,
      },
      filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    });

    map!.addLayer({
      id: `layer-${row.index}-line`,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": color,
        "line-width": 2,
      },
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]]],
    });

    map!.addLayer({
      id: `layer-${row.index}-circle`,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": color,
        "circle-radius": 5,
      },
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
    });
  } catch (err) {
    console.error(`Failed to add GeoJSON to map for row ${row.index}:`, err);
  }
}

// Remove GeoJSON from map
function removeFromMap(index: number, fitBounds = true): void {
  try {
    // Remove layers first, then source (ordering is required)
    map!.removeLayer(`layer-${index}-fill`);
    map!.removeLayer(`layer-${index}-line`);
    map!.removeLayer(`layer-${index}-circle`);
    map!.removeSource(`source-${index}`);
  } catch (err) {
    console.error(`Failed to remove GeoJSON from map for row ${index}:`, err);
  }
}

// Toggle visibility of a feature on the map
function toggleVisibility(index: number): void {
  const row = rows.find((r) => r.index === index);
  if (!map || !row) return;

  try {
    row.isHidden = !row.isHidden;
    const visibility = row.isHidden ? "none" : "visible";

    // Toggle layer visibility
    map.setLayoutProperty(`layer-${index}-fill`, "visibility", visibility);
    map.setLayoutProperty(`layer-${index}-line`, "visibility", visibility);
    map.setLayoutProperty(`layer-${index}-circle`, "visibility", visibility);

    // Re-render to update row styling
    renderMessageLog();
  } catch (err) {
    console.error(`Failed to toggle visibility for row ${index}:`, err);
  }
}

// Clear all GeoJSON from map
function clearMap(): void {
  try {
    // Remove all sources
    rows.forEach((row) => removeFromMap(row.index, false));

    // Reset to world view
    map!.flyTo({ center: [0, 0], zoom: 1, duration: MAP_FIT_OPTIONS.duration });
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

    // Create RowData with stable index and initial state
    const row: RowData = {
      ...msg,
      index: nextIndex++,
      isExpanded: false,
      isHidden: false,
    };

    rows.push(row);
    addToMap(row);
    renderMessageLog();
    fitMapBounds();
  });
}

// ========================================
// Rendering Functions
// ========================================

// Delete a row by its stable index
function deleteRow(index: number): void {
  const arrayIndex = rows.findIndex((row) => row.index === index);
  if (arrayIndex === -1) return;

  removeFromMap(index);
  rows.splice(arrayIndex, 1);
  renderMessageLog();
  fitMapBounds();
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
function createRowHeader(row: RowData): HTMLDivElement {
  const header = document.createElement("div");
  header.className = "meta";

  const ts = new Date(row.ts || Date.now()).toISOString();
  const labelSpan = document.createElement("span");
  labelSpan.innerHTML = `${row.label ?? "(no label)"}<br>[${ts}]`;
  header.appendChild(labelSpan);

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
  const color = getFeatureColor(row.index, getThemeName());
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
setTheme(getThemeName());
themeToggle.addEventListener("click", cycleTheme);

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
  nextIndex = 0;
  renderMessageLog();
});

// Connect to WebSocket
connect();
