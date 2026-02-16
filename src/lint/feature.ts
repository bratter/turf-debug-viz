/**
 * Feature and FeatureCollection lints.
 */

import { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
import { Severity } from "./types.ts";
import { FEATURE, FEATURE_COLLECTION } from "./const.ts";
import { resultGroup } from "./builder.ts";
import { makeTypeLint, makeArrayLint, makeObjectLint } from "./helpers.ts";
import { lintBbox } from "./bbox.ts";
import { lintGeometry } from "./geometry.ts";

// FeatureCollection lints
const fcIsObject = makeObjectLint(FEATURE_COLLECTION, { ref: "RFC7946 3.3" });
const typeIsFeatureCollection = makeTypeLint(FEATURE_COLLECTION, "RFC7946 3.3");
const featuresIsArray = makeArrayLint("features", { ref: "RFC7946 3.3" });

// FeatureLints
const featureIsObject = makeObjectLint(FEATURE, { ref: "RFC7946 3.2" });
const typeIsFeature = makeTypeLint(FEATURE, "RFC7946 3.2");
const propertiesIsObject = makeObjectLint("properties", {
  nullable: true,
  ref: "RFC7946 3.2",
});
const geometryIsObject = makeObjectLint("geometry", {
  nullable: true,
  ref: "RFC7946 3.2",
});
const idIsStringOrNumber: Lint = {
  name: "id-type",
  description:
    "If present, the id member MUST be a string or number (RFC7946 3.2)",
  severity: Severity.Error,
  tag: "Schema",
  optional: true,
  test(target: unknown) {
    if (typeof target !== "string" && typeof target !== "number")
      return `Expected a string or number, received ${typeof target}`;
  },
};
const NULL_GEOMETRY_MSG =
  "A null geometry is valid per RFC7946, but may cause issues with some GeoJSON processing tools";
const geometryNotNull: Lint = {
  name: "geometry-not-null",
  description: NULL_GEOMETRY_MSG,
  severity: Severity.Info,
  quiet: true,
  tag: "Schema",
  test(target: unknown) {
    if (target === null) return NULL_GEOMETRY_MSG;
  },
};

export function lintFeatureCollection(
  target: unknown,
  ctx: LintContext = {},
  path: Path = [],
): LintResultGroup {
  const g = resultGroup(FEATURE_COLLECTION, ctx, path);

  if (!g.check(fcIsObject, target)) return g.build();
  const fc = target as Record<string, unknown>;

  g.member(typeIsFeatureCollection, fc, "type");
  g.add(lintBbox(fc.bbox, g.ctx, path));

  if (g.check(featuresIsArray, fc.features, "features")) {
    g.checkAll("features", lintFeature, fc.features as unknown[], {
      segment: "features",
    });
  }

  return g.build();
}

export function lintFeature(
  target: unknown,
  ctx: LintContext = {},
  path: Path = [],
): LintResultGroup {
  const g = resultGroup(FEATURE.toLowerCase(), ctx, path);

  if (!g.check(featureIsObject, target)) return g.build();
  const f = target as Record<string, unknown>;

  g.member(typeIsFeature, f, "type");
  g.member(idIsStringOrNumber, f, "id");
  g.member(propertiesIsObject, f, "properties");
  g.add(lintBbox(f.bbox, g.ctx, path));

  const isNotNull = g.member(geometryNotNull, f, "geometry");
  const isObject = g.member(geometryIsObject, f, "geometry");
  // Short circuit if the geometry is null - no need for the isObject check
  if (isNotNull && isObject) {
    g.add(lintGeometry(f.geometry, g.ctx, [...path, "geometry"]));
  }

  return g.build();
}
