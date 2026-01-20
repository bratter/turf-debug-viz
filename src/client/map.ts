/**
 * Mapbox configuration and map editing wrappers
 */

import type { GeoJSON, Feature, FeatureCollection } from "geojson";
import { isDark, getTheme } from "../../node_modules/theme-switcher/dist/theme-switcher.js";
import { config } from "../config.js";
import { RowData, createMetadataHTML, getFeatureColor } from "../client.ts";

// MapBox GL is loaded via CDN script tag
declare const mapboxgl: typeof import("mapbox-gl");

// Turf is loaded locally via a script tag
// TODO: Might be better to just use from node and copy
declare const turf: typeof import("@turf/turf");

const MAP_FIT_OPTIONS = {
  padding: 50,
  maxZoom: 15,
  duration: 500,
} as const;
const CIRCLE_FILTER_SHOW_VERTICIES = ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"]]];
const CIRCLE_FILTER_HIDE_VERTICIES = ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]];

// TODO: These could be handled on the class
const mapContainerParent = document.getElementById("map-view") as HTMLDivElement;

let currentMapStyle: string | undefined;

// TODO: Rename
function getMapStyleUrl(): string {
  if (isDark()) {
    return "mapbox://styles/mapbox/dark-v11";
  } else {
    return "mapbox://styles/mapbox/light-v11";
  }
}

// GeoJSON normalization
function normalizeToFeatures(geojson: GeoJSON): Feature | FeatureCollection {
  switch (geojson.type) {
    case "Feature": return geojson;
    case "FeatureCollection": return geojson;
    // It's a geometry
    default: return turf.feature(geojson);
  }
}

// ========================================
// Map Initialization
// ========================================

class MapView {
  getRenderData: () => RowData[];

  private map: mapboxgl.Map;
  private popup: mapboxgl.Popup;
  private _showVertices: boolean;

