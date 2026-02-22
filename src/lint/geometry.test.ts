import test from "tape";
import { lintGeometry } from "./geometry.ts";
import { ctx, find, findDeep } from "./test/helpers.ts";
import { Severity } from "./types.ts";

test("lintGeometry", (t) => {
  t.test("schema", (t) => {
    t.test("not object", (t) => {
      const g = lintGeometry("string", ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "geometry-is-object")!.severity, Severity.Error);
      t.end();
    });

    t.test("wrong type", (t) => {
      const g = lintGeometry({ type: "Wrong" }, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "type-geometry")!.severity, Severity.Error);
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
      ctx(),
      [],
    );
    const r = findDeep(g, "no-parent-collection");
    t.ok(r, "has no-parent-collection result");
    t.equal(r!.severity, Severity.Warn);
    t.end();
  });

  t.test("foreign-member", (t) => {
    t.test("geometry with extra key emits info", (t) => {
      const g = lintGeometry(
        { type: "Point", coordinates: [0, 0], extra: "val" },
        ctx(),
        [],
      );
      const r = findDeep(g, "foreign-member");
      t.ok(r, "has foreign-member result");
      t.equal(r!.severity, Severity.Info);
      t.end();
    });

    t.test("GeometryCollection with extra key emits info", (t) => {
      const g = lintGeometry(
        { type: "GeometryCollection", geometries: [], extra: "val" },
        ctx(),
        [],
      );
      const r = findDeep(g, "foreign-member");
      t.ok(r, "has foreign-member result");
      t.equal(r!.severity, Severity.Info);
      t.end();
    });

    t.test("standard geometry has no foreign-member result", (t) => {
      const g = lintGeometry({ type: "Point", coordinates: [0, 0] }, ctx(), []);
      t.notOk(findDeep(g, "foreign-member"), "no foreign-member lint");
      t.end();
    });

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
        ctx(),
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
        ctx(),
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
        ctx(),
        [],
      );
      t.notOk(g.passed);
      // findDeep returns the first position-dimensionality (Ok from baseline);
      // the error is on the second position, so assert at the group level.
      t.equal(
        g.severity,
        Severity.Error,
        "has Error severity from mixed dimensionality",
      );
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
        ctx(),
        [],
      );
      t.notOk(g.passed);
      t.equal(
        g.severity,
        Severity.Error,
        "has Error severity from mixed dimensionality",
      );
      t.end();
    });

    t.end();
  });

  t.end();
});
