import test from "tape";
import { lintPosition } from "./position.ts";
import { createContext } from "./builder.ts";
import { find } from "./test/helpers.ts";
import type { LintResultGroup } from "./types.ts";


test("lintPosition", (t) => {
  t.test("schema", (t) => {
    t.test("valid 2-element position passes", (t) => {
      t.ok(lintPosition([0, 0], createContext(), []).passed);
      t.end();
    });

    t.test("valid 3-element position passes", (t) => {
      t.ok(lintPosition([0, 0, 100], createContext(), []).passed);
      t.end();
    });

    t.test("not array", (t) => {
      const g = lintPosition("string", createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "position-is-array")!.passed);
      t.end();
    });

    t.test("missing (undefined)", (t) => {
      const g = lintPosition(undefined, createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "position-is-array")!.passed);
      t.end();
    });

    t.test("too short (empty)", (t) => {
      const g = lintPosition([], createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "position-min-length")!.passed);
      t.end();
    });

    t.test("too short (1 element)", (t) => {
      const g = lintPosition([0], createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "position-min-length")!.passed);
      t.end();
    });

    t.test("too long (4 elements)", (t) => {
      const g = lintPosition([0, 0, 0, 0], createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "position-max-length")!.passed);
      t.end();
    });

    t.test("non-number element", (t) => {
      const g = lintPosition([0, "a"], createContext(), []);
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
