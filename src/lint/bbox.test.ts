import test from "tape";
import { lintBbox } from "./bbox.ts";
import { createContext } from "./builder.ts";
import { find } from "./test/helpers.ts";

const ctx = createContext();

test("lintBbox", (t) => {
  t.test("schema", (t) => {
    t.test("absent bbox returns undefined", (t) => {
      t.equal(lintBbox(undefined, ctx, []), undefined);
      t.end();
    });

    t.test("valid 4-element bbox passes", (t) => {
      t.ok(lintBbox([0, 0, 1, 1], ctx, [])!.passed);
      t.end();
    });

    t.test("valid 6-element bbox passes", (t) => {
      t.ok(lintBbox([0, 0, 0, 1, 1, 1], ctx, [])!.passed);
      t.end();
    });

    t.test("not array", (t) => {
      const g = lintBbox("string", ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-is-array")!.passed);
      t.end();
    });

    t.test("wrong length (3)", (t) => {
      const g = lintBbox([0, 0, 1], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-length")!.passed);
      t.end();
    });

    t.test("wrong length (5)", (t) => {
      const g = lintBbox([0, 0, 1, 1, 1], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-length")!.passed);
      t.end();
    });

    t.test("non-number element", (t) => {
      const g = lintBbox([0, "a", 1, 1], ctx, [])!;
      t.notOk(g.passed);
      t.notOk(find(g, "bbox-elements")!.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});
