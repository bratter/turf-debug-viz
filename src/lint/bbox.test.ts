import test from "tape";
import { lintBbox } from "./bbox.ts";
import { createContext, withScope } from "./builder.ts";
import { find } from "./test/helpers.ts";
import type { LintResult } from "./types.ts";

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

  t.test("geometry", (t) => {
    t.test("valid bbox passes all geometry lints", (t) => {
      const g = lintBbox([-10, -10, 10, 10], ctx, [])!;
      t.ok(g.passed);
      t.end();
    });

    t.test("west longitude out of range fails", (t) => {
      const g = lintBbox([-181, 0, 10, 10], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-longitude-range")!.passed);
      t.end();
    });

    t.test("east longitude out of range fails", (t) => {
      const g = lintBbox([0, 0, 181, 10], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-longitude-range")!.passed);
      t.end();
    });

    t.test("south latitude out of range fails", (t) => {
      const g = lintBbox([0, -91, 10, 10], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-latitude-range")!.passed);
      t.end();
    });

    t.test("north latitude out of range fails", (t) => {
      const g = lintBbox([0, 0, 10, 91], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-latitude-range")!.passed);
      t.end();
    });

    t.test("south > north fails bbox-latitude-order", (t) => {
      const g = lintBbox([0, 10, 10, 5], ctx, [])!;
      t.notOk(g.passed);
      const r = find(g, "bbox-latitude-order") as LintResult;
      t.notOk(r.passed);
      t.ok(r.message!.includes("exceeds"), "has order message");
      t.end();
    });

    t.test("antimeridian crossing is informational", (t) => {
      const g = lintBbox([170, 0, -170, 1], ctx, [])!;
      // Range and order lints still pass
      const lngR = find(g, "bbox-longitude-range");
      t.ok(!lngR || lngR.passed, "longitude range passes");
      const latR = find(g, "bbox-latitude-range");
      t.ok(!latR || latR.passed, "latitude range passes");
      const orderR = find(g, "bbox-latitude-order");
      t.ok(!orderR || orderR.passed, "latitude order passes");
      // Antimeridian info present
      const amR = find(g, "bbox-antimeridian") as LintResult;
      t.ok(amR, "has bbox-antimeridian result");
      t.ok(amR.message!.includes("antimeridian"), "has antimeridian message");
      t.end();
    });

    t.test("valid 6-element bbox passes", (t) => {
      const g = lintBbox([-10, -10, -100, 10, 10, 100], ctx, [])!;
      const lngR = find(g, "bbox-longitude-range");
      t.ok(!lngR || lngR.passed, "longitude range passes");
      const latR = find(g, "bbox-latitude-range");
      t.ok(!latR || latR.passed, "latitude range passes");
      t.end();
    });

    t.test("6-element bbox with out-of-range longitude fails", (t) => {
      const g = lintBbox([-181, -10, -100, 10, 10, 100], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-longitude-range")!.passed);
      t.end();
    });

    t.test("schema failure skips geometry lints", (t) => {
      const g = lintBbox([0, "a", 1, 1], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-longitude-range"), "no bbox-longitude-range");
      t.notOk(find(g, "bbox-latitude-range"), "no bbox-latitude-range");
      t.notOk(find(g, "bbox-latitude-order"), "no bbox-latitude-order");
      t.end();
    });

    t.test("full polar cap [-180, 0, 180, 90] passes", (t) => {
      const g = lintBbox([-180, 0, 180, 90], ctx, [])!;
      const r = find(g, "bbox-polar-cap");
      t.ok(!r || r.passed, "bbox-polar-cap passes");
      t.end();
    });

    t.test("partial polar region [0, 0, 90, 90] passes", (t) => {
      const g = lintBbox([0, 0, 90, 90], ctx, [])!;
      const r = find(g, "bbox-polar-cap");
      t.ok(!r || r.passed, "bbox-polar-cap passes for partial region");
      t.end();
    });

    t.test("mixed polar cap [-180, 0, 90, 90] warns", (t) => {
      const g = lintBbox([-180, 0, 90, 90], ctx, [])!;
      const r = find(g, "bbox-polar-cap") as LintResult;
      t.ok(r, "has bbox-polar-cap result");
      t.notOk(r.passed, "bbox-polar-cap fails");
      t.ok(r.message!.includes("Polar cap"), "has polar cap message");
      t.end();
    });

    t.test("non-polar bbox passes polar cap", (t) => {
      const g = lintBbox([-10, -10, 10, 10], ctx, [])!;
      const r = find(g, "bbox-polar-cap");
      t.ok(!r || r.passed, "bbox-polar-cap passes for non-polar");
      t.end();
    });

    t.end();
  });

  t.end();
});
