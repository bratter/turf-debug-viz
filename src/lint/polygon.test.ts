import test from "tape";
import { lintLinearRing, lintPolygon, lintMultiPolygon } from "./polygon.ts";
import { createContext } from "./builder.ts";
import { find } from "./test/helpers.ts";
import type { LintResult, LintResultGroup } from "./types.ts";

const ctx = createContext();

test("lintLinearRing", (t) => {
  t.test("schema", (t) => {
    t.test("valid ring passes", (t) => {
      const result = lintLinearRing(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
        ctx,
        ["coordinates", 0],
      );
      t.ok(result.passed);
      t.end();
    });

    t.test("non-array fails", (t) => {
      const result = lintLinearRing("x", ctx, ["coordinates", 0]);
      t.notOk(result.passed);
      t.notOk(find(result, "ring-is-array")!.passed);
      t.end();
    });

    t.test("undefined fails", (t) => {
      const result = lintLinearRing(undefined, ctx, ["coordinates", 0]);
      t.notOk(result.passed);
      t.notOk(find(result, "ring-is-array")!.passed);
      t.end();
    });

    t.test("bad position element surfaces", (t) => {
      const result = lintLinearRing([[0, "a"]], ctx, ["coordinates", 0]);
      t.notOk(result.passed);
      const positions = find(result, "positions") as LintResultGroup;
      t.ok(positions, "has positions sub-group");
      t.notOk(positions.passed);
      t.end();
    });

    t.end();
  });

  t.test("geometry", (t) => {
    t.test("3 positions fails ring-min-length", (t) => {
      const result = lintLinearRing(
        [
          [0, 0],
          [1, 0],
          [0, 0],
        ],
        createContext(),
        ["coordinates", 0],
      );
      t.notOk(result.passed);
      t.notOk(find(result, "ring-min-length")!.passed);
      t.end();
    });

    t.test("unclosed ring fails ring-closed", (t) => {
      const result = lintLinearRing(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        createContext(),
        ["coordinates", 0],
      );
      t.notOk(result.passed);
      const r = find(result, "ring-closed") as LintResult;
      t.notOk(r.passed);
      t.ok(r.message, "has failure message");
      t.end();
    });

    t.test("2D closed ring passes ring-closed", (t) => {
      const result = lintLinearRing(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
        createContext(),
        ["coordinates", 0],
      );
      const r = find(result, "ring-closed");
      t.ok(!r || r.passed, "ring-closed passes for 2D ring");
      t.end();
    });

    t.test("3D closed ring passes", (t) => {
      const result = lintLinearRing(
        [
          [0, 0, 10],
          [1, 0, 10],
          [1, 1, 10],
          [0, 0, 10],
        ],
        createContext(),
        ["coordinates", 0],
      );
      const r = find(result, "ring-closed");
      t.ok(!r || r.passed, "ring-closed passes for 3D ring");
      t.end();
    });

    t.test("3D ring closed in 2D but not 3D fails", (t) => {
      const result = lintLinearRing(
        [
          [0, 0, 10],
          [1, 0, 10],
          [1, 1, 10],
          [0, 0, 20],
        ],
        createContext(),
        ["coordinates", 0],
      );
      t.notOk(result.passed);
      const r = find(result, "ring-closed") as LintResult;
      t.notOk(r.passed);
      t.end();
    });

    t.test("CCW exterior ring (index 0) passes", (t) => {
      // CCW: 0,0 → 1,0 → 1,1 → 0,0
      const result = lintLinearRing(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
        createContext(),
        ["coordinates", 0],
      );
      const r = find(result, "ring-winding-exterior");
      t.ok(!r || r.passed, "ring-winding-exterior passes for CCW ring");
      t.end();
    });

    t.test("CW exterior ring (index 0) fails", (t) => {
      // CW: 0,0 → 1,1 → 1,0 → 0,0
      const result = lintLinearRing(
        [
          [0, 0],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
        createContext(),
        ["coordinates", 0],
      );
      t.notOk(result.passed);
      const r = find(result, "ring-winding-exterior") as LintResult;
      t.notOk(r.passed);
      t.equal(r.message, "Expected counterclockwise winding, got clockwise");
      t.end();
    });

    t.test("CW hole (index 1) passes", (t) => {
      // CW: 0,0 → 1,1 → 1,0 → 0,0
      const result = lintLinearRing(
        [
          [0, 0],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
        createContext(),
        ["coordinates", 1],
      );
      const r = find(result, "ring-winding-interior");
      t.ok(!r || r.passed, "ring-winding-interior passes for CW hole");
      t.end();
    });

    t.test("CCW hole (index 1) fails", (t) => {
      // CCW: 0,0 → 1,0 → 1,1 → 0,0
      const result = lintLinearRing(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
        createContext(),
        ["coordinates", 1],
      );
      t.notOk(result.passed);
      const r = find(result, "ring-winding-interior") as LintResult;
      t.notOk(r.passed);
      t.equal(r.message, "Expected clockwise winding, got counterclockwise");
      t.end();
    });

    t.end();
  });

  t.end();
});

test("lintPolygon", (t) => {
  t.test("schema", (t) => {
    t.test("valid polygon passes", (t) => {
      const g = lintPolygon(
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
        createContext(),
        [],
      );
      t.ok(g.passed);
      t.end();
    });

    t.test("not an array", (t) => {
      const g = lintPolygon("x", createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "polygon-is-array")!.passed);
      t.end();
    });

    t.test("missing (undefined)", (t) => {
      const g = lintPolygon(undefined, createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "polygon-is-array")!.passed);
      t.end();
    });

    t.test("bad position in ring surfaces", (t) => {
      const g = lintPolygon([[[0, "a"]]], createContext(), []);
      t.notOk(g.passed);
      const rings = find(g, "rings") as LintResultGroup;
      t.ok(rings, "has rings sub-group");
      t.notOk(rings.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});

test("lintMultiPolygon", (t) => {
  t.test("schema", (t) => {
    t.test("valid multipolygon passes", (t) => {
      const g = lintMultiPolygon(
        [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
          [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 2],
            ],
          ],
        ],
        ctx,
        [],
      );
      t.ok(g.passed);
      t.end();
    });

    t.test("not an array", (t) => {
      const g = lintMultiPolygon({}, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("missing (undefined)", (t) => {
      const g = lintMultiPolygon(undefined, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("bad position in nested polygon surfaces", (t) => {
      const g = lintMultiPolygon([[[[0, "a"]]]], ctx, []);
      t.notOk(g.passed);
      const polygons = find(g, "polygons") as LintResultGroup;
      t.ok(polygons, "has polygons sub-group");
      t.notOk(polygons.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});
