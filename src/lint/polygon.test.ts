import test from "tape";
import { lintLinearRing, lintPolygon, lintMultiPolygon } from "./polygon.ts";
import { resultGroup } from "./builder.ts";
import { find } from "./test/helpers.ts";
import type { LintResultGroup } from "./types.ts";

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
        ["coordinates", 0],
      );
      t.ok(result.passed);
      t.end();
    });

    t.test("non-array fails", (t) => {
      const result = lintLinearRing("x", ["coordinates", 0]);
      t.notOk(result.passed);
      t.notOk(find(result, "ring-is-array")!.passed);
      t.end();
    });

    t.test("undefined fails", (t) => {
      const result = lintLinearRing(undefined, ["coordinates", 0]);
      t.notOk(result.passed);
      t.notOk(find(result, "ring-is-array")!.passed);
      t.end();
    });

    t.test("bad position element surfaces", (t) => {
      const result = lintLinearRing(
        [[0, "a"]],
        ["coordinates", 0],
      );
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
      const g = resultGroup("Geometry", []);
      lintPolygon(g, {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      });
      t.ok(g.build().passed);
      t.end();
    });

    t.test("missing coordinates", (t) => {
      const g = resultGroup("Geometry", []);
      lintPolygon(g, { type: "Polygon" });
      const result = g.build();
      t.notOk(result.passed);
      const polygon = find(result, "polygon") as LintResultGroup;
      t.ok(polygon, "has polygon sub-group");
      t.notOk(polygon.passed);
      t.notOk(find(polygon, "polygon-is-array")!.passed);
      t.end();
    });

    t.test("bad coordinates", (t) => {
      const g = resultGroup("Geometry", []);
      lintPolygon(g, { type: "Polygon", coordinates: "x" });
      const result = g.build();
      t.notOk(result.passed);
      const polygon = find(result, "polygon") as LintResultGroup;
      t.ok(polygon, "has polygon sub-group");
      t.notOk(polygon.passed);
      t.end();
    });

    t.test("bad position in ring surfaces", (t) => {
      const g = resultGroup("Geometry", []);
      lintPolygon(g, {
        type: "Polygon",
        coordinates: [[[0, "a"]]],
      });
      const result = g.build();
      t.notOk(result.passed);
      const polygon = find(result, "polygon") as LintResultGroup;
      t.ok(polygon, "has polygon sub-group");
      const rings = find(polygon, "rings") as LintResultGroup;
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
      const g = resultGroup("Geometry", []);
      lintMultiPolygon(g, {
        type: "MultiPolygon",
        coordinates: [
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
      });
      t.ok(g.build().passed);
      t.end();
    });

    t.test("missing coordinates", (t) => {
      const g = resultGroup("Geometry", []);
      lintMultiPolygon(g, { type: "MultiPolygon" });
      const result = g.build();
      t.notOk(result.passed);
      t.notOk(find(result, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("coordinates not array", (t) => {
      const g = resultGroup("Geometry", []);
      lintMultiPolygon(g, { type: "MultiPolygon", coordinates: {} });
      const result = g.build();
      t.notOk(result.passed);
      t.notOk(find(result, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("bad position in nested polygon surfaces", (t) => {
      const g = resultGroup("Geometry", []);
      lintMultiPolygon(g, {
        type: "MultiPolygon",
        coordinates: [[[[0, "a"]]]],
      });
      const result = g.build();
      t.notOk(result.passed);
      const polygons = find(result, "polygons") as LintResultGroup;
      t.ok(polygons, "has polygons sub-group");
      t.notOk(polygons.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});
