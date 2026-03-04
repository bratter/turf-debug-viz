import test from "tape";
import { normalizeGeoJSON } from "./normalize.ts";
import { diffGeoJSON } from "./engine.ts";

// ========================================
// Fixtures
// ========================================

// Polygon starting at [0,0]
const poly1 = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

// Same polygon starting at [1,0] (different start vertex)
const poly2 = {
  type: "Polygon",
  coordinates: [
    [
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
    ],
  ],
};

// ========================================
// Coordinate precision
// ========================================

test("precision: rounds coordinates to 6dp by default", (t) => {
  const noisy = { type: "Point", coordinates: [1.0000001, 2.0000001] };
  const n = normalizeGeoJSON(noisy) as any;
  t.equal(n.coordinates[0], 1.0);
  t.equal(n.coordinates[1], 2.0);
  t.end();
});

test("precision: custom precision option", (t) => {
  const p = { type: "Point", coordinates: [1.123456789, 2.987654321] };
  const n = normalizeGeoJSON(p, { precision: 4 }) as any;
  t.equal(n.coordinates[0], 1.1235);
  t.equal(n.coordinates[1], 2.9877);
  t.end();
});

test("precision: rounds all coordinates in Polygon", (t) => {
  const poly = {
    type: "Polygon",
    coordinates: [
      [
        [0.1234567, 0.7654321],
        [1.1234567, 0.7654321],
        [1.1234567, 1.7654321],
        [0.1234567, 0.7654321],
      ],
    ],
  };
  const n = normalizeGeoJSON(poly, { precision: 4 }) as any;
  t.equal(n.coordinates[0][0][0], 0.1235);
  t.equal(n.coordinates[0][0][1], 0.7654);
  t.end();
});

// ========================================
// Dedup consecutive positions
// ========================================

test("dedup: removes consecutive duplicate positions in ring", (t) => {
  const poly = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 0], // duplicate
        [1, 1],
        [0, 0],
      ],
    ],
  };
  const n = normalizeGeoJSON(poly) as any;
  t.equal(n.coordinates[0].length, 4); // [0,0],[1,0],[1,1],[0,0]
  t.end();
});

test("dedup: removes consecutive duplicate positions in LineString", (t) => {
  const ls = {
    type: "LineString",
    coordinates: [
      [0, 0],
      [1, 0],
      [1, 0], // duplicate
      [2, 0],
    ],
  };
  const n = normalizeGeoJSON(ls) as any;
  t.deepEqual(n.coordinates, [
    [0, 0],
    [1, 0],
    [2, 0],
  ]);
  t.end();
});

test("dedup: non-consecutive duplicates are kept", (t) => {
  const ls = {
    type: "LineString",
    coordinates: [
      [0, 0],
      [1, 0],
      [0, 0], // same as first but not consecutive
    ],
  };
  const n = normalizeGeoJSON(ls) as any;
  t.equal(n.coordinates.length, 3);
  t.end();
});

test("dedup: degenerate ring (< 4 after dedup) preserved as-is", (t) => {
  const poly = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
    ],
  };
  const n = normalizeGeoJSON(poly) as any;
  t.equal(n.coordinates[0].length, 3);
  t.end();
});

// ========================================
// Ring rotation
// ========================================

test("ring rotation: same polygon different start vertex → identical after normalize", (t) => {
  const n1 = normalizeGeoJSON(poly1);
  const n2 = normalizeGeoJSON(poly2);
  t.equal(JSON.stringify(n1), JSON.stringify(n2));
  t.end();
});

test("ring rotation: rotates to lex-smallest start vertex", (t) => {
  const n = normalizeGeoJSON(poly2) as any;
  // [0,0] is lex smallest → should be first
  t.deepEqual(n.coordinates[0][0], [0, 0]);
  t.end();
});

test("ring rotation: ring already at canonical start → unchanged", (t) => {
  const n = normalizeGeoJSON(poly1) as any;
  t.deepEqual(n.coordinates[0][0], [0, 0]);
  t.deepEqual(n.coordinates[0], [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ]);
  t.end();
});

test("ring rotation: closing vertex is preserved after rotation", (t) => {
  const n = normalizeGeoJSON(poly2) as any;
  const ring = n.coordinates[0];
  t.deepEqual(ring[0], ring[ring.length - 1], "ring still closed");
  t.end();
});

test("ring rotation: inner ring also rotated", (t) => {
  const poly = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ], // outer
      [
        [5, 5],
        [6, 5],
        [6, 6],
        [5, 6],
        [5, 5],
      ], // inner, already canonical
    ],
  };
  const poly2 = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [6, 5],
        [6, 6],
        [5, 6],
        [5, 5],
        [6, 5],
      ], // inner, different start
    ],
  };
  const n1 = normalizeGeoJSON(poly) as any;
  const n2 = normalizeGeoJSON(poly2) as any;
  t.equal(JSON.stringify(n1.coordinates[1]), JSON.stringify(n2.coordinates[1]));
  t.end();
});

// ========================================
// Winding direction (NOT normalized)
// ========================================

test("winding: direction is NOT changed by normalization", (t) => {
  // CCW polygon
  const ccw = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  };
  // CW polygon (reversed winding)
  const cw = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    ],
  };
  const nCcw = normalizeGeoJSON(ccw) as any;
  const nCw = normalizeGeoJSON(cw) as any;
  // They should NOT be equal — winding is preserved
  t.notEqual(JSON.stringify(nCcw), JSON.stringify(nCw));
  t.end();
});

// ========================================
// Multi-geometry sorting
// ========================================

