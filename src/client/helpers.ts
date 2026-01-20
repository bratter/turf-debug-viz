/**
 * Helper functions
 */

import { isDark } from "../../node_modules/theme-switcher/dist/theme-switcher.js";
import { RowData } from "../client.ts";

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
 * Create a HTML string that captures the metadata for a shape.
 *
 * Includes <br> separated lines.
 */
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

export { getFeatureColor, createMetadataHTML };
