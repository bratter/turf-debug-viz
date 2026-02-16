import test from "tape";
import { lintFeature, lintFeatureCollection } from "./feature.ts";
import { find } from "./test/helpers.ts";

const point = { type: "Point", coordinates: [0, 0] };
const feature = { type: "Feature", properties: {}, geometry: point };
const fc = { type: "FeatureCollection", features: [] };

test("lintFeature", (t) => {
  t.test("schema", (t) => {
    t.test("valid feature passes", (t) => {
      t.ok(lintFeature(feature).passed);
      t.end();
    });

    t.test("not object", (t) => {
      const g = lintFeature("string");
      t.notOk(g.passed);
      t.notOk(find(g, "Feature-is-object")!.passed);
      t.end();
    });

    t.test("wrong type", (t) => {
      const g = lintFeature({ ...feature, type: "Wrong" });
      t.notOk(g.passed);
      t.notOk(find(g, "type-feature")!.passed);
      t.end();
    });

    t.test("missing properties", (t) => {
      const { properties, ...rest } = feature;
      const g = lintFeature(rest);
      t.notOk(g.passed);
      t.notOk(find(g, "properties-is-object")!.passed);
      t.end();
    });

    t.test("properties is array", (t) => {
      const g = lintFeature({ ...feature, properties: [] });
      t.notOk(g.passed);
      t.notOk(find(g, "properties-is-object")!.passed);
      t.end();
    });

    t.test("missing geometry", (t) => {
      const { geometry, ...rest } = feature;
      const g = lintFeature(rest);
      t.notOk(g.passed);
      t.notOk(find(g, "geometry-is-object")!.passed);
      t.end();
    });

    t.test("null geometry ok", (t) => {
      t.ok(lintFeature({ ...feature, geometry: null }).passed);
      t.end();
    });

    t.test("id string ok", (t) => {
      t.ok(lintFeature({ ...feature, id: "a" }).passed);
      t.end();
    });

    t.test("id number ok", (t) => {
      t.ok(lintFeature({ ...feature, id: 1 }).passed);
      t.end();
    });

    t.test("id boolean fails", (t) => {
      const g = lintFeature({ ...feature, id: true });
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
      t.ok(lintFeatureCollection(fc).passed);
      t.end();
    });

    t.test("not object", (t) => {
      const g = lintFeatureCollection("string");
      t.notOk(g.passed);
      t.notOk(find(g, "FeatureCollection-is-object")!.passed);
      t.end();
    });

    t.test("wrong type", (t) => {
      const g = lintFeatureCollection({ ...fc, type: "Wrong" });
      t.notOk(g.passed);
      t.notOk(find(g, "type-featurecollection")!.passed);
      t.end();
    });

    t.test("missing features", (t) => {
      const { features, ...rest } = fc;
      const g = lintFeatureCollection(rest);
      t.notOk(g.passed);
      t.notOk(find(g, "features-is-array")!.passed);
      t.end();
    });

    t.test("features not array", (t) => {
      const g = lintFeatureCollection({ ...fc, features: {} });
      t.notOk(g.passed);
      t.notOk(find(g, "features-is-array")!.passed);
      t.end();
    });

    t.end();
  });

  t.end();
});
