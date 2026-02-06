/**
 * Helper functions
 */

import type { GeoJSON } from "geojson";
import { isDark } from "../../node_modules/theme-switcher/dist/theme-switcher.js";
import type { DiffEntry, SendMessage } from "../../types.js";

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
// Get theme-appropriate color for map features using indexed palette
/**
 * Get theme-appropriate color using an indexed palette.
 */
function getFeatureColor(index: number): string {
  const palette = isDark() ? COLOR_PALETTE_DARK : COLOR_PALETTE_LIGHT;

  return palette[index % palette.length];
}

/**
 * Build a type description line for a GeoJSON object.
 */
function getGeoJSONTypeLine(gj: GeoJSON): string {
  switch (gj.type) {
    case "FeatureCollection":
      return `${gj.type} (${gj.features.length})`;
    case "GeometryCollection":
      return `${gj.type} (${gj.geometries.length})`;
    case "Feature": {
      const id = gj.id ?? gj.properties?.id ?? null;
      return (id !== null ? `<strong>${id}:</strong> ` : "") + `Feature (${gj.geometry.type})`;
    }
    default:
      return `Geometry (${gj.type})`;
  }
}

/**
 * Create a HTML string that captures the metadata for a shape.
 *
 * Includes <br> separated lines.
 */
function createMetadataHTML(row: SendMessage): string {
  const displayLines: string[] = [];

  if (row.label) {
    displayLines.push(row.label);
  }

  displayLines.push(getGeoJSONTypeLine(row.geojson));

  const ts = new Date(row.ts || Date.now()).toISOString();
  displayLines.push(`<small class="timestamp">${ts}</small>`);

  return displayLines.join("<br>");
}

/**
 * Create a HTML string for a diff entry's metadata.
 *
 * Shows the diff label, labeled from/to type lines, and timestamp.
 */
function createDiffMetadataHTML(d: DiffEntry): string {
  const displayLines: string[] = [];

  if (d.label) {
    displayLines.push(d.label);
  }

  displayLines.push(`from: ${getGeoJSONTypeLine(d.from.geojson)}`);
  displayLines.push(`to: ${getGeoJSONTypeLine(d.to.geojson)}`);

  const ts = new Date(d.ts).toISOString();
  displayLines.push(`<small class="timestamp">${ts}</small>`);

  return displayLines.join("<br>");
}

export { getFeatureColor, createMetadataHTML, createDiffMetadataHTML };
