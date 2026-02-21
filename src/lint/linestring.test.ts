import test from "tape";
import { lintLineString, lintMultiLineString } from "./linestring.ts";
import { ctx, find } from "./test/helpers.ts";
import type { LintResult, LintResultGroup } from "./types.ts";
import { Severity } from "./types.ts";

test("lintLineString", (t) => {
  t.test("schema", (t) => {
    t.test("valid linestring passes", (t) => {
      const g = lintLineString(
        [
          [0, 0],
          [1, 1],
        ],
        ctx(),
        [],
      );
      t.ok(g.passed);
      t.end();
    });

    t.test("not an array", (t) => {
      const g = lintLineString("x", ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "line-is-array")!.severity, Severity.Error);
      t.end();
    });

    t.test("missing (undefined)", (t) => {
      const g = lintLineString(undefined, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "line-is-array")!.severity, Severity.Error);
      t.end();
    });

    t.test("bad position element", (t) => {
      const g = lintLineString([[0, "a"]], ctx(), []);
      t.notOk(g.passed);
      const positions = find(g, "positions") as LintResultGroup;
      t.ok(positions, "has positions sub-group");
      t.notOk(positions.passed);
      t.end();
    });

    t.end();
  });

  t.test("geometry", (t) => {
    t.test("empty array fails line-min-length", (t) => {
      const g = lintLineString([], ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "line-min-length")!.severity, Severity.Error);
      t.end();
    });

    t.test("single position fails line-min-length", (t) => {
      const g = lintLineString([[0, 0]], ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "line-min-length")!.severity, Severity.Error);
      t.end();
    });

    t.test("two positions passes line-min-length", (t) => {
      const g = lintLineString(
        [
          [0, 0],
          [1, 1],
        ],
        ctx(),
        [],
      );
      t.ok(g.passed);
      t.equal(find(g, "line-min-length")!.severity, Severity.Ok);
      t.end();
    });

    t.test("no duplicate positions passes", (t) => {
      const g = lintLineString(
        [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
        ctx(),
        [],
      );
      t.equal(find(g, "duplicate-positions")!.severity, Severity.Ok);
      t.end();
    });

    t.test("adjacent duplicate positions warns with data", (t) => {
      const g = lintLineString(
        [
          [0, 0],
          [1, 1],
          [1, 1],
          [2, 2],
        ],
        ctx(),
        [],
      );
      const r = find(g, "duplicate-positions") as LintResult;
      t.equal(r.severity, Severity.Warn);
      t.deepEqual(r.data, [2]);
      t.end();
    });

    t.test("3D duplicate positions detected", (t) => {
      const g = lintLineString(
        [
          [0, 0, 10],
          [0, 0, 10],
          [1, 1, 20],
        ],
        ctx(),
        [],
      );
      const r = find(g, "duplicate-positions") as LintResult;
      t.equal(r.severity, Severity.Warn);
      t.deepEqual(r.data, [1]);
      t.end();
    });

    t.test("non-consecutive same positions ok", (t) => {
      const g = lintLineString(
        [
          [0, 0],
          [1, 1],
          [0, 0],
        ],
        ctx(),
        [],
      );
      t.equal(find(g, "duplicate-positions")!.severity, Severity.Ok);
      t.end();
    });

    t.test("multiple consecutive duplicates", (t) => {
      const g = lintLineString(
        [
          [0, 0],
          [0, 0],
          [1, 1],
          [1, 1],
        ],
        ctx(),
        [],
      );
      const r = find(g, "duplicate-positions") as LintResult;
      t.equal(r.severity, Severity.Warn);
      t.deepEqual(r.data, [1, 3]);
      t.end();
    });

    t.test("line-degenerate: all identical positions warns", (t) => {
      const g = lintLineString(
        [
          [5, 5],
          [5, 5],
        ],
        ctx(),
        [],
      );
      t.equal(find(g, "line-degenerate")!.severity, Severity.Warn);
      t.end();
    });

    t.test("line-degenerate: within-epsilon warns", (t) => {
      const g = lintLineString(
        [
          [5, 5],
          [5 + 1e-16, 5 + 1e-16],
        ],
        ctx(),
        [],
      );
      t.equal(find(g, "line-degenerate")!.severity, Severity.Warn);
      t.end();
    });

    t.test("line-degenerate: normal line passes", (t) => {
      const g = lintLineString(
        [
          [0, 0],
          [1, 1],
        ],
        ctx(),
        [],
      );
      t.equal(find(g, "line-degenerate")!.severity, Severity.Ok);
      t.end();
    });

    t.end();
  });

  t.end();
});

test("lintMultiLineString", (t) => {
  t.test("schema", (t) => {
    t.test("valid multilinestring passes", (t) => {
      const g = lintMultiLineString(
        [
          [
            [0, 0],
            [1, 1],
          ],
          [
            [2, 2],
            [3, 3],
          ],
        ],
        ctx(),
        [],
      );
      t.ok(g.passed);
      t.end();
    });

    t.test("not an array", (t) => {
      const g = lintMultiLineString({}, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "coordinates-is-array")!.severity, Severity.Error);
      t.end();
    });

    t.test("missing (undefined)", (t) => {
      const g = lintMultiLineString(undefined, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "coordinates-is-array")!.severity, Severity.Error);
      t.end();
    });

    t.test("bad position element in line", (t) => {
      const g = lintMultiLineString([[[0, "a"]]], ctx(), []);
      t.notOk(g.passed);
      const lines = find(g, "lines") as LintResultGroup;
      t.ok(lines, "has lines sub-group");
      t.notOk(lines.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});
