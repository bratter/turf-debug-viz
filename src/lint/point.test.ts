import test from "tape";
import { lintPoint, lintMultiPoint } from "./point.ts";
import { resultGroup } from "./builder.ts";
import { find } from "./test/helpers.ts";
import type { LintResultGroup } from "./types.ts";

test("lintPoint", (t) => {
  t.test("schema", (t) => {
    t.test("valid point passes", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintPoint(g, { type: "Point", coordinates: [0, 0] });
      t.ok(g.build().passed);
      t.end();
    });

    t.test("missing coordinates", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintPoint(g, { type: "Point" });
      const result = g.build();
      t.notOk(result.passed);
      const pos = find(result, "position") as LintResultGroup;
      t.ok(pos, "has position sub-group");
      t.notOk(pos.passed);
      t.notOk(find(pos, "position-is-array")!.passed);
      t.end();
    });

    t.test("bad coordinates", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintPoint(g, { type: "Point", coordinates: "x" });
      const result = g.build();
      t.notOk(result.passed);
      const pos = find(result, "position") as LintResultGroup;
      t.ok(pos, "has position sub-group");
      t.notOk(pos.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});

test("lintMultiPoint", (t) => {
  t.test("schema", (t) => {
    t.test("valid multipoint passes", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintMultiPoint(g, {
        type: "MultiPoint",
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
      lintMultiPoint(g, { type: "MultiPoint" });
      const result = g.build();
      t.notOk(result.passed);
      t.notOk(find(result, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("coordinates not array", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintMultiPoint(g, { type: "MultiPoint", coordinates: {} });
      const result = g.build();
      t.notOk(result.passed);
      t.notOk(find(result, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("bad position element", (t) => {
      const g = resultGroup("Geometry", {}, []);
      lintMultiPoint(g, { type: "MultiPoint", coordinates: [[0, "a"]] });
      const result = g.build();
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
