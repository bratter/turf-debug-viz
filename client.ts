/**
 * Browser client for TurfJS Debug Visualizer
 * Connects to WebSocket relay and displays incoming debug messages
 */

import type { GeoJSON, Feature, FeatureCollection, Geometry, GeometryCollection } from "geojson";
import type { Map as MapboxMap } from "mapbox-gl";
import { config } from "./config.js";

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

let map: MapboxMap | undefined;
let currentMapStyle: string | undefined;
const mapSources = new Map<number, string>(); // row index -> source ID
const mapLayers = new Map<number, string[]>(); // row index -> layer IDs

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
}

// Update colors of existing map features
function updateMapColors(): void {
  if (!map) return;

  const color = getFeatureColor(getTheme());

  mapLayers.forEach((layerIds) => {
    layerIds.forEach((layerId) => {
      if (!map!.getLayer(layerId)) return;

      const layer = map!.getLayer(layerId);
      if (layer.type === "fill") {
        map!.setPaintProperty(layerId, "fill-color", color);
      } else if (layer.type === "line") {
        map!.setPaintProperty(layerId, "line-color", color);
      } else if (layer.type === "circle") {
        map!.setPaintProperty(layerId, "circle-color", color);
      }
    });
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
    mapLayers.clear();

    rows.forEach((row, index) => {
      // Only re-add if it was previously on the map
      if (currentSources.has(index)) {
        addToMap(index, row);
      }
    });
  });
}

// ========================================
// GeoJSON Helper Functions
// ========================================

// GeoJSON normalization - convert all GeoJSON types to Feature array
function normalizeToFeatures(geojson: GeoJSON): Feature[] {
  if (geojson.type === "Feature") {
    return [geojson as Feature];
  } else if (geojson.type === "FeatureCollection") {
    return (geojson as FeatureCollection).features;
  } else if (geojson.type === "GeometryCollection") {
    const gc = geojson as GeometryCollection;
    return gc.geometries.map((geometry) => ({
      type: "Feature",
      geometry,
      properties: {},
    }));
  } else {
    // It's a Geometry
    return [
      {
        type: "Feature",
        geometry: geojson as Geometry,
        properties: {},
      },
    ];
  }
}

// ========================================
// Map Feature Management
// ========================================

// Calculate bounds for given row indices
function calculateBounds(indices: number[]): { bounds: typeof mapboxgl.LngLatBounds.prototype; hasFeatures: boolean } {
  const bounds = new mapboxgl.LngLatBounds();
  let hasFeatures = false;

  indices.forEach((index) => {
    if (index >= rows.length) return; // Safety check

    try {
      const row = rows[index];
      const features = normalizeToFeatures(row.geojson);
      features.forEach((feature) => {
        if (feature.geometry) {
          const coords = extractCoordinates(feature.geometry);
          coords.forEach(([lng, lat]) => {
            bounds.extend([lng, lat]);
            hasFeatures = true;
          });
        }
      });
    } catch (err) {
      console.error(`Failed to process bounds for row ${index}:`, err);
    }
  });

  return { bounds, hasFeatures };
}

// Fit map bounds to show all features
function fitMapBounds(): void {
  if (!map || !getAutoFit()) return;

  // Get all indices that are on the map
  const indices = Array.from(mapSources.keys());
  const { bounds, hasFeatures } = calculateBounds(indices);

  if (hasFeatures) {
    map.fitBounds(bounds, MAP_FIT_OPTIONS);
  }
}

// Zoom map to a single feature
function zoomToFeature(index: number): void {
  if (!map || index >= rows.length) return;

  const { bounds, hasFeatures } = calculateBounds([index]);

  if (hasFeatures) {
    map.fitBounds(bounds, MAP_FIT_OPTIONS);
  }
}

// Helper to extract all coordinates from a geometry
function extractCoordinates(geometry: Geometry): number[][] {
  const coords: number[][] = [];

  function addCoord(coord: number[]): void {
    if (coord.length >= 2) {
      coords.push(coord);
    }
  }

  function processCoords(c: any, depth: number): void {
    if (depth === 0) {
      addCoord(c);
    } else if (Array.isArray(c)) {
      c.forEach((item) => processCoords(item, depth - 1));
    }
  }

  switch (geometry.type) {
    case "Point":
      addCoord(geometry.coordinates);
      break;
    case "MultiPoint":
    case "LineString":
      processCoords(geometry.coordinates, 1);
      break;
    case "MultiLineString":
    case "Polygon":
      processCoords(geometry.coordinates, 2);
      break;
    case "MultiPolygon":
      processCoords(geometry.coordinates, 3);
      break;
  }

  return coords;
}

