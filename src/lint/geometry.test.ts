import test from "tape";
import { lintGeometry } from "./geometry.ts";
import { createContext } from "./builder.ts";
import { find, findDeep } from "./test/helpers.ts";

const ctx = createContext();

test("lintGeometry", (t) => {
  t.test("schema", (t) => {
    t.test("not object", (t) => {
      const g = lintGeometry("string", ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "geometry-is-object")!.passed);
      t.end();
    });

    t.test("wrong type", (t) => {
      const g = lintGeometry({ type: "Wrong" }, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "type-geometry")!.passed);
      t.end();
    });

    t.end();
  });

  t.test("nested GeometryCollection warns", (t) => {
    const g = lintGeometry(
      {
        type: "GeometryCollection",
        geometries: [{ type: "GeometryCollection", geometries: [] }],
      },
      createContext(),
      [],
    );
    const r = findDeep(g, "no-parent-collection");
    t.ok(r, "has no-parent-collection result");
    t.notOk(r!.passed, "nested collection warns");
    t.end();
  });

  t.test("dimensionality", (t) => {
    t.test("consistent 2D positions pass", (t) => {
      const g = lintGeometry(
        {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        createContext(),
        [],
      );
      t.ok(g.passed);
      t.end();
    });

    t.test("consistent 3D positions pass", (t) => {
      const g = lintGeometry(
        {
          type: "LineString",
          coordinates: [
            [0, 0, 100],
            [1, 1, 200],
          ],
        },
        createContext(),
        [],
      );
      t.ok(g.passed);
      t.end();
    });

    t.test("mixed 2D/3D in LineString fails", (t) => {
      const g = lintGeometry(
        {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1, 100],
          ],
        },
        createContext(),
        [],
      );
      t.notOk(g.passed);
      const dim = findDeep(g, "position-dimensionality");
      t.ok(dim && !dim.passed, "has failing position-dimensionality");
      t.end();
    });

    t.test("mixed dimensionality in Polygon ring fails", (t) => {
      const g = lintGeometry(
        {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0, 100],
              [1, 1],
              [0, 0],
            ],
          ],
        },
        createContext(),
        [],
      );
      t.notOk(g.passed);
      const dim = findDeep(g, "position-dimensionality");
      t.ok(dim && !dim.passed, "has failing position-dimensionality");
      t.end();
    });

    t.end();
  });

  t.end();
});
