import test from "tape";
import { lintFeature, lintFeatureCollection } from "./feature.ts";
import { createContext } from "./builder.ts";
import { find } from "./test/helpers.ts";

const ctx = createContext();
const point = { type: "Point", coordinates: [0, 0] };
const feature = { type: "Feature", properties: {}, geometry: point };
const fc = { type: "FeatureCollection", features: [] };

test("lintFeature", (t) => {
  t.test("schema", (t) => {
    t.test("valid feature passes", (t) => {
      t.ok(lintFeature(feature, ctx, []).passed);
      t.end();
    });

    t.test("not object", (t) => {
      const g = lintFeature("string", ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "feature-is-object")!.passed);
      t.end();
    });

    t.test("wrong type", (t) => {
      const g = lintFeature({ ...feature, type: "Wrong" }, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "type-feature")!.passed);
      t.end();
    });

    t.test("missing properties", (t) => {
      const { properties, ...rest } = feature;
      const g = lintFeature(rest, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "properties-is-object")!.passed);
      t.end();
    });

    t.test("properties is array", (t) => {
      const g = lintFeature({ ...feature, properties: [] }, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "properties-is-object")!.passed);
      t.end();
    });

    t.test("missing geometry", (t) => {
      const { geometry, ...rest } = feature;
      const g = lintFeature(rest, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "feature-geometry-is-object")!.passed);
      t.end();
    });

    t.test("null geometry ok", (t) => {
      t.ok(lintFeature({ ...feature, geometry: null }, ctx, []).passed);
      t.end();
    });

    t.test("id string ok", (t) => {
      t.ok(lintFeature({ ...feature, id: "a" }, ctx, []).passed);
      t.end();
    });

    t.test("id number ok", (t) => {
      t.ok(lintFeature({ ...feature, id: 1 }, ctx, []).passed);
      t.end();
    });

    t.test("id boolean fails", (t) => {
      const g = lintFeature({ ...feature, id: true }, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "id-type")!.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});

test("lintFeatureCollection", (t) => {
  t.test("schema", (t) => {
    t.test("valid fc passes", (t) => {
      t.ok(lintFeatureCollection(fc, ctx, []).passed);
      t.end();
    });

    t.test("not object", (t) => {
      const g = lintFeatureCollection("string", ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "feature-collection-is-object")!.passed);
      t.end();
    });

    t.test("wrong type", (t) => {
      const g = lintFeatureCollection({ ...fc, type: "Wrong" }, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "type-feature-collection")!.passed);
      t.end();
    });

    t.test("missing features", (t) => {
      const { features, ...rest } = fc;
      const g = lintFeatureCollection(rest, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "features-is-array")!.passed);
      t.end();
    });

    t.test("features not array", (t) => {
      const g = lintFeatureCollection({ ...fc, features: {} }, ctx, []);
      t.notOk(g.passed);
      t.notOk(find(g, "features-is-array")!.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});
