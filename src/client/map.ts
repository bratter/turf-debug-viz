/**
 * Mapbox configuration and map editing wrappers
 */

import type { GeoJSON, Feature, FeatureCollection } from "geojson";
import type { ViewRow } from "../../types.js";
import { isDark } from "../../vendor/theme-switcher.js";
import { config } from "../config.js";
import {
  createMetadataHTML,
  getFeatureColor,
  getSemanticColor,
} from "./helpers.ts";

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
const CIRCLE_FILTER_SHOW_VERTICIES = [
  "in",
  ["geometry-type"],
  [
    "literal",
    [
      "Point",
      "MultiPoint",
      "LineString",
      "MultiLineString",
      "Polygon",
      "MultiPolygon",
    ],
  ],
];
const CIRCLE_FILTER_HIDE_VERTICIES = [
  "in",
  ["geometry-type"],
  ["literal", ["Point", "MultiPoint"]],
];

// TODO: Rename
function getMapStyleUrl(): string {
  if (isDark()) {
    return "mapbox://styles/mapbox/dark-v11";
  } else {
    return "mapbox://styles/mapbox/light-v11";
  }
}

// Checks that a value is GeoJSON with enough structure for Mapbox to render
// without throwing async errors. Specifically validates that:
//   - it's a non-null object with a known GeoJSON type
//   - geometries have array coordinates (not strings, undefined, etc.)
function isRenderableGeoJSON(gj: unknown): gj is GeoJSON {
  if (typeof gj !== "object" || gj === null) return false;
  const obj = gj as Record<string, unknown>;
  switch (obj.type) {
    case "Feature":
      return obj.geometry === null || isRenderableGeoJSON(obj.geometry);
    case "FeatureCollection":
      return Array.isArray(obj.features);
    case "GeometryCollection":
      return Array.isArray(obj.geometries);
    case "Point":
    case "MultiPoint":
    case "LineString":
    case "MultiLineString":
    case "Polygon":
    case "MultiPolygon":
      return Array.isArray(obj.coordinates);
    default:
      return false;
  }
}

// GeoJSON normalization
function normalizeToFeatures(geojson: GeoJSON): Feature | FeatureCollection {
  switch (geojson.type) {
    case "Feature":
      return geojson;
    case "FeatureCollection":
      return geojson;
    // It's a geometry
    default:
      return turf.feature(geojson);
  }
}

/**
 * Manage a MapboxWebGL map.
 */
class MapView {
  getRenderData: () => readonly ViewRow[];

  private map: mapboxgl.Map;
  private popup: mapboxgl.Popup;
  private currentStyleUrl: string;
  private showVerticesInternal: boolean;
  private fitScheduled = false;
  private fitTargetIndices: number[] | null = null;
  private diffOverlayData: FeatureCollection | null | undefined = undefined;
  private diffOverlayVisible = true;
  private diffOverlayHandlersAdded = false;

