/**
 * Feature and FeatureCollection lints.
 */

import { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
import { Severity } from "./types.ts";
import { FEATURE, FEATURE_COLLECTION } from "./const.ts";
import { resultGroup, withScope, isError } from "./builder.ts";
import {
  makeTypeLint,
  makeArrayLint,
  makeObjectLint,
  foreignMember,
  skip,
  ok,
  info,
  error,
} from "./helpers.ts";
import { lintBbox } from "./bbox.ts";
import { lintGeometry } from "./geometry.ts";

const FEATURE_KEYS = new Set(["type", "geometry", "properties", "id", "bbox"]);
const FC_KEYS = new Set(["type", "features", "bbox"]);

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
const geometryIsObject = makeObjectLint("feature-geometry", {
  nullable: true,
  ref: "RFC7946 3.2",
});
const idIsStringOrNumber: Lint = {
  name: "id-type",
  description:
    "If present, the id member MUST be a string or number (RFC7946 3.2)",
  tag: "Schema",
  test(target) {
    // Skip if not present
    if (target === undefined) return skip();
    if (typeof target !== "string" && typeof target !== "number") {
      return error(`Expected a string or number, received ${typeof target}`);
    }
    return ok();
  },
};
const geometryNotNull: Lint = {
  name: "feature-geometry-not-null",
  description:
    "A null geometry is valid per RFC7946, but may cause issues with some GeoJSON processing tools",
  tag: "Schema",
  test(target) {
    if (target === null) return info("The Feature's geometry member was NULL");
    return skip();
  },
};

export function lintFeatureCollection(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup(
    "feature-collection",
    withScope(ctx, { parent: target }),
    path,
  );

  if (isError(g.check(fcIsObject, target))) return g.build();
  const fc = target as Record<string, unknown>;

  g.check(typeIsFeatureCollection, fc, "type");
  g.group(lintBbox, fc, "bbox");

  if (g.check(featuresIsArray, fc, "features") === Severity.Ok) {
    g.checkAll("features", lintFeature, fc.features as unknown[], {
      segment: "features",
    });
  }

  for (const key of Object.keys(fc)) {
    if (!FC_KEYS.has(key)) g.check(foreignMember, fc, key);
  }

  return g.build();
}

export function lintFeature(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("feature", withScope(ctx, { parent: target }), path);

  if (isError(g.check(featureIsObject, target))) return g.build();
  const f = target as Record<string, unknown>;

  g.check(typeIsFeature, f, "type");
  g.check(idIsStringOrNumber, f, "id");
  g.check(propertiesIsObject, f, "properties");
  g.group(lintBbox, f, "bbox");

  g.check(geometryNotNull, f, "geometry");
  const isObject = g.check(geometryIsObject, f, "geometry") === Severity.Ok;
  // Short circuit if the geometry is null - no need for the isObject check
  if (f.geometry !== null && isObject) {
    g.group(lintGeometry, f, "geometry");
  }

  for (const key of Object.keys(f)) {
    if (!FEATURE_KEYS.has(key)) g.check(foreignMember, f, key);
  }

  return g.build();
}
