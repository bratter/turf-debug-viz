import test from "tape";
import { lintLinearRing, lintPolygon, lintMultiPolygon } from "./polygon.ts";
import { createContext } from "./builder.ts";
import { find } from "./test/helpers.ts";
import type { LintResultGroup } from "./types.ts";

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
