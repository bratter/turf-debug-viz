import test from "tape";
import { lintBbox } from "./bbox.ts";
import { createContext, withScope } from "./builder.ts";
import { find } from "./test/helpers.ts";

const ctx = createContext();

test("lintBbox", (t) => {
  t.test("schema", (t) => {
    t.test("absent bbox returns undefined", (t) => {
      t.equal(lintBbox(undefined, ctx, []), undefined);
      t.end();
    });

    t.test("valid 4-element bbox passes", (t) => {
      t.ok(lintBbox([0, 0, 1, 1], ctx, [])!.passed);
      t.end();
    });

    t.test("valid 6-element bbox passes", (t) => {
      t.ok(lintBbox([0, 0, 0, 1, 1, 1], ctx, [])!.passed);
      t.end();
    });

    t.test("not array", (t) => {
      const g = lintBbox("string", ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-is-array")!.passed);
      t.end();
    });

    t.test("wrong length (3)", (t) => {
      const g = lintBbox([0, 0, 1], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-length")!.passed);
      t.end();
    });

    t.test("wrong length (5)", (t) => {
      const g = lintBbox([0, 0, 1, 1, 1], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-length")!.passed);
      t.end();
    });

    t.test("non-number element", (t) => {
      const g = lintBbox([0, "a", 1, 1], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-elements")!.passed);
      t.end();
    });

    t.end();
  });

  t.test("dimensionality", (t) => {
    t.test("2D LineString with 4-element bbox passes", (t) => {
      const parent = {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      };
      const g = lintBbox(
        [0, 0, 1, 1],
        withScope(createContext(), { parent }),
        [],
      )!;
      const r = find(g, "bbox-dimensionality");
      t.ok(!r || r.passed, "bbox-dimensionality passes");
      t.end();
    });

    t.test("2D LineString with 6-element bbox fails", (t) => {
      const parent = {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      };
      const g = lintBbox(
        [0, 0, 0, 1, 1, 1],
        withScope(createContext(), { parent }),
        [],
      )!;
      const r = find(g, "bbox-dimensionality");
      t.ok(r, "has bbox-dimensionality result");
      t.notOk(r!.passed, "bbox-dimensionality fails");
      t.end();
    });

    t.test("Feature with 2D Point and 4-element bbox passes", (t) => {
      const parent = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: {},
      };
      const g = lintBbox(
        [0, 0, 0, 0],
        withScope(createContext(), { parent }),
        [],
      )!;
      const r = find(g, "bbox-dimensionality");
      t.ok(!r || r.passed, "bbox-dimensionality passes");
      t.end();
    });

    t.test("invalid parent produces no dimensionality result", (t) => {
      const g = lintBbox(
        [0, 0, 1, 1],
        withScope(createContext(), { parent: "not an object" }),
        [],
      )!;
      const r = find(g, "bbox-dimensionality");
      t.notOk(r, "no bbox-dimensionality result when parent is invalid");
      t.end();
    });

    t.test("Point without coordinates skips dimensionality", (t) => {
      const g = lintBbox(
        [0, 0, 1, 1],
        withScope(createContext(), { parent: { type: "Point" } }),
        [],
      )!;
      const r = find(g, "bbox-dimensionality");
      t.notOk(r, "no bbox-dimensionality result when coordinates missing");
      t.end();
    });

    t.test("Feature with null geometry passes dimensionality", (t) => {
      const g = lintBbox(
        [0, 0, 1, 1],
        withScope(createContext(), {
          parent: { type: "Feature", geometry: null, properties: {} },
        }),
        [],
      )!;
      const r = find(g, "bbox-dimensionality");
      t.ok(r, "bbox-dimensionality passes when feature geometry is null");
      t.end();
    });

    t.end();
  });

  t.end();
});
