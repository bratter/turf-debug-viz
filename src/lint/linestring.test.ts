import test from "tape";
import { lintLineString, lintMultiLineString } from "./linestring.ts";
import { resultGroup } from "./builder.ts";
import { find } from "./test/helpers.ts";
import type { LintResultGroup } from "./types.ts";

test("lintLineString", (t) => {
  t.test("schema", (t) => {
    t.test("valid linestring passes", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintLineString(g, {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      });
      t.ok(g.build().passed);
      t.end();
    });

    t.test("missing coordinates", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintLineString(g, { type: "LineString" });
      const result = g.build();
      t.notOk(result.passed);
      const line = find(result, "line") as LintResultGroup;
      t.ok(line, "has line sub-group");
      t.notOk(line.passed);
      t.notOk(find(line, "line-is-array")!.passed);
      t.end();
    });

    t.test("bad coordinates", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintLineString(g, { type: "LineString", coordinates: "x" });
      const result = g.build();
      t.notOk(result.passed);
      const line = find(result, "line") as LintResultGroup;
      t.ok(line, "has line sub-group");
      t.notOk(line.passed);
      t.end();
    });

    t.test("bad position element", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintLineString(g, {
        type: "LineString",
        coordinates: [[0, "a"]],
      });
      const result = g.build();
      t.notOk(result.passed);
      const line = find(result, "line") as LintResultGroup;
      t.ok(line, "has line sub-group");
      const positions = find(line, "positions") as LintResultGroup;
      t.ok(positions, "has positions sub-group");
      t.notOk(positions.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});

test("lintMultiLineString", (t) => {
  t.test("schema", (t) => {
    t.test("valid multilinestring passes", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintMultiLineString(g, {
        type: "MultiLineString",
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
          [
            [2, 2],
            [3, 3],
          ],
        ],
      });
      t.ok(g.build().passed);
      t.end();
    });

    t.test("missing coordinates", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintMultiLineString(g, { type: "MultiLineString" });
      const result = g.build();
      t.notOk(result.passed);
      t.notOk(find(result, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("coordinates not array", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintMultiLineString(g, { type: "MultiLineString", coordinates: {} });
      const result = g.build();
      t.notOk(result.passed);
      t.notOk(find(result, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("bad position element in line", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintMultiLineString(g, {
        type: "MultiLineString",
        coordinates: [[[0, "a"]]],
      });
      const result = g.build();
      t.notOk(result.passed);
      const lines = find(result, "lines") as LintResultGroup;
      t.ok(lines, "has lines sub-group");
      t.notOk(lines.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});
