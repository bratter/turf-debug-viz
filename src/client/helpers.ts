/**
 * Helper functions
 */

import type { GeoJSON } from "geojson";
import { isDark } from "../../vendor/theme-switcher.js";
import type { DiffEntry, SendMessage } from "../../types.js";

// TokyoNight color palettes for feature visualization.
// Red is excluded from rotation — it's reserved for semantic use (errors/removed).
const COLOR_PALETTE_LIGHT = [
  "#2e7de9", // blue
  "#587539", // green
  "#9854f1", // purple
  "#007197", // cyan
  "#b15c00", // orange
  "#7847bd", // magenta
  "#8c6c3e", // yellow
];

const COLOR_PALETTE_DARK = [
  "#82aaff", // blue
  "#c3e88d", // green
  "#fca7ea", // purple
  "#86e1fc", // cyan
  "#ff966c", // orange
  "#c099ff", // magenta
  "#ffc777", // yellow
];

// Semantic colors for errors/removed, added/success, and warnings.
// Kept separate from the feature palette so they carry consistent meaning.
export const SEMANTIC_COLORS = {
  dark: {
    error: "#ff757f", // TokyoNight dark red
    added: "#73daca", // TokyoNight green1/teal
    warning: "#ffc777", // TokyoNight dark yellow
  },
  light: {
    error: "#f52a65", // TokyoNight light red
    added: "#33948c", // TokyoNight light teal
    warning: "#8c6c3e", // TokyoNight light yellow
  },
} as const;

/**
 * Get theme-appropriate color using an indexed palette.
 */
function getFeatureColor(index: number): string {
  const palette = isDark() ? COLOR_PALETTE_DARK : COLOR_PALETTE_LIGHT;

  return palette[index % palette.length] as string;
}

/**
 * Get a semantic color for the current theme.
 */
function getSemanticColor(kind: keyof typeof SEMANTIC_COLORS.dark): string {
  return isDark() ? SEMANTIC_COLORS.dark[kind] : SEMANTIC_COLORS.light[kind];
}

/**
 * Build a type description line for a GeoJSON object.
 */
function getGeoJSONTypeLine(gj: GeoJSON): string {
  if (typeof (gj as unknown) !== "object" || gj === null) return "(invalid)";
  switch (gj.type) {
    case "FeatureCollection":
      return `${gj.type} (${gj.features.length})`;
    case "GeometryCollection":
      return `${gj.type} (${gj.geometries.length})`;
    case "Feature": {
      const id = gj.id ?? gj.properties?.id ?? null;
      const geomType = gj.geometry != null ? gj.geometry.type : "null";
      return (
        (id !== null ? `<strong>${id}:</strong> ` : "") +
        `Feature (${geomType})`
      );
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

export {
  getFeatureColor,
  getSemanticColor,
  createMetadataHTML,
  createDiffMetadataHTML,
};
