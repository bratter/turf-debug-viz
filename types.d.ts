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
 * The best way to use is a reference path in the system under test:
 *
 * ```typescript
 * /// <reference path="/path/to/turf-debug-viz/types.d.ts" />
 * ```
 */
declare global {
  var turf: typeof import("@turf/turf");

  /**
   * Debug visualization namespace for sending GeoJSON to the relay server
   */
  namespace DebugViz {
    /**
     * Synchronously sends a GeoJSON object to the debug visualizer.
     * Blocks until connection is established and message is sent.
     * Works correctly when stepping through code in a debugger.
     *
     * Note: This API is intentionally synchronous for debug instrumentation.
     * It ensures messages are sent before continuing execution, which is
     * essential when stepping through code in a debugger.
     *
     * @param label - A label to identify this debug output
     * @param geojson - Any valid GeoJSON object (Geometry, Feature, or FeatureCollection)
     */
    function send(label: string, geojson: GeoJSON): void;

    /**
     * Disconnects from the debug relay server.
     * Note: Not required for process exit - WebSocket is unref'd and won't prevent exit.
     */
    function disconnect(): void;

    /**
     * Check if currently connected to the debug relay server.
     * @returns true if WebSocket connection is open
     */
    function isConnected(): boolean;
  }
}

export { };