// Get theme-appropriate color for map features
function getFeatureColor(theme: Theme): string {
  const isDark = theme === "dark" || (theme === "system" && prefersDark());
  return isDark ? "#60A5FF" : "#4080FF";
}

// Add GeoJSON to map
function addToMap(index: number, message: DebugMessage): void {
  if (!map) return;

  try {
    const features = normalizeToFeatures(message.geojson);
    if (features.length === 0) return;

    const sourceId = `source-${index}`;
    const layerIds: string[] = [];

    // Add source
    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features,
      },
    });

    mapSources.set(index, sourceId);

    const color = getFeatureColor(getTheme());

    // Determine geometry types present
    const hasPolygon = features.some((f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon");
    const hasLine = features.some((f) => f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString");
    const hasPoint = features.some((f) => f.geometry?.type === "Point" || f.geometry?.type === "MultiPoint");

    // Add fill layer for polygons
    if (hasPolygon) {
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
      layerIds.push(fillLayerId);
    }

    // Add line layer for lines and polygon outlines
    if (hasLine || hasPolygon) {
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
      layerIds.push(lineLayerId);
    }

    // Add circle layer for points
    if (hasPoint) {
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
      layerIds.push(circleLayerId);
    }

    mapLayers.set(index, layerIds);

    // Fit bounds if auto-fit is enabled
    fitMapBounds();
  } catch (err) {
    console.error(`Failed to add GeoJSON to map for row ${index}:`, err);
  }
}

// Remove GeoJSON from map
function removeFromMap(index: number): void {
  if (!map) return;

  try {
    // Remove layers
    const layerIds = mapLayers.get(index);
    if (layerIds) {
      layerIds.forEach((layerId) => {
        if (map!.getLayer(layerId)) {
          map!.removeLayer(layerId);
        }
      });
      mapLayers.delete(index);
    }

    // Remove source
    const sourceId = mapSources.get(index);
    if (sourceId && map.getSource(sourceId)) {
      map.removeSource(sourceId);
      mapSources.delete(index);
    }

    // Refit bounds if auto-fit is enabled
    fitMapBounds();
  } catch (err) {
    console.error(`Failed to remove GeoJSON from map for row ${index}:`, err);
  }
}

// Clear all GeoJSON from map
function clearMap(): void {
  if (!map) return;

  try {
    // Remove all layers
    mapLayers.forEach((layerIds) => {
      layerIds.forEach((layerId) => {
        if (map!.getLayer(layerId)) {
          map!.removeLayer(layerId);
        }
      });
    });
    mapLayers.clear();

    // Remove all sources
    mapSources.forEach((sourceId) => {
      if (map!.getSource(sourceId)) {
        map!.removeSource(sourceId);
      }
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

  // Adjust map tracking indices
  const newMapSources = new Map<number, string>();
  const newMapLayers = new Map<number, string[]>();
  mapSources.forEach((sourceId, idx) => {
    if (idx > deletedIndex) newMapSources.set(idx - 1, sourceId);
    else if (idx < deletedIndex) newMapSources.set(idx, sourceId);
  });
  mapLayers.forEach((layerIds, idx) => {
    if (idx > deletedIndex) newMapLayers.set(idx - 1, layerIds);
    else if (idx < deletedIndex) newMapLayers.set(idx, layerIds);
  });
  mapSources.clear();
  mapLayers.clear();
  newMapSources.forEach((v, k) => mapSources.set(k, v));
  newMapLayers.forEach((v, k) => mapLayers.set(k, v));
}

// Delete a row and adjust all indices
function deleteRow(index: number): void {
  removeFromMap(index);
  rows.splice(index, 1);
  expandedRows.delete(index);
  adjustIndicesAfterDeletion(index);
  render();
}

// Create action buttons (zoom and delete) for a row
function createActionButtons(index: number): HTMLDivElement {
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "row-buttons";

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
  const rowElement = document.createElement("div");
  rowElement.className = isExpanded ? "row" : "row collapsed";

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
  render();
});

// Theme toggle button
themeToggle.addEventListener("click", cycleTheme);

// Connect to WebSocket
connect();
