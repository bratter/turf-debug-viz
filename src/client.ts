/**
 * Browser client for TurfJS Debug Visualizer
 * Connects to WebSocket relay and displays incoming debug messages
 */

import type { GeoJSON, Feature, FeatureCollection } from "geojson";
import type { Map as MapboxMap } from "mapbox-gl";
import { config } from "./config.js";
import { uiThemeSwitcher, getTheme, setTheme, Theme } from "../node_modules/theme-switcher/dist/theme-switcher.js";

// Turf is loaded locally via a script tag
// TODO: For development, might be better to just use from node
declare const turf: typeof import("@turf/turf");
// MapBox GL is loaded via CDN script tag
declare const mapboxgl: typeof import("mapbox-gl");

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
const sidebarToggleBtn = document.getElementById("sidebar-toggle") as HTMLButtonElement;
const mapContainerParent = document.getElementById("map-view") as HTMLDivElement;
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
let rows: RowData[] = [];
let nextIndex = 0; // Global counter for stable row indices
let map: MapboxMap | undefined;
let currentMapStyle: string | undefined;
let mapPopup: mapboxgl.Popup | undefined;

// ========================================
// Theme Management
// ========================================

// Set up the theme switcher
const themeSwitcherParent = document.getElementById("theme-switcher") as HTMLLIElement;
themeSwitcherParent.append(uiThemeSwitcher());

window.addEventListener("themechange", (e) => {
  const theme = (e as CustomEvent).detail.theme;

  // Update map style if the map exists, which it may not becuase the theme is
  // set before the map is rendered
  if (map) {
    const newStyle = getMapStyle(theme);

    // If style URL has changed, set it on the map, this will re-add all the
    // shapes. If it hasn't changed, just in case ensure the colors are updated
    if (newStyle !== currentMapStyle) {
      currentMapStyle = newStyle;
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

  // TODO: Can this just go straight into the map-view section
  map = new mapboxgl.Map({
    container: "map-container",
    style: initialStyle,
    center: [0, 0],
    zoom: 1,
  });

  // Add navigation controls
  map.addControl(new mapboxgl.NavigationControl());

  // Initialize reusable popup
  mapPopup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    maxWidth: "300px",
  });

  // When style changes (e.g., theme switch), re-add all features
  // because mapbox deletes them
  map.on("style.load", () => {
    rows.forEach(addToMap);
  });
}

// ========================================
// Map Feature Management
// ========================================

// GeoJSON normalization
function normalizeToFeatures(geojson: GeoJSON): Feature | FeatureCollection {
  switch (geojson.type) {
    case "Feature": return geojson;
    case "FeatureCollection": return geojson;
    // It's a geometry
    default: return turf.feature(geojson);
  }
}

// Fit map bounds to show all features
function fitMapBounds(ignoreHidden = true): void {
  if (!map || !rows.length) return;

  const bounds = [Infinity, Infinity, -Infinity, -Infinity] as any;

  for (const row of rows) {
    if (ignoreHidden && row.isHidden) continue;

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
    const color = getFeatureColor(row.index, getTheme());
    // HTML for the tooltip
    const metadataHTML = createMetadataHTML(row);

    // Add source
    map!.addSource(sourceId, {
      type: "geojson",
      data: normalizeToFeatures(row.geojson),
    });

    // Add all layer types for each shape
    // This is wasteful (as is having multiple sources), but easier to manage for MVP
    const fillLayerId = `layer-${row.index}-fill`;
    map!.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": color,
        "fill-opacity": 0.3,
      },
      filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    });
    addPopupHandler(fillLayerId, metadataHTML);

    const lineLayerId = `layer-${row.index}-line`;
    map!.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": color,
        "line-width": 2,
      },
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]]],
    });
    map!.addLayer({
      id: `${lineLayerId}-hitzone`,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": "rgba(0, 0, 0, 0)",
        "line-width": 20,
      },
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
    });
    addPopupHandler(`${lineLayerId}-hitzone`, metadataHTML);

    const pointLayerId = `layer-${row.index}-circle`;
    map!.addLayer({
      id: pointLayerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": color,
        "circle-radius": 5,
      },
      filter: getCircleFilter(),
    });
    map!.addLayer({
      id: `${pointLayerId}-hitzone`,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-radius": 10,
      },
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
    });
    addPopupHandler(`${pointLayerId}-hitzone`, metadataHTML);

  } catch (err) {
    console.error(`Failed to add GeoJSON to map for row ${row.index}:`, err);
  }
}