  constructor(
    container: HTMLElement | string,
    getRenderData: () => readonly ViewRow[],
    showVerticies = false,
  ) {
    this.getRenderData = getRenderData;
    this.showVerticesInternal = showVerticies;

    // Set MapBox access token
    mapboxgl.accessToken = config.mapboxToken;

    // Create map instance
    const initialStyle = getMapStyleUrl();
    this.currentStyleUrl = initialStyle;

    this.map = new mapboxgl.Map({
      container: container,
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
    window.addEventListener("themechange", () => {
      const rows = this.getRenderData();
      const newStyle = getMapStyleUrl();

      // If style URL has changed, set it on the map, this will re-add all the
      // shapes. If it hasn't changed, just in case ensure the colors are updated
      if (newStyle !== this.currentStyleUrl) {
        this.currentStyleUrl = newStyle;
        this.map.setStyle(newStyle);
      } else {
        rows.forEach((row) => {
          const color = getFeatureColor(row.index);

          this.map.setPaintProperty(
            `layer-${row.index}-fill`,
            "fill-color",
            color,
          );
          this.map.setPaintProperty(
            `layer-${row.index}-line`,
            "line-color",
            color,
          );
          this.map.setPaintProperty(
            `layer-${row.index}-circle`,
            "circle-color",
            color,
          );
        });
      }
    });

    // When style changes (e.g., theme switch), re-add all features
    // because mapbox deletes them
    this.map.on("style.load", () => {
      for (const row of this.getRenderData()) {
        this.addToMap(row);
      }
      // Re-add diff overlay if it was previously initialized
      if (this.diffOverlayData !== undefined) {
        this.addDiffOverlayLayers();
      }
    });
  }

  get showVertices() {
    return this.showVerticesInternal;
  }

  set showVertices(showVerticies) {
    this.showVerticesInternal = showVerticies;
    this.updateCircleFilters();
  }

  addToMap(row: ViewRow) {
    if (!isRenderableGeoJSON(row.geojson)) {
      console.warn(`Skipping row ${row.index}: not valid GeoJSON`, row.geojson);
      return;
    }
    try {
      const sourceId = `source-${row.index}`;
      const color = getFeatureColor(row.index);
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
        filter: [
          "in",
          ["geometry-type"],
          ["literal", ["Polygon", "MultiPolygon"]],
        ],
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
        filter: [
          "in",
          ["geometry-type"],
          [
            "literal",
            ["LineString", "MultiLineString", "Polygon", "MultiPolygon"],
          ],
        ],
      });
      this.map.addLayer({
        id: `${lineLayerId}-hitzone`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "rgba(0, 0, 0, 0)",
          "line-width": 20,
        },
        filter: [
          "in",
          ["geometry-type"],
          ["literal", ["LineString", "MultiLineString"]],
        ],
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
      const layerId = `layer-${row.index}-circle`;
      if (this.map.getLayer(layerId)) {
        this.map.setFilter(layerId, this.getCircleFilter());
      }
    }
  }

  // Remove GeoJSON from map
  removeFromMap(index: number): void {
    if (!this.map.getSource(`source-${index}`)) return;
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

  // Clear specified features from map and reset to world view
  clearMap(rows: ViewRow[]): void {
    try {
      for (const row of rows) {
        this.removeFromMap(row.index);
      }

      // Reset to world view
      this.map.flyTo({
        center: [0, 0],
        zoom: 1,
        duration: MAP_FIT_OPTIONS.duration,
      });
    } catch (err) {
      console.error("Failed to clear map:", err);
    }
  }

  fit(ignoreHidden?: boolean): void;
  fit(indices: number[], ignoreHidden?: boolean): void;
  /** Fit the map to the appropriate feature bounds */
  fit(indicesOrIgnoreHidden?: number[] | boolean, ignoreHidden = true): void {
    let rows: readonly ViewRow[];

    if (Array.isArray(indicesOrIgnoreHidden)) {
      // Specific indices provided
      const indices = indicesOrIgnoreHidden;
      rows = this.getRenderData().filter((r) => indices.includes(r.index));
      if (ignoreHidden) {
        rows = rows.filter((r) => !r.isHidden);
      }
    } else {
      // Fit all rows
      const shouldIgnoreHidden = indicesOrIgnoreHidden ?? true;
      rows = this.getRenderData();
      if (shouldIgnoreHidden) {
        rows = rows.filter((r) => !r.isHidden);
      }
    }

    if (!rows.length) return;

    const bounds = [Infinity, Infinity, -Infinity, -Infinity] as any;
    for (const row of rows) {
      try {
        const cur = turf.bbox(row.geojson);
        bounds[0] = cur[0] < bounds[0] ? cur[0] : bounds[0];
        bounds[1] = cur[1] < bounds[1] ? cur[1] : bounds[1];
        bounds[2] = cur[2] > bounds[2] ? cur[2] : bounds[2];
        bounds[3] = cur[3] > bounds[3] ? cur[3] : bounds[3];
      } catch (err) {
        console.warn(`Skipping row ${row.index} for fit: invalid GeoJSON`, err);
      }
    }

    if (bounds[0] !== Infinity) {
      this.map.fitBounds(bounds, MAP_FIT_OPTIONS);
    }
  }

  scheduleFit(ignoreHidden?: boolean): void;
  scheduleFit(indices: number[], ignoreHidden?: boolean): void;
  /** Schedule a fit that coalesces multiple calls via requestAnimationFrame */
  scheduleFit(
    indicesOrIgnoreHidden?: number[] | boolean,
    ignoreHidden?: boolean,
  ): void {
    if (this.fitScheduled) return;
    this.fitScheduled = true;

    // Store parameters for deferred execution
    this.fitTargetIndices = Array.isArray(indicesOrIgnoreHidden)
      ? indicesOrIgnoreHidden
      : null;
    const storedIgnoreHidden = Array.isArray(indicesOrIgnoreHidden)
      ? (ignoreHidden ?? true)
      : (indicesOrIgnoreHidden ?? true);

    requestAnimationFrame(() => {
      this.fitScheduled = false;
      if (this.fitTargetIndices === null) {
        this.fit(storedIgnoreHidden);
      } else {
        this.fit(this.fitTargetIndices, storedIgnoreHidden);
      }
    });
  }

  // Backwards compatibility aliases
  fitAll(ignoreHidden = true): void {
    this.fit(ignoreHidden);
  }

  // Zoom map to a single feature
  zoomToFeature(index: number): void {
    const row = this.getRenderData().find((r) => r.index === index);
    if (!row) return;

    try {
      const bounds = turf.bbox(row.geojson) as mapboxgl.LngLatBoundsLike;
      this.map.fitBounds(bounds, MAP_FIT_OPTIONS);
    } catch (err) {
      console.warn(`Failed to zoom to row ${index}: invalid GeoJSON`, err);
    }
  }

  resize(): void {
    this.map.resize();
  }

  // Set visibility of a feature's layers on the map
  setLayerVisibility(index: number, visible: boolean): void {
    if (!this.map.getSource(`source-${index}`)) return;
    try {
      const visibility = visible ? "visible" : "none";

      this.map.setLayoutProperty(
        `layer-${index}-fill`,
        "visibility",
        visibility,
      );
      this.map.setLayoutProperty(
        `layer-${index}-line`,
        "visibility",
        visibility,
      );
      this.map.setLayoutProperty(
        `layer-${index}-line-hitzone`,
        "visibility",
        visibility,
      );
      this.map.setLayoutProperty(
        `layer-${index}-circle`,
        "visibility",
        visibility,
      );
      this.map.setLayoutProperty(
        `layer-${index}-circle-hitzone`,
        "visibility",
        visibility,
      );
    } catch (err) {
      console.error(`Failed to set visibility for row ${index}:`, err);
    }
  }

  // Set the diff overlay GeoJSON. First call creates source and layers;
  // subsequent calls update the source data. Pass null to clear.
  setDiffOverlay(overlay: FeatureCollection | null | undefined): void {
    this.diffOverlayData = overlay;
    const data: FeatureCollection = overlay ?? {
      type: "FeatureCollection",
      features: [],
    };
    const source = this.map.getSource("source-diff-overlay") as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (source) {
      source.setData(data);
    } else {
      this.addDiffOverlayLayers();
    }
  }

  // Toggle visibility of all diff overlay layers
  setDiffOverlayVisible(visible: boolean): void {
    this.diffOverlayVisible = visible;
    const visibility = visible ? "visible" : "none";
    for (const id of [
      "layer-diff-overlay-fill",
      "layer-diff-overlay-line",
      "layer-diff-overlay-hitzone",
    ]) {
      try {
        if (this.map.getLayer(id)) {
          this.map.setLayoutProperty(id, "visibility", visibility);
        }
      } catch {
        // Layer may not exist yet
      }
    }
  }

  // Add source and layers for diff overlay. Called on first use and after
  // style changes (which wipe all sources/layers).
  private addDiffOverlayLayers(): void {
    const REMOVED_COLOR = getSemanticColor("error");
    const ADDED_COLOR = getSemanticColor("added");
    const diffTypeColor = [
      "match",
      ["get", "diffType"],
      "added",
      ADDED_COLOR,
      REMOVED_COLOR,
    ];

    const data: FeatureCollection = this.diffOverlayData ?? {
      type: "FeatureCollection",
      features: [],
    };

    this.map.addSource("source-diff-overlay", { type: "geojson", data });

    // Fill layer: polygon removed/added areas
    this.map.addLayer({
      id: "layer-diff-overlay-fill",
      type: "fill",
      source: "source-diff-overlay",
      paint: {
        "fill-color": diffTypeColor as any,
        "fill-opacity": 0.4,
      },
      filter: ["in", ["get", "diffType"], ["literal", ["removed", "added"]]],
    });

    // Line layer: polygon outlines and connector lines
    this.map.addLayer({
      id: "layer-diff-overlay-line",
      type: "line",
      source: "source-diff-overlay",
      paint: {
        "line-color": diffTypeColor as any,
        "line-width": 2,
      },
      filter: [
        "in",
        ["get", "diffType"],
        ["literal", ["removed", "added", "connector"]],
      ],
    });

    // Hitzone layer: wide invisible line for connector hover detection
    this.map.addLayer({
      id: "layer-diff-overlay-hitzone",
      type: "line",
      source: "source-diff-overlay",
      paint: {
        "line-color": "rgba(0, 0, 0, 0)",
        "line-width": 20,
      },
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["LineString", "MultiLineString"]],
      ],
    });

    // Restore visibility preference (e.g. after a style reload)
    if (!this.diffOverlayVisible) {
      this.setDiffOverlayVisible(false);
    }

    // Register popup handlers once — they persist through style changes
    // since they are registered on the map event system, not tied to a source
    if (!this.diffOverlayHandlersAdded) {
      this.diffOverlayHandlersAdded = true;

      this.map.on("mousemove", "layer-diff-overlay-fill", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const diffType = feature.properties?.diffType as string;
        let html = diffType === "added" ? "Added" : "Removed";
        try {
          const area = turf.area(feature as any) / 1e6;
          html += `<br>Area: ${area.toFixed(4)} km²`;
        } catch {
          // ignore
        }
        this.popup.setLngLat(e.lngLat).setHTML(html).addTo(this.map);
      });
      this.map.on("mouseleave", "layer-diff-overlay-fill", () => {
        this.popup.remove();
      });

      this.map.on("mousemove", "layer-diff-overlay-hitzone", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        let html = "Point displacement";
        try {
          const dist = turf.length(feature as any, { units: "kilometers" });
          html += `<br>Distance: ${dist.toFixed(4)} km`;
        } catch {
          // ignore
        }
        this.popup.setLngLat(e.lngLat).setHTML(html).addTo(this.map);
      });
      this.map.on("mouseleave", "layer-diff-overlay-hitzone", () => {
        this.popup.remove();
      });
    }
  }

  private getCircleFilter() {
    return this.showVertices
      ? CIRCLE_FILTER_SHOW_VERTICIES
      : CIRCLE_FILTER_HIDE_VERTICIES;
  }

  // Add a popup handler for the layer with the passed id
  private addPopupHandler(layerId: string, metadataHTML: string): void {
    this.map.on("mousemove", layerId, (e) => {
      this.popup.setLngLat(e.lngLat).setHTML(metadataHTML).addTo(this.map);
    });

    // Mouse leave: hide popup
    this.map.on("mouseleave", layerId, () => {
      this.popup.remove();
    });
  }
}

export { MapView };
