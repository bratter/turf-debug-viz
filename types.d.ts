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
 *     function sendAsync(label: string, geojson: GeoJSON): void;
 *     function disconnect(): void;
 *     function isConnected(): boolean;
 *     function queueLen(): number;
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
     * Synchronously sends a GeoJSON object to the debug visualizer (default)
     * Blocks until connection is established and message is sent.
     * Works correctly when stepping through code in a debugger.
     * @param label - A label to identify this debug output
     * @param geojson - Any valid GeoJSON object (Geometry, Feature, or FeatureCollection)
     */
    function send(label: string, geojson: GeoJSON): void;

    /**
     * Asynchronously sends a GeoJSON object to the debug visualizer
     * Does not block - queues messages if not connected.
     * Use for high-frequency sends where blocking is undesirable.
     * @param label - A label to identify this debug output
     * @param geojson - Any valid GeoJSON object (Geometry, Feature, or FeatureCollection)
     */
    function sendAsync(label: string, geojson: GeoJSON): void;

    /**
     * Disconnects from the debug relay server
     * Call this when you're done debugging to close the WebSocket connection.
     * Note: Connection automatically closes on process exit.
     */
    function disconnect(): void;

    /**
     * Check if currently connected to the debug relay server
     * @returns true if WebSocket connection is open
     */
    function isConnected(): boolean;

    /**
     * Number of messages in the queue to the relay server.
     * @returns number
     */
    function queueLen(): number;
  }
}

export { };
