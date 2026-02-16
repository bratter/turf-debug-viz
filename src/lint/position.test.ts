import test from "tape";
import { lintPosition } from "./position.ts";
import { find } from "./test/helpers.ts";
import type { LintResultGroup } from "./types.ts";

test("lintPosition", (t) => {
  t.test("schema", (t) => {
    t.test("valid 2-element position passes", (t) => {
      t.ok(lintPosition([0, 0]).passed);
      t.end();
    });

    t.test("valid 3-element position passes", (t) => {
      t.ok(lintPosition([0, 0, 100]).passed);
      t.end();
    });

    t.test("not array", (t) => {
      const g = lintPosition("string");
      t.notOk(g.passed);
      t.notOk(find(g, "position-is-array")!.passed);
      t.end();
    });

    t.test("missing (undefined)", (t) => {
      const g = lintPosition(undefined);
      t.notOk(g.passed);
      t.notOk(find(g, "position-is-array")!.passed);
      t.end();
    });

    t.test("too short (empty)", (t) => {
      const g = lintPosition([]);
      t.notOk(g.passed);
      t.notOk(find(g, "position-min-length")!.passed);
      t.end();
    });

    t.test("too short (1 element)", (t) => {
      const g = lintPosition([0]);
      t.notOk(g.passed);
      t.notOk(find(g, "position-min-length")!.passed);
      t.end();
    });

    t.test("too long (4 elements)", (t) => {
      const g = lintPosition([0, 0, 0, 0]);
      t.notOk(g.passed);
      t.notOk(find(g, "position-max-length")!.passed);
      t.end();
    });

    t.test("non-number element", (t) => {
      const g = lintPosition([0, "a"]);
      t.notOk(g.passed);
      const elements = find(g, "elements") as LintResultGroup;
      t.ok(elements, "has elements sub-group");
      const fail = elements.results.find(
        (r) => r.name === "position-element-number" && !r.passed,
      );
      t.ok(fail, "has failing element lint");
      t.end();
    });

    t.end();
  });

  t.end();
});