test("MultiPolygon: sub-polygons sorted by first coordinate", (t) => {
  const mp = {
    type: "MultiPolygon",
    coordinates: [
      // polygon starting at [5,5]
      [
        [
          [5, 5],
          [6, 5],
          [6, 6],
          [5, 6],
          [5, 5],
        ],
      ],
      // polygon starting at [0,0]
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    ],
  };
  const n = normalizeGeoJSON(mp) as any;
  t.deepEqual(n.coordinates[0][0][0], [0, 0], "polygon with [0,0] comes first");
  t.deepEqual(
    n.coordinates[1][0][0],
    [5, 5],
    "polygon with [5,5] comes second",
  );
  t.end();
});

test("MultiLineString: sub-linestrings sorted by first coordinate", (t) => {
  const mls = {
    type: "MultiLineString",
    coordinates: [
      [
        [5, 0],
        [6, 0],
      ],
      [
        [0, 0],
        [1, 0],
      ],
    ],
  };
  const n = normalizeGeoJSON(mls) as any;
  t.deepEqual(n.coordinates[0][0], [0, 0]);
  t.end();
});

test("MultiPoint: positions sorted lexicographically", (t) => {
  const mp = {
    type: "MultiPoint",
    coordinates: [
      [5, 0],
      [0, 0],
      [2, 3],
    ],
  };
  const n = normalizeGeoJSON(mp) as any;
  t.deepEqual(n.coordinates[0], [0, 0]);
  t.deepEqual(n.coordinates[1], [2, 3]);
  t.deepEqual(n.coordinates[2], [5, 0]);
  t.end();
});

// ========================================
// FeatureCollection sorting
// ========================================

test("FeatureCollection: features sorted by geometry first coordinate", (t) => {
  const fc = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [5, 0] },
      },
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [0, 0] },
      },
    ],
  };
  const n = normalizeGeoJSON(fc) as any;
  t.deepEqual(n.features[0].geometry.coordinates, [0, 0]);
  t.deepEqual(n.features[1].geometry.coordinates, [5, 0]);
  t.end();
});

test("FeatureCollection: null geometry features sorted to end", (t) => {
  const fc = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: null },
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [0, 0] },
      },
    ],
  };
  const n = normalizeGeoJSON(fc) as any;
  t.notEqual(n.features[0].geometry, null, "non-null geometry first");
  t.equal(n.features[1].geometry, null, "null geometry last");
  t.end();
});

// ========================================
// GeometryCollection
// ========================================

test("GeometryCollection: recurses into geometries (no sorting)", (t) => {
  const gc = {
    type: "GeometryCollection",
    geometries: [
      { type: "Point", coordinates: [1.1234567, 2.1234567] },
      { type: "Point", coordinates: [3.1234567, 4.1234567] },
    ],
  };
  const n = normalizeGeoJSON(gc, { precision: 4 }) as any;
  t.equal(n.geometries[0].coordinates[0], 1.1235);
  t.equal(n.geometries[1].coordinates[0], 3.1235);
  // Order preserved (no sorting)
  t.deepEqual([n.geometries[0].type, n.geometries[1].type], ["Point", "Point"]);
  t.end();
});

// ========================================
// Edge cases
// ========================================

test("non-GeoJSON input returned unchanged", (t) => {
  t.equal(normalizeGeoJSON("string"), "string");
  t.equal(normalizeGeoJSON(42), 42);
  t.equal(normalizeGeoJSON(null), null);
  t.deepEqual(normalizeGeoJSON({ foo: "bar" }), { foo: "bar" });
  t.end();
});

test("Feature with null geometry: geometry passed through unchanged", (t) => {
  const f = { type: "Feature", properties: {}, geometry: null };
  const n = normalizeGeoJSON(f) as any;
  t.equal(n.geometry, null);
  t.end();
});

test("Point: no rotation or dedup, only rounding", (t) => {
  const p = { type: "Point", coordinates: [1.000000001, 2.000000001] };
  const n = normalizeGeoJSON(p) as any;
  t.equal(n.coordinates[0], 1.0);
  t.equal(n.coordinates[1], 2.0);
  t.end();
});

// ========================================
// Integration with diffGeoJSON
// ========================================

test("diffGeoJSON normalize:true → same polygon different start = unchanged", (t) => {
  const r = diffGeoJSON(poly1, poly2, { normalize: true });
  t.equal(r.hasChanges, false);
  t.end();
});

test("diffGeoJSON normalize:false → same polygon different start = changed", (t) => {
  const r = diffGeoJSON(poly1, poly2, { normalize: false });
  t.equal(r.hasChanges, true);
  t.end();
});

test("diffGeoJSON normalize:true with precision: floating-point jitter = unchanged", (t) => {
  const a = { type: "Point", coordinates: [1.0, 2.0] };
  const b = { type: "Point", coordinates: [1.0000001, 2.0000001] };
  const r = diffGeoJSON(a, b, { normalize: true, precision: 6 });
  t.equal(r.hasChanges, false);
  t.end();
});

test("diffGeoJSON normalize:true with truly different geometry = still changed", (t) => {
  const a = { type: "Point", coordinates: [0, 0] };
  const b = { type: "Point", coordinates: [1, 1] };
  const r = diffGeoJSON(a, b, { normalize: true });
  t.equal(r.hasChanges, true);
  t.end();
});

test("diffGeoJSON normalize:true with MultiPolygon different sub-polygon order = unchanged", (t) => {
  const mp1 = {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
      [
        [
          [5, 5],
          [6, 5],
          [6, 6],
          [5, 6],
          [5, 5],
        ],
      ],
    ],
  };
  const mp2 = {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [5, 5],
          [6, 5],
          [6, 6],
          [5, 6],
          [5, 5],
        ],
      ],
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    ],
  };
  const r = diffGeoJSON(mp1, mp2, { normalize: true });
  t.equal(r.hasChanges, false);
  t.end();
});
