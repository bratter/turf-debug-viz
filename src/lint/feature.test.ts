import test from "tape";
import { lintFeature, lintFeatureCollection } from "./feature.ts";
import { ctx, find } from "./test/helpers.ts";
import type { LintResult } from "./types.ts";
import { Severity } from "./types.ts";
const point = { type: "Point", coordinates: [0, 0] };
const feature = { type: "Feature", properties: {}, geometry: point };
const fc = { type: "FeatureCollection", features: [] };

test("lintFeature", (t) => {
  t.test("schema", (t) => {
    t.test("valid feature passes", (t) => {
      t.ok(lintFeature(feature, ctx(), []).passed);
      t.end();
    });

    t.test("not object", (t) => {
      const g = lintFeature("string", ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "feature-is-object")!.severity, Severity.Error);
      t.end();
    });

    t.test("wrong type", (t) => {
      const g = lintFeature({ ...feature, type: "Wrong" }, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "type-feature")!.severity, Severity.Error);
      t.end();
    });

    t.test("missing properties", (t) => {
      const { properties, ...rest } = feature;
      const g = lintFeature(rest, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "properties-is-object")!.severity, Severity.Error);
      t.end();
    });

    t.test("properties is array", (t) => {
      const g = lintFeature({ ...feature, properties: [] }, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "properties-is-object")!.severity, Severity.Error);
      t.end();
    });

    t.test("missing geometry", (t) => {
      const { geometry, ...rest } = feature;
      const g = lintFeature(rest, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "feature-geometry-is-object")!.severity, Severity.Error);
      t.end();
    });

    t.test("null geometry emits info", (t) => {
      const g = lintFeature({ ...feature, geometry: null }, ctx(), []);
      t.ok(g.passed);
      t.equal(find(g, "feature-geometry-not-null")!.severity, Severity.Info);
      t.end();
    });

    t.test("non-null geometry skips geometry-not-null", (t) => {
      const g = lintFeature(feature, ctx(), []);
      t.ok(g.passed);
      t.equal(find(g, "feature-geometry-not-null")!.severity, Severity.Skip);
      t.end();
    });

    t.test("id string ok", (t) => {
      const g = lintFeature({ ...feature, id: "a" }, ctx(), []);
      t.ok(g.passed);
      t.equal(find(g, "id-type")!.severity, Severity.Ok);
      t.end();
    });

    t.test("id number ok", (t) => {
      const g = lintFeature({ ...feature, id: 1 }, ctx(), []);
      t.ok(g.passed);
      t.equal(find(g, "id-type")!.severity, Severity.Ok);
      t.end();
    });

    t.test("id absent skips", (t) => {
      const g = lintFeature(feature, ctx(), []);
      t.ok(g.passed);
      t.equal(find(g, "id-type")!.severity, Severity.Skip);
      t.end();
    });

    t.test("id boolean fails", (t) => {
      const g = lintFeature({ ...feature, id: true }, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "id-type")!.severity, Severity.Error);
      t.end();
    });

    t.end();
  });

  t.test("foreign-member", (t) => {
    t.test("feature with extra key emits info", (t) => {
      const g = lintFeature({ ...feature, extra: "val" }, ctx(), []);
      const r = find(g, "foreign-member") as LintResult;
      t.ok(r, "has foreign-member result");
      t.equal(r.severity, Severity.Info);
      t.deepEqual(r.path, ["extra"]);
      t.end();
    });

    t.test("standard feature has no foreign-member result", (t) => {
      const g = lintFeature(feature, ctx(), []);
      t.notOk(find(g, "foreign-member"), "no foreign-member lint");
      t.end();
    });

    t.end();
  });

  t.end();
});

test("lintFeatureCollection", (t) => {
  t.test("schema", (t) => {
    t.test("valid fc passes", (t) => {
      t.ok(lintFeatureCollection(fc, ctx(), []).passed);
      t.end();
    });

    t.test("not object", (t) => {
      const g = lintFeatureCollection("string", ctx(), []);
      t.notOk(g.passed);
      t.equal(
        find(g, "feature-collection-is-object")!.severity,
        Severity.Error,
      );
      t.end();
    });

    t.test("wrong type", (t) => {
      const g = lintFeatureCollection({ ...fc, type: "Wrong" }, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "type-feature-collection")!.severity, Severity.Error);
      t.end();
    });

    t.test("missing features", (t) => {
      const { features, ...rest } = fc;
      const g = lintFeatureCollection(rest, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "features-is-array")!.severity, Severity.Error);
      t.end();
    });

    t.test("features not array", (t) => {
      const g = lintFeatureCollection({ ...fc, features: {} }, ctx(), []);
      t.notOk(g.passed);
      t.equal(find(g, "features-is-array")!.severity, Severity.Error);
      t.end();
    });

    t.end();
  });

  t.test("foreign-member", (t) => {
    t.test("fc with extra key emits info", (t) => {
      const g = lintFeatureCollection({ ...fc, extra: "val" }, ctx(), []);
      const r = find(g, "foreign-member") as LintResult;
      t.ok(r, "has foreign-member result");
      t.equal(r.severity, Severity.Info);
      t.deepEqual(r.path, ["extra"]);
      t.end();
    });

    t.end();
  });

  t.end();
});
