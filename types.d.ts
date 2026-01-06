/**
 * Type definitions for turf-debug-viz
 * Copy these type declarations into your project to use the export hook
 */

import type { GeoJSON } from "geojson";

/**
 * Debug message structure sent over the wire
 */
export interface DebugMessage {
  label: string;
  ts: number;
  geojson: GeoJSON;
}

/**
 * Global type declarations for the export hook
 *
 * To use in your TypeScript project, add this to your code or a .d.ts file:
 *
 * ```typescript
 * import type { GeoJSON } from "geojson";
 *
 * declare global {
 *   var exportDebug: (label: string, geojson: GeoJSON) => void;
 *   var disconnectDebug: () => void;
 * }
 * ```
 */
declare global {
  /**
   * Exports a GeoJSON object to the debug visualizer
   * @param label - A label to identify this debug output
   * @param geojson - Any valid GeoJSON object (Geometry, Feature, or FeatureCollection)
   */
  var exportDebug: (label: string, geojson: GeoJSON) => void;

  /**
   * Disconnects from the debug relay server
   * Call this when you're done debugging to close the WebSocket connection
   */
  var disconnectDebug: () => void;
}

export {};
