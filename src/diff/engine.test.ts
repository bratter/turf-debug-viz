import test from "tape";
import { buildDiffMap, diffGeoJSON } from "./engine.ts";
import type { DiffGroup } from "./types.ts";

// ========================================
// Fixtures
// ========================================

const point = { type: "Point", coordinates: [0, 0] };
const point2 = { type: "Point", coordinates: [1, 2] };

const featureA = {
  type: "Feature",
  properties: { name: "Alice" },
  geometry: point,
};

const featureB = {
  type: "Feature",
  properties: { name: "Bob" },
  geometry: point,
};

const fc = {
  type: "FeatureCollection",
  features: [featureA],
};

// ========================================
// Helpers
// ========================================

/** Finds first child of root with matching key (last path segment). */
function childAt(root: DiffGroup, key: string | number) {
  return root.children.find((c) => c.path[c.path.length - 1] === key);
}

// ========================================
// Tests
// ========================================

test("diffGeoJSON", (t) => {
  t.test("identical objects → all unchanged, hasChanges false", (t) => {
    const r = diffGeoJSON(featureA, featureA);
    t.equal(r.hasChanges, false);
    t.equal(r.root.status, "unchanged");
    t.end();
  });

  t.test("identical primitives in properties → unchanged", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", properties: { x: 1 }, geometry: null },
      { type: "Feature", properties: { x: 1 }, geometry: null },
    );
    t.equal(r.hasChanges, false);
    t.end();
  });

  t.test("changed property value → hasChanges true, root changed", (t) => {
    const r = diffGeoJSON(featureA, featureB);
    t.equal(r.hasChanges, true);
    t.equal(r.root.status, "changed");

    const propsGroup = childAt(r.root, "properties") as DiffGroup;
    t.ok(propsGroup, "has properties child");
    t.equal(propsGroup.kind, "group");
    t.equal(propsGroup.status, "changed");

    const nameLeaf = childAt(propsGroup, "name");
    t.ok(nameLeaf);
    t.equal(nameLeaf!.status, "changed");
    t.end();
  });

  t.test("different type field → root changed", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", properties: {}, geometry: null },
      { type: "FeatureCollection", features: [] },
    );
    t.equal(r.root.status, "changed");
    t.end();
  });

  t.test("added key → status added, hasChanges true", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", properties: {}, geometry: null },
      { type: "Feature", properties: {}, geometry: null, id: 42 },
    );
    t.equal(r.hasChanges, true);
    const idNode = childAt(r.root, "id");
    t.ok(idNode);
    t.equal(idNode!.status, "added");
    t.equal(idNode!.kind, "leaf");
    t.equal((idNode as any).from, undefined);
    t.equal((idNode as any).to, 42);
    t.end();
  });

  t.test("removed key → status removed, hasChanges true", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", properties: {}, geometry: null, id: 42 },
      { type: "Feature", properties: {}, geometry: null },
    );
    t.equal(r.hasChanges, true);
    const idNode = childAt(r.root, "id");
    t.ok(idNode);
    t.equal(idNode!.status, "removed");
    t.equal((idNode as any).from, 42);
    t.equal((idNode as any).to, undefined);
    t.end();
  });

  t.test("type mismatch (primitive vs object) → changed leaf", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", properties: { x: 1 }, geometry: null },
      { type: "Feature", properties: { x: { nested: true } }, geometry: null },
    );
    t.equal(r.hasChanges, true);
    const propsGroup = childAt(r.root, "properties") as DiffGroup;
    const xNode = childAt(propsGroup, "x");
    t.ok(xNode);
    t.equal(xNode!.status, "changed");
    t.equal(xNode!.kind, "leaf");
    t.end();
  });

  t.test("top-level type mismatch (two primitives) → changed", (t) => {
    const r = diffGeoJSON("foo", "bar");
    t.equal(r.hasChanges, true);
    t.equal(r.root.status, "changed");
    t.end();
  });

  t.test("array element changed → group changed", (t) => {
    const r = diffGeoJSON(point, point2);
    t.equal(r.hasChanges, true);
    const coordsGroup = childAt(r.root, "coordinates") as DiffGroup;
    t.equal(coordsGroup.status, "changed");
    t.equal(coordsGroup.children[0]?.status, "changed");
    t.end();
  });

  t.test("array element added (longer to) → added status", (t) => {
    const r = diffGeoJSON(
      { type: "Point", coordinates: [0, 0] },
      { type: "Point", coordinates: [0, 0, 100] },
    );
    t.equal(r.hasChanges, true);
    const coordsGroup = childAt(r.root, "coordinates") as DiffGroup;
    t.equal(coordsGroup.children[2]?.status, "added");
    t.end();
  });

  t.test("array element removed (shorter to) → removed status", (t) => {
    const r = diffGeoJSON(
      { type: "Point", coordinates: [0, 0, 100] },
      { type: "Point", coordinates: [0, 0] },
    );
    t.equal(r.hasChanges, true);
    const coordsGroup = childAt(r.root, "coordinates") as DiffGroup;
    t.equal(coordsGroup.children[2]?.status, "removed");
    t.end();
  });

  t.test("status aggregation: added beats removed", (t) => {
    // One key removed, one key added → group status = "added"
    const r = diffGeoJSON(
      { type: "Feature", properties: { a: 1 }, geometry: null },
      { type: "Feature", properties: { b: 2 }, geometry: null },
    );
    const propsGroup = childAt(r.root, "properties") as DiffGroup;
    t.equal(propsGroup.status, "added");
    t.end();
  });

  t.test("status aggregation: changed beats added", (t) => {
    // One key removed (→ removed), type changed (→ changed) → group status = "changed"
    const r = diffGeoJSON(
      { type: "Feature", properties: { x: 1 }, geometry: null, id: 1 },
      { type: "FeatureCollection", features: [] },
    );
    t.equal(r.root.status, "changed");
    t.end();
  });

  t.test("null geometry → unchanged when both null", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", properties: {}, geometry: null },
      { type: "Feature", properties: {}, geometry: null },
    );
    const geomNode = childAt(r.root, "geometry");
    t.ok(geomNode);
    t.equal(geomNode!.status, "unchanged");
    t.end();
  });

  t.end();
});

