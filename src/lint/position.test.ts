import test from "tape";
import { lintPosition } from "./position.ts";
import { ctx, find } from "./test/helpers.ts";
import { Severity } from "./types.ts";

test("lintPosition", (t) => {
  t.test("schema", (t) => {
    t.test("valid 2-element position passes", (t) => {
      t.ok(lintPosition([0, 0], ctx(), []).passed);
      t.end();
    });

    t.test("valid 3-element position passes", (t) => {
      t.ok(lintPosition([0, 0, 100], ctx(), []).passed);
      t.end();
    });

    t.test("not array", (t) => {
      const g = lintPosition("string", ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "position-is-array")!.severity, Severity.Error);
      t.end();
    });

    t.test("missing (undefined)", (t) => {
      const g = lintPosition(undefined, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "position-is-array")!.severity, Severity.Error);
      t.end();
    });

    t.test("too short (empty)", (t) => {
      const g = lintPosition([], ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "position-min-length")!.severity, Severity.Error);
      t.end();
    });

    t.test("too short (1 element)", (t) => {
      const g = lintPosition([0], ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "position-min-length")!.severity, Severity.Error);
      t.end();
    });

    t.test("too long (4 elements)", (t) => {
      const g = lintPosition([0, 0, 0, 0], ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "position-max-length")!.severity, Severity.Warn);
      t.end();
    });

    t.test("non-number element", (t) => {
      const g = lintPosition([0, "a"], ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "position-elements")!.severity, Severity.Error);
      t.end();
    });

    t.end();
  });

  t.test("geometry", (t) => {
    t.test("valid position [0, 0] passes", (t) => {
      const g = lintPosition([0, 0], ctx(), []);
      t.ok(g.passed);
      t.end();
    });

    t.test("extremes [-180, -90] pass", (t) => {
      const g = lintPosition([-180, -90], ctx(), []);
      t.ok(g.passed);
      t.end();
    });

    t.test("extremes [180, 90] pass", (t) => {
      const g = lintPosition([180, 90], ctx(), []);
      t.ok(g.passed);
      t.end();
    });

    t.test("longitude > 180 fails", (t) => {
      const g = lintPosition([181, 0], ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "longitude-range")!.severity, Severity.Error);
      t.end();
    });

    t.test("longitude < -180 fails", (t) => {
      const g = lintPosition([-181, 0], ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "longitude-range")!.severity, Severity.Error);
      t.end();
    });

    t.test("latitude > 90 fails", (t) => {
      const g = lintPosition([0, 91], ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "latitude-range")!.severity, Severity.Error);
      t.end();
    });

    t.test("latitude < -90 fails", (t) => {
      const g = lintPosition([0, -91], ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "latitude-range")!.severity, Severity.Error);
      t.end();
    });

    t.test("schema failure skips geometry lints", (t) => {
      const g = lintPosition([0, "a"], ctx(), []);
      t.notOk(g.passed);
      t.notOk(find(g, "longitude-range"), "no longitude-range result");
      t.notOk(find(g, "latitude-range"), "no latitude-range result");
      t.end();
    });

    t.end();
  });

  t.end();
});
