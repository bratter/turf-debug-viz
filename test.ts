/**
 * Test the export hook
 *
 * Start the relay server first: npm start
 * Then run: npx tsx --import ./export-hook.ts test.ts
 */

console.log("Testing export hook with GeoJSON");

// Test with a simple Point
exportDebug("test-point", {
  type: "Point",
  coordinates: [-122.4194, 37.7749],
});

// Test with a Feature
exportDebug("test-feature", {
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
exportDebug("test-collection", {
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

console.log("Messages sent. Disconnecting...");

// Test disconnect functionality
setTimeout(() => {
  disconnectDebug();
  console.log("Disconnected from relay server");
}, 100);

