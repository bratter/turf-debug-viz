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
  tag: "Schema",
  test(target: unknown) {
    if (target === null) return NULL_GEOMETRY_MSG;
  },
};

export function lintFeatureCollection(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup(FEATURE_COLLECTION, ctx, path);

  if (!g.check(fcIsObject, target)) return g.build();
  const fc = target as Record<string, unknown>;

  g.check(typeIsFeatureCollection, fc, "type");
  g.group(lintBbox, fc, "bbox");

  if (g.check(featuresIsArray, fc, "features")) {
    g.checkAll("features", lintFeature, fc.features as unknown[], {
      segment: "features",
    });
  }

  return g.build();
}

export function lintFeature(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup(FEATURE.toLowerCase(), ctx, path);

  if (!g.check(featureIsObject, target)) return g.build();
  const f = target as Record<string, unknown>;

  g.check(typeIsFeature, f, "type");
  g.check(idIsStringOrNumber, f, "id");
  g.check(propertiesIsObject, f, "properties");
  g.group(lintBbox, f, "bbox");

  const isNotNull = g.test(geometryNotNull, f, "geometry");
  const isObject = g.check(geometryIsObject, f, "geometry");
  // Short circuit if the geometry is null - no need for the isObject check
  if (isNotNull && isObject) {
    g.group(lintGeometry, f, "geometry");
  }

  return g.build();
}
