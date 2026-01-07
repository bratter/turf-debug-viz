/**
 * Browser client for TurfJS Debug Visualizer
 * Connects to WebSocket relay and displays incoming debug messages
 */

import type { GeoJSON, Feature, FeatureCollection, Geometry, GeometryCollection } from "geojson";
import type { Map as MapboxMap, LngLatBoundsLike } from "mapbox-gl";
import { config } from "./config.js";

// MapBox GL is loaded via CDN script tag
declare const mapboxgl: typeof import("mapbox-gl");

interface DebugMessage {
  label: string;
  ts: number;
  geojson: GeoJSON;
}

const statusEl = document.getElementById("status") as HTMLDivElement;
const logEl = document.getElementById("log") as HTMLDivElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const themeToggle = document.getElementById("theme-toggle") as HTMLButtonElement;
const autofitCheckbox = document.getElementById("autofit-checkbox") as HTMLInputElement;
const contentEl = document.getElementById("content") as HTMLDivElement;

let ws: WebSocket | undefined;
let rows: DebugMessage[] = [];
let expandedRows = new Set<number>();

// Map state
let map: MapboxMap | undefined;
const mapSources = new Map<number, string>(); // row index -> source ID
const mapLayers = new Map<number, string[]>(); // row index -> layer IDs

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

// Auto-fit management
const AUTOFIT_KEY = "turf-debug-autofit";

function getAutoFit(): boolean {
  const stored = localStorage.getItem(AUTOFIT_KEY);
  return stored !== "false"; // Default to true
}

function setAutoFit(enabled: boolean): void {
  localStorage.setItem(AUTOFIT_KEY, enabled.toString());
}

function getMapStyle(theme: Theme): string {
  if (theme === "system") {
    // Check system preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11";
  }
  return theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11";
}

let currentMapStyle: string | undefined;

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
function initMap(): void {
  // Set MapBox access token
  mapboxgl.accessToken = config.mapboxToken;

  // Create map container div
  const mapContainer = document.createElement("div");
  mapContainer.id = "map-container";
  contentEl.appendChild(mapContainer);

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
    const currentLayers = new Map(mapLayers);

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

// Initialize map on DOM load
initMap();

function setStatus(s: string): void {
  statusEl.textContent = s;
}

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

// Fit map bounds to show all features
function fitMapBounds(): void {
  if (!map || !getAutoFit()) return;

  const bounds = new mapboxgl.LngLatBounds();
  let hasFeatures = false;

  // Only calculate bounds for features that are actually on the map
  mapSources.forEach((sourceId, index) => {
    if (index >= rows.length) return; // Safety check

    try {
      const row = rows[index];
      const features = normalizeToFeatures(row.geojson);
      features.forEach((feature) => {
        if (feature.geometry) {
          // Extract coordinates based on geometry type
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

  if (hasFeatures) {
    map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 500 });
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
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
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
    map.flyTo({ center: [0, 0], zoom: 1, duration: 500 });
  } catch (err) {
    console.error("Failed to clear map:", err);
  }
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

    const newIndex = rows.length;
    rows.push(msg);
    addToMap(newIndex, msg);
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
      removeFromMap(i);
      rows.splice(i, 1);
      expandedRows.delete(i);

      // Adjust indices in expandedRows and map tracking
      const newExpanded = new Set<number>();
      expandedRows.forEach(idx => {
        if (idx > i) newExpanded.add(idx - 1);
        else if (idx < i) newExpanded.add(idx);
      });
      expandedRows = newExpanded;

      // Adjust map tracking indices
      const newMapSources = new Map<number, string>();
      const newMapLayers = new Map<number, string[]>();
      mapSources.forEach((sourceId, idx) => {
        if (idx > i) newMapSources.set(idx - 1, sourceId);
        else if (idx < i) newMapSources.set(idx, sourceId);
      });
      mapLayers.forEach((layerIds, idx) => {
        if (idx > i) newMapLayers.set(idx - 1, layerIds);
        else if (idx < i) newMapLayers.set(idx, layerIds);
      });
      mapSources.clear();
      mapLayers.clear();
      newMapSources.forEach((v, k) => mapSources.set(k, v));
      newMapLayers.forEach((v, k) => mapLayers.set(k, v));

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
  clearMap();
  rows = [];
  expandedRows.clear();
  render();
});

themeToggle.addEventListener("click", cycleTheme);

connect();