  constructor(getRenderData: () => RowData[], showVerticies = false) {
    this.getRenderData = getRenderData;
    this._showVertices = showVerticies;

    // Set MapBox access token
    mapboxgl.accessToken = config.mapboxToken;

    // Create map container div
    const mapContainer = document.createElement("div");
    mapContainer.id = "map-container";
    mapContainerParent.appendChild(mapContainer);

    // Create map instance
    const initialStyle = getMapStyleUrl();
    currentMapStyle = initialStyle;

    // TODO: Can this just go straight into the map-view section
    this.map = new mapboxgl.Map({
      container: "map-container",
      style: initialStyle,
      center: [0, 0],
      zoom: 1,
    });

    // Add navigation controls
    this.map.addControl(new mapboxgl.NavigationControl());

    // Initialize reusable popup
    this.popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: "300px",
    });

    // Set up event listener hooked into theme change
    window.addEventListener("themechange", (e) => {
      const rows = this.getRenderData();
      const theme = (e as CustomEvent).detail.theme;
      const newStyle = getMapStyleUrl();

      // If style URL has changed, set it on the map, this will re-add all the
      // shapes. If it hasn't changed, just in case ensure the colors are updated
      if (newStyle !== currentMapStyle) {
        currentMapStyle = newStyle;
        this.map.setStyle(newStyle);
      } else {
        rows.forEach((row) => {
          const color = getFeatureColor(row.index, theme);

          this.map.setPaintProperty(`layer-${row.index}-fill`, "fill-color", color);
          this.map.setPaintProperty(`layer-${row.index}-line`, "line-color", color);
          this.map.setPaintProperty(`layer-${row.index}-circle`, "circle-color", color);
        });
      }
    });

    // When style changes (e.g., theme switch), re-add all features
    // because mapbox deletes them
    this.map.on("style.load", () => {
      for (const row of this.getRenderData()) {
        this.addToMap(row);
      }
    });
  }

  get showVerticies() {
    return this._showVertices;
  }

  set showVerticies(showVerticies) {
    this._showVertices = showVerticies;
    this.updateCircleFilters();
  }

  addToMap(row: RowData) {
    try {
      const sourceId = `source-${row.index}`;
      const color = getFeatureColor(row.index, getTheme());
      // HTML for the tooltip
      const metadataHTML = createMetadataHTML(row);

      // Add source
      this.map.addSource(sourceId, {
        type: "geojson",
        data: normalizeToFeatures(row.geojson),
      });

      // Add all layer types for each shape
      // This is wasteful (as is having multiple sources), but easier to manage for MVP
      const fillLayerId = `layer-${row.index}-fill`;
      this.map.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": color,
          "fill-opacity": 0.3,
        },
        filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
      });
      this.addPopupHandler(fillLayerId, metadataHTML);

      const lineLayerId = `layer-${row.index}-line`;
      this.map.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": 2,
        },
        filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]]],
      });
      this.map.addLayer({
        id: `${lineLayerId}-hitzone`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "rgba(0, 0, 0, 0)",
          "line-width": 20,
        },
        filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
      });
      this.addPopupHandler(`${lineLayerId}-hitzone`, metadataHTML);

      const pointLayerId = `layer-${row.index}-circle`;
      this.map.addLayer({
        id: pointLayerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-color": color,
          "circle-radius": 5,
        },
        filter: this.getCircleFilter(),
      });
      this.map.addLayer({
        id: `${pointLayerId}-hitzone`,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-color": "rgba(0, 0, 0, 0)",
          "circle-radius": 10,
        },
        filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
      });
      this.addPopupHandler(`${pointLayerId}-hitzone`, metadataHTML);

    } catch (err) {
      console.error(`Failed to add GeoJSON to map for row ${row.index}:`, err);
    }
  }

  // Update all circle layer filters based on show vertices checkbox
  updateCircleFilters(): void {
    for (const row of this.getRenderData()) {
      try {
        this.map.setFilter(`layer-${row.index}-circle`, this.getCircleFilter());
      } catch (err) {
        // Layer might not exist yet, ignore error
      }
    }
  }

  // Remove GeoJSON from map
  removeFromMap(index: number): void {
    try {
      // Remove layers first, then source (ordering is required)
      this.map.removeLayer(`layer-${index}-fill`);
      this.map.removeLayer(`layer-${index}-line`);
      this.map.removeLayer(`layer-${index}-line-hitzone`);
      this.map.removeLayer(`layer-${index}-circle`);
      this.map.removeLayer(`layer-${index}-circle-hitzone`);
      this.map.removeSource(`source-${index}`);

      // Remove popup if it's showing
      this.popup!.remove();
    } catch (err) {
      console.error(`Failed to remove GeoJSON from map for row ${index}:`, err);
    }
  }


  // Clear all GeoJSON from map
  clearMap(): void {
    try {
      // Remove all sources
      for (const row of this.getRenderData()) {
        this.removeFromMap(row.index);
      }

      // Reset to world view
      this.map.flyTo({ center: [0, 0], zoom: 1, duration: MAP_FIT_OPTIONS.duration });
    } catch (err) {
      console.error("Failed to clear map:", err);
    }
  }

  // Fit map bounds to show all features
  fitAll(ignoreHidden = true): void {
    const rows = this.getRenderData();
    if (!rows.length) return;

    const bounds = [Infinity, Infinity, -Infinity, -Infinity] as any;

    for (const row of rows) {
      if (ignoreHidden && row.isHidden) continue;

      const cur = turf.bbox(row.geojson);
      bounds[0] = cur[0] < bounds[0] ? cur[0] : bounds[0];
      bounds[1] = cur[1] < bounds[1] ? cur[1] : bounds[1];
      bounds[2] = cur[2] > bounds[2] ? cur[2] : bounds[2];
      bounds[3] = cur[3] > bounds[3] ? cur[3] : bounds[3];
    }

    this.map.fitBounds(bounds, MAP_FIT_OPTIONS);
  }

  // Zoom map to a single feature
  zoomToFeature(index: number): void {
    const row = this.getRenderData().find((r) => r.index === index);
    if (!row) return;

    const bounds = turf.bbox(row.geojson) as mapboxgl.LngLatBoundsLike;

    this.map.fitBounds(bounds, MAP_FIT_OPTIONS);
  }

  resize(): void {
    this.map.resize();
  }

  // Toggle visibility of a feature on the map
  toggleVisibility(index: number): void {
    const row = this.getRenderData().find((r) => r.index === index);
    if (!row) return;

    try {
      row.isHidden = !row.isHidden;
      const visibility = row.isHidden ? "none" : "visible";

      // Toggle layer visibility
      this.map.setLayoutProperty(`layer-${index}-fill`, "visibility", visibility);
      this.map.setLayoutProperty(`layer-${index}-line`, "visibility", visibility);
      this.map.setLayoutProperty(`layer-${index}-line-hitzone`, "visibility", visibility);
      this.map.setLayoutProperty(`layer-${index}-circle`, "visibility", visibility);
      this.map.setLayoutProperty(`layer-${index}-circle-hitzone`, "visibility", visibility);
    } catch (err) {
      console.error(`Failed to toggle visibility for row ${index}:`, err);
    }
  }

  private getCircleFilter() {
    return this.showVerticies ? CIRCLE_FILTER_SHOW_VERTICIES : CIRCLE_FILTER_HIDE_VERTICIES;
  }

  // Add a popup handler for the layer with the passed id
  private addPopupHandler(layerId: string, metadataHTML: string): void {
    this.map.on("mousemove", layerId, (e) => {
      this.popup
        .setLngLat(e.lngLat)
        .setHTML(metadataHTML)
        .addTo(this.map);
    });

    // Mouse leave: hide popup
    this.map.on("mouseleave", layerId, () => {
      this.popup.remove();
    });
  }
}

export { MapView };
