import test from "tape";
import { lintLineString, lintMultiLineString } from "./linestring.ts";
import { createContext } from "./builder.ts";
import { find } from "./test/helpers.ts";
import type { LintResultGroup } from "./types.ts";

const ctx = createContext();

test("lintLineString", (t) => {
  t.test("schema", (t) => {
    t.test("valid linestring passes", (t) => {
      const g = lintLineString(
        [
          [0, 0],
          [1, 1],
        ],
        createContext(),
        [],
      );
      t.ok(g.passed);
      t.end();
    });

    t.test("not an array", (t) => {
      const g = lintLineString("x", createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "line-is-array")!.passed);
      t.end();
    });

    t.test("missing (undefined)", (t) => {
      const g = lintLineString(undefined, createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "line-is-array")!.passed);
      t.end();
    });

    t.test("bad position element", (t) => {
      const g = lintLineString([[0, "a"]], createContext(), []);
      t.notOk(g.passed);
      const positions = find(g, "positions") as LintResultGroup;
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
        ctx,
        [],
      );
      t.ok(g.passed);
      t.end();
    });

    t.test("not an array", (t) => {
      const g = lintMultiLineString({}, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("missing (undefined)", (t) => {
      const g = lintMultiLineString(undefined, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("bad position element in line", (t) => {
      const g = lintMultiLineString([[[0, "a"]]], ctx, []);
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
