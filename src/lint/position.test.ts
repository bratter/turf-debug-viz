import test from "tape";
import { lintPosition } from "./position.ts";
import { createContext } from "./builder.ts";
import { find } from "./test/helpers.ts";

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
      t.notOk(find(g, "position-elements")!.passed);
      t.end();
    });

    t.end();
  });

  t.test("geometry", (t) => {
    t.test("valid position [0, 0] passes", (t) => {
      const g = lintPosition([0, 0], createContext(), []);
      t.ok(g.passed);
      t.end();
    });

    t.test("extremes [-180, -90] pass", (t) => {
      const g = lintPosition([-180, -90], createContext(), []);
      t.ok(g.passed);
      t.end();
    });

    t.test("extremes [180, 90] pass", (t) => {
      const g = lintPosition([180, 90], createContext(), []);
      t.ok(g.passed);
      t.end();
    });

    t.test("longitude > 180 fails", (t) => {
      const g = lintPosition([181, 0], createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "longitude-range")!.passed);
      t.end();
    });

    t.test("longitude < -180 fails", (t) => {
      const g = lintPosition([-181, 0], createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "longitude-range")!.passed);
      t.end();
    });

    t.test("latitude > 90 fails", (t) => {
      const g = lintPosition([0, 91], createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "latitude-range")!.passed);
      t.end();
    });

    t.test("latitude < -90 fails", (t) => {
      const g = lintPosition([0, -91], createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "latitude-range")!.passed);
      t.end();
    });

    t.test("schema failure skips geometry lints", (t) => {
      const g = lintPosition([0, "a"], createContext(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "longitude-range"), "no longitude-range result");
      t.notOk(find(g, "latitude-range"), "no latitude-range result");
      t.end();
    });

    t.end();
  });

  t.end();
});
