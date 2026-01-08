/**
 * Test the export hook
 *
 * Start the relay server first: npm start
 * Then run: npx tsx --import ./export-hook.ts test.ts
 */

console.log("Testing export hook with GeoJSON");

// Test with a simple Point
DebugViz.send("test-point", {
  type: "Point",
  coordinates: [-122.4194, 37.7749],
});

// Test with a Polygon near the test-point
DebugViz.send("test-polygon", {
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
});

// Test with a Feature
DebugViz.send("test-feature", {
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
});

// Test with a FeatureCollection
DebugViz.send("test-collection", {
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
});

// Test disconnect functionality
// Note that this is not required as the .unref in export-hook will auto-exit
setTimeout(() => {
  console.log("Messages sent. Check connection status...");
  console.log("Connected:", DebugViz.isConnected());

  DebugViz.disconnect();

  console.log("Disconnected from relay server");
  console.log("Connected:", DebugViz.isConnected());
}, 100);

