import test from "tape";
import { lintMultiPoint } from "./point.ts";
import { createContext } from "./builder.ts";
import { find } from "./test/helpers.ts";
import type { LintResultGroup } from "./types.ts";

const ctx = createContext();

test("lintMultiPoint", (t) => {
  t.test("schema", (t) => {
    t.test("valid multipoint passes", (t) => {
      const g = lintMultiPoint(
        [
          [0, 0],
          [1, 1],
        ],
        ctx,
        [],
      );
      t.ok(g.passed);
      t.end();
    });

    t.test("not an array", (t) => {
      const g = lintMultiPoint({}, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("missing (undefined)", (t) => {
      const g = lintMultiPoint(undefined, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "coordinates-is-array")!.passed);
      t.end();
    });

    t.test("bad position element", (t) => {
      const g = lintMultiPoint([[0, "a"]], ctx, []);
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
