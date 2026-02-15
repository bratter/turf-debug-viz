import test from "tape";
import { lintGeometry } from "./geometry.ts";
import { find } from "./test/helpers.ts";

test("lintGeometry", (t) => {
  t.test("schema", (t) => {
    t.test("not object", (t) => {
      const g = lintGeometry("string");
      t.notOk(g.passed);
      t.notOk(find(g, "Geometry-is-object")!.passed);
      t.end();
    });

    t.test("wrong type", (t) => {
      const g = lintGeometry({ type: "Wrong" });
      t.notOk(g.passed);
      t.notOk(find(g, "type-geometry")!.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});
