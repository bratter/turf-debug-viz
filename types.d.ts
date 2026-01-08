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
 *   namespace DebugViz {
 *     function send(label: string, geojson: GeoJSON): void;
 *     function disconnect(): void;
 *     function isConnected(): boolean;
 *   }
 *   var DebugViz: typeof DebugViz;
 * }
 * ```
 */
declare global {
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