test("key ordering", (t) => {
  t.test("Feature keys in canonical order", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", properties: {}, geometry: null, id: 1 },
      { type: "Feature", properties: {}, geometry: null, id: 1 },
    );
    const paths = r.root.children.map((c) => c.path[c.path.length - 1]);
    t.deepEqual(paths, ["type", "id", "properties", "geometry"]);
    t.end();
  });

  t.test("Feature includes bbox when present, in canonical position", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", bbox: [0, 0, 1, 1], properties: {}, geometry: null },
      { type: "Feature", bbox: [0, 0, 1, 1], properties: {}, geometry: null },
    );
    const paths = r.root.children.map((c) => c.path[c.path.length - 1]);
    t.deepEqual(paths, ["type", "bbox", "properties", "geometry"]);
    t.end();
  });

  t.test("Feature foreign keys sorted alphabetically after canonical", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", properties: {}, geometry: null, zzz: 1, aaa: 2 },
      { type: "Feature", properties: {}, geometry: null, zzz: 1, aaa: 2 },
    );
    const paths = r.root.children.map((c) => c.path[c.path.length - 1]);
    t.deepEqual(paths, ["type", "properties", "geometry", "aaa", "zzz"]);
    t.end();
  });

  t.test("FeatureCollection keys in canonical order", (t) => {
    const r = diffGeoJSON(fc, fc);
    const paths = r.root.children.map((c) => c.path[c.path.length - 1]);
    t.deepEqual(paths, ["type", "features"]);
    t.end();
  });

  t.test("Geometry keys in canonical order", (t) => {
    const r = diffGeoJSON(point, point);
    const paths = r.root.children.map((c) => c.path[c.path.length - 1]);
    t.deepEqual(paths, ["type", "coordinates"]);
    t.end();
  });

  t.test("GeometryCollection uses geometries not coordinates", (t) => {
    const gc = { type: "GeometryCollection", geometries: [point] };
    const r = diffGeoJSON(gc, gc);
    const paths = r.root.children.map((c) => c.path[c.path.length - 1]);
    t.deepEqual(paths, ["type", "geometries"]);
    t.end();
  });

  t.test("unknown object keys sorted alphabetically", (t) => {
    const r = diffGeoJSON({ z: 1, a: 2, m: 3 }, { z: 1, a: 2, m: 3 });
    const paths = r.root.children.map((c) => c.path[c.path.length - 1]);
    t.deepEqual(paths, ["a", "m", "z"]);
    t.end();
  });

  t.test("properties object keys sorted alphabetically", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", properties: { z: 1, a: 2 }, geometry: null },
      { type: "Feature", properties: { z: 1, a: 2 }, geometry: null },
    );
    const propsGroup = childAt(r.root, "properties") as DiffGroup;
    const paths = propsGroup.children.map((c) => c.path[c.path.length - 1]);
    t.deepEqual(paths, ["a", "z"]);
    t.end();
  });

  t.test(
    "key present only in from appears in ordered output (removed)",
    (t) => {
      const r = diffGeoJSON(
        { type: "Feature", properties: {}, geometry: null, id: 1 },
        { type: "Feature", properties: {}, geometry: null },
      );
      const paths = r.root.children.map((c) => c.path[c.path.length - 1]);
      // id comes after type in Feature canonical order
      t.ok(
        paths.indexOf("id") < paths.indexOf("properties"),
        "id before properties",
      );
      t.end();
    },
  );

  t.end();
});

test("buildDiffMap", (t) => {
  t.test("includes root path", (t) => {
    const r = diffGeoJSON(featureA, featureA);
    const m = buildDiffMap(r);
    t.ok(m.has(JSON.stringify([])), "has root []");
    t.equal(m.get(JSON.stringify([])), "unchanged");
    t.end();
  });

  t.test("includes leaf paths with correct status", (t) => {
    const r = diffGeoJSON(featureA, featureB);
    const m = buildDiffMap(r);
    t.equal(m.get(JSON.stringify(["properties", "name"])), "changed");
    t.end();
  });

  t.test("includes group paths", (t) => {
    const r = diffGeoJSON(featureA, featureB);
    const m = buildDiffMap(r);
    t.equal(m.get(JSON.stringify(["properties"])), "changed");
    t.end();
  });

  t.test("unchanged nodes included in map", (t) => {
    const r = diffGeoJSON(featureA, featureB);
    const m = buildDiffMap(r);
    t.equal(m.get(JSON.stringify(["type"])), "unchanged");
    t.end();
  });

  t.test("added key appears in map", (t) => {
    const r = diffGeoJSON(
      { type: "Feature", properties: {}, geometry: null },
      { type: "Feature", properties: {}, geometry: null, id: 99 },
    );
    const m = buildDiffMap(r);
    t.equal(m.get(JSON.stringify(["id"])), "added");
    t.end();
  });

  t.end();
});
