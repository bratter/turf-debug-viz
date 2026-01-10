/**
 * Test the export hook
 *
 * Start the relay server first: npm start
 * Then run: npx tsx --import ./export-hook.ts test.ts
 */

import { Point } from "geojson";

console.log("Testing export hook with GeoJSON");

// Test with a simple Point
const point: Point = {
  type: "Point",
  coordinates: [-122.4194, 37.7749],
};
DebugViz.send(point, "test-point");

// Test with a Polygon near the test-point
DebugViz.send({
  type: "Polygon",
  coordinates: [
    [
      [-122.42, 37.77],
      [-122.41, 37.77],
      [-122.41, 37.78],
      [-122.42, 37.78],
      [-122.42, 37.77],
    ],
  ],
}, "test-polygon");

// Test with a Feature
DebugViz.send({
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [-122.4, 37.8],
      [-122.5, 37.9],
    ],
  },
  properties: {
    name: "Test Line",
    color: "blue",
  },
}, "test-feature");

// Test with a FeatureCollection
DebugViz.send({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [0, 0],
      },
      properties: { label: "Origin" },
    },
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [1, 1],
      },
      properties: { label: "Point 1,1" },
    },
  ],
}, "test-collection");

// Test access to turf
console.log(turf.bbox(point));

// Test disconnect functionality
// Note that this is not required as the .unref in export-hook will auto-exit
setTimeout(() => {
  console.log("Messages sent. Check connection status...");
  console.log("Connected:", DebugViz.isConnected());

  DebugViz.disconnect();

  console.log("Disconnected from relay server");
  console.log("Connected:", DebugViz.isConnected());
}, 100);