// Add a popup handler for the layer with the passed id
function addPopupHandler(layerId: string, metadataHTML: string): void {
  map!.on("mousemove", layerId, (e) => {
    mapPopup!
      .setLngLat(e.lngLat)
      .setHTML(metadataHTML)
      .addTo(map!);
  });

  // Mouse leave: hide popup
  map!.on("mouseleave", layerId, () => {
    mapPopup!.remove();
  });
}

// Remove GeoJSON from map
function removeFromMap(index: number): void {
  try {
    // Remove layers first, then source (ordering is required)
    map!.removeLayer(`layer-${index}-fill`);
    map!.removeLayer(`layer-${index}-line`);
    map!.removeLayer(`layer-${index}-line-hitzone`);
    map!.removeLayer(`layer-${index}-circle`);
    map!.removeLayer(`layer-${index}-circle-hitzone`);
    map!.removeSource(`source-${index}`);

    // Remove popup if it's showing
    mapPopup!.remove();
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
    map.setLayoutProperty(`layer-${index}-line-hitzone`, "visibility", visibility);
    map.setLayoutProperty(`layer-${index}-circle`, "visibility", visibility);
    map.setLayoutProperty(`layer-${index}-circle-hitzone`, "visibility", visibility);

    // Re-render to update row styling
    renderMessageLog();
  } catch (err) {
    console.error(`Failed to toggle visibility for row ${index}:`, err);
  }
}

function getCircleFilter() {
  return showVerticesCheckbox.checked
    ? ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"]]]
    : ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]];
}

// Update all circle layer filters based on show vertices checkbox
function updateCircleFilters(): void {
  if (!map) return;

  rows.forEach((row) => {
    try {
      map!.setFilter(`layer-${row.index}-circle`, getCircleFilter());
    } catch (err) {
      // Layer might not exist yet, ignore error
    }
  });
}

// Clear all GeoJSON from map
function clearMap(): void {
  try {
    // Remove all sources
    rows.forEach((row) => removeFromMap(row.index));

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
    if (getAutoFit()) fitMapBounds();
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
  if (getAutoFit()) fitMapBounds();
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

function createMetadataHTML(row: RowData): string {
  // Build display lines array
  const displayLines: string[] = [];

  // Line 1: Label (only if present)
  if (row.label) {
    displayLines.push(row.label);
  }

  // Line 2: Type information with optional ID
  const gj = row.geojson;
  let typeLine: string;

  switch (gj.type) {
    case "FeatureCollection":
      typeLine = `${gj.type} (${gj.features.length})`;
      break;
    case "GeometryCollection":
      typeLine = `${gj.type} (${gj.geometries.length})`;
      break;
    case "Feature":
      const id = gj.id ?? gj.properties?.id ?? null;
      typeLine = (id !== null ? `<strong>${id}:</strong> ` : "") + `Feature (${gj.geometry.type})`;
      break;
    // It's a geometry
    default:
      typeLine = `Geometry (${gj.type})`;
  }

  displayLines.push(typeLine);

  // Line 3: Timestamp
  const ts = new Date(row.ts || Date.now()).toISOString();
  displayLines.push(`<small class="timestamp">${ts}</small>`);

  // Join with line breaks
  return displayLines.join("<br>");
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
  const color = getFeatureColor(row.index, getTheme());
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
  if (getAutoFit()) fitMapBounds();
});

// Show vertices checkbox
showVerticesCheckbox.addEventListener("change", updateCircleFilters);

// Initialize sidebar visibility
if (!getSidebarVisible()) {
  sidebar.classList.add("sidebar-collapsed");
}

// Sidebar toggle
sidebarToggleBtn.addEventListener("click", toggleSidebar);

// Initialize map
initMap();

// Clear button
clearBtn.addEventListener("click", () => {
  clearMap();
  rows = [];
  nextIndex = 0;
  renderMessageLog();
});

// Zoom to fit button
zoomToFitBtn.addEventListener("click", () => {
  fitMapBounds();
});

// Connect to WebSocket
connect();
