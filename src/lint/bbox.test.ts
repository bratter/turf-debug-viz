import test from "tape";
import { lintBbox } from "./bbox.ts";
import { find } from "./test/helpers.ts";
import type { LintResultGroup } from "./types.ts";

test("lintBbox", (t) => {
  t.test("schema", (t) => {
    t.test("absent bbox returns undefined", (t) => {
      t.equal(lintBbox(undefined), undefined);
      t.end();
    });

    t.test("valid 4-element bbox passes", (t) => {
      t.ok(lintBbox([0, 0, 1, 1])!.passed);
      t.end();
    });

    t.test("valid 6-element bbox passes", (t) => {
      t.ok(lintBbox([0, 0, 0, 1, 1, 1])!.passed);
      t.end();
    });

    t.test("not array", (t) => {
      const g = lintBbox("string")!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-is-array")!.passed);
      t.end();
    });

    t.test("wrong length (3)", (t) => {
      const g = lintBbox([0, 0, 1])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-length")!.passed);
      t.end();
    });

    t.test("wrong length (5)", (t) => {
      const g = lintBbox([0, 0, 1, 1, 1])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-length")!.passed);
      t.end();
    });

    t.test("non-number element", (t) => {
      const g = lintBbox([0, "a", 1, 1])!;
      t.notOk(g.passed);
      const elements = find(g, "elements") as LintResultGroup;
      t.ok(elements, "has elements sub-group");
      const fail = elements.results.find(
        (r) => r.name === "bbox-element-number" && !r.passed,
      );
      t.ok(fail, "has failing element lint");
      t.end();
    });

    t.end();
  });

  t.end();
});
