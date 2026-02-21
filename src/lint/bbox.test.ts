import test from "tape";
import { lintBbox } from "./bbox.ts";
import { withScope } from "./builder.ts";
import { ctx, find } from "./test/helpers.ts";
import type { LintResult } from "./types.ts";
import { Severity } from "./types.ts";

test("lintBbox", (t) => {
  t.test("schema", (t) => {
    t.test("absent bbox returns undefined", (t) => {
      t.equal(lintBbox(undefined, ctx(), []), undefined);
      t.end();
    });

    t.test("valid 4-element bbox passes", (t) => {
      t.ok(lintBbox([0, 0, 1, 1], ctx(), [])!.passed);
      t.end();
    });

    t.test("valid 6-element bbox passes", (t) => {
      t.ok(lintBbox([0, 0, 0, 1, 1, 1], ctx(), [])!.passed);
      t.end();
    });

    t.test("not array", (t) => {
      const g = lintBbox("string", ctx(), [])!;
      t.notOk(g.passed);
      t.equal(find(g, "bbox-is-array")!.severity, Severity.Error);
      t.end();
    });

    t.test("wrong length (3)", (t) => {
      const g = lintBbox([0, 0, 1], ctx(), [])!;
      t.notOk(g.passed);
      t.equal(find(g, "bbox-length")!.severity, Severity.Error);
      t.end();
    });

    t.test("wrong length (5)", (t) => {
      const g = lintBbox([0, 0, 1, 1, 1], ctx(), [])!;
      t.notOk(g.passed);
      t.equal(find(g, "bbox-length")!.severity, Severity.Error);
      t.end();
    });

    t.test("non-number element", (t) => {
      const g = lintBbox([0, "a", 1, 1], ctx(), [])!;
      t.notOk(g.passed);
      t.equal(find(g, "bbox-elements")!.severity, Severity.Error);
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
      const g = lintBbox([0, 0, 1, 1], withScope(ctx(), { parent }), [])!;
      t.equal(find(g, "bbox-dimensionality")!.severity, Severity.Ok);
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
      const g = lintBbox([0, 0, 0, 1, 1, 1], withScope(ctx(), { parent }), [])!;
      t.equal(find(g, "bbox-dimensionality")!.severity, Severity.Error);
      t.end();
    });

    t.test("Feature with 2D Point and 4-element bbox passes", (t) => {
      const parent = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: {},
      };
      const g = lintBbox([0, 0, 0, 0], withScope(ctx(), { parent }), [])!;
      t.equal(find(g, "bbox-dimensionality")!.severity, Severity.Ok);
      t.end();
    });

    t.test("invalid parent skips dimensionality", (t) => {
      const g = lintBbox(
        [0, 0, 1, 1],
        withScope(ctx(), { parent: "not an object" }),
        [],
      )!;
      t.equal(find(g, "bbox-dimensionality")!.severity, Severity.Skip);
      t.end();
    });

    t.test("Point without coordinates skips dimensionality", (t) => {
      const g = lintBbox(
        [0, 0, 1, 1],
        withScope(ctx(), { parent: { type: "Point" } }),
        [],
      )!;
      t.equal(find(g, "bbox-dimensionality")!.severity, Severity.Skip);
      t.end();
    });

    t.test("Feature with null geometry passes dimensionality", (t) => {
      const g = lintBbox(
        [0, 0, 1, 1],
        withScope(ctx(), {
          parent: { type: "Feature", geometry: null, properties: {} },
        }),
        [],
      )!;
      t.equal(find(g, "bbox-dimensionality")!.severity, Severity.Ok);
      t.end();
    });

    t.end();
  });

  t.test("geometry", (t) => {
    t.test("valid bbox passes all geometry lints", (t) => {
      const g = lintBbox([-10, -10, 10, 10], ctx(), [])!;
      t.ok(g.passed);
      t.end();
    });

    t.test("west longitude out of range fails", (t) => {
      const g = lintBbox([-181, 0, 10, 10], ctx(), [])!;
      t.notOk(g.passed);
      t.equal(find(g, "bbox-longitude-range")!.severity, Severity.Error);
      t.end();
    });

    t.test("east longitude out of range fails", (t) => {
      const g = lintBbox([0, 0, 181, 10], ctx(), [])!;
      t.notOk(g.passed);
      t.equal(find(g, "bbox-longitude-range")!.severity, Severity.Error);
      t.end();
    });

    t.test("south latitude out of range fails", (t) => {
      const g = lintBbox([0, -91, 10, 10], ctx(), [])!;
      t.notOk(g.passed);
      t.equal(find(g, "bbox-latitude-range")!.severity, Severity.Error);
      t.end();
    });

    t.test("north latitude out of range fails", (t) => {
      const g = lintBbox([0, 0, 10, 91], ctx(), [])!;
      t.notOk(g.passed);
      t.equal(find(g, "bbox-latitude-range")!.severity, Severity.Error);
      t.end();
    });

    t.test("south > north fails bbox-latitude-order", (t) => {
      const g = lintBbox([0, 10, 10, 5], ctx(), [])!;
      t.notOk(g.passed);
      const r = find(g, "bbox-latitude-order") as LintResult;
      t.equal(r.severity, Severity.Error);
      t.ok(r.message!.includes("exceeds"), "has order message");
      t.end();
    });

    t.test("antimeridian crossing is informational", (t) => {
      const g = lintBbox([170, 0, -170, 1], ctx(), [])!;
      t.ok(g.passed);
      t.equal(find(g, "bbox-longitude-range")!.severity, Severity.Ok);
      t.equal(find(g, "bbox-latitude-range")!.severity, Severity.Ok);
      t.equal(find(g, "bbox-latitude-order")!.severity, Severity.Ok);
      const amR = find(g, "bbox-antimeridian") as LintResult;
      t.equal(amR.severity, Severity.Info);
      t.ok(amR.message!.includes("antimeridian"), "has antimeridian message");
      t.end();
    });

    t.test("no antimeridian crossing skips", (t) => {
      const g = lintBbox([-10, -10, 10, 10], ctx(), [])!;
      t.equal(find(g, "bbox-antimeridian")!.severity, Severity.Skip);
      t.end();
    });

    t.test("valid 6-element bbox passes", (t) => {
      const g = lintBbox([-10, -10, -100, 10, 10, 100], ctx(), [])!;
      t.equal(find(g, "bbox-longitude-range")!.severity, Severity.Ok);
      t.equal(find(g, "bbox-latitude-range")!.severity, Severity.Ok);
      t.end();
    });

    t.test("6-element bbox with out-of-range longitude fails", (t) => {
      const g = lintBbox([-181, -10, -100, 10, 10, 100], ctx(), [])!;
      t.notOk(g.passed);
      t.equal(find(g, "bbox-longitude-range")!.severity, Severity.Error);
      t.end();
    });

    t.test("schema failure skips geometry lints", (t) => {
      const g = lintBbox([0, "a", 1, 1], ctx(), [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-longitude-range"), "no bbox-longitude-range");
      t.notOk(find(g, "bbox-latitude-range"), "no bbox-latitude-range");
      t.notOk(find(g, "bbox-latitude-order"), "no bbox-latitude-order");
      t.end();
    });

    t.test("full polar cap [-180, 0, 180, 90] skips (canonical form)", (t) => {
      const g = lintBbox([-180, 0, 180, 90], ctx(), [])!;
      t.equal(find(g, "bbox-polar-cap")!.severity, Severity.Skip);
      t.end();
    });

    t.test("partial polar region [0, 0, 90, 90] skips", (t) => {
      const g = lintBbox([0, 0, 90, 90], ctx(), [])!;
      t.equal(find(g, "bbox-polar-cap")!.severity, Severity.Skip);
      t.end();
    });

    t.test("polar cap with non-canonical full span warns", (t) => {
      // west=0, east=360 spans 360 degrees but isn't -180/180
      const g = lintBbox([0, 0, 360, 90], ctx(), [])!;
      const r = find(g, "bbox-polar-cap") as LintResult;
      t.equal(r.severity, Severity.Warn);
      t.ok(r.message!.includes("west=-180"), "suggests canonical form");
      t.end();
    });

    t.test("non-polar bbox skips polar cap", (t) => {
      const g = lintBbox([-10, -10, 10, 10], ctx(), [])!;
      t.equal(find(g, "bbox-polar-cap")!.severity, Severity.Skip);
      t.end();
    });

    t.end();
  });

  t.end();
});
