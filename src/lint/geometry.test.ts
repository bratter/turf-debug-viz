import test from "tape";
import { lintGeometry } from "./geometry.ts";
import { find, findDeep } from "./test/helpers.ts";

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

  t.test("dimensionality", (t) => {
    t.test("consistent 2D positions pass", (t) => {
      const g = lintGeometry({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      });
      t.ok(g.passed);
      t.end();
    });

    t.test("consistent 3D positions pass", (t) => {
      const g = lintGeometry({
        type: "LineString",
        coordinates: [
          [0, 0, 100],
          [1, 1, 200],
        ],
      });
      t.ok(g.passed);
      t.end();
    });

    t.test("mixed 2D/3D in LineString fails", (t) => {
      const g = lintGeometry({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1, 100],
        ],
      });
      t.notOk(g.passed);
      const dim = findDeep(g, "position-dimensionality");
      t.ok(dim && !dim.passed, "has failing position-dimensionality");
      t.end();
    });

    t.test("mixed dimensionality in Polygon ring fails", (t) => {
      const g = lintGeometry({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0, 100],
            [1, 1],
            [0, 0],
          ],
        ],
      });
      t.notOk(g.passed);
      const dim = findDeep(g, "position-dimensionality");
      t.ok(dim && !dim.passed, "has failing position-dimensionality");
      t.end();
    });

    t.end();
  });

  t.end();
});
