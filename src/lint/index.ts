/**
 * Linting logic for GeoJSON.
 *
 * Build a comprehensive json-ready lint report for any geojson object. The
 * linter walks the GeoJSON object triggering the required tests at each level.
 * This is intended as a comprehsive suite of lints, with no consideration of
 * performance.
 */

import type { GeoJSON } from "geojson";
import type { Lint, LintResultGroup } from "./types.ts";
import { Severity } from "./types.ts";
import { GEOJSON_TYPES, FEATURE, FEATURE_COLLECTION } from "./const.ts";
import { resultGroup } from "./builder.ts";
import { makeTypeLint } from "./helpers.ts";
import { lintFeature, lintFeatureCollection } from "./feature.ts";
import { lintGeometry } from "./geometry.ts";

// TODO: Should this be a factory, if so should account for nullable and non-nullable
const targetIsObject: Lint = {
  name: "root-object",
  description: "The GeoJSON root must be an object (RFC7946 3)",
  severity: Severity.Error,
  tag: "Schema",
  test(target: GeoJSON) {
    if (typeof target !== "object") {
      return `Expected an Object, received ${typeof target}`;
    } else if (target === null) {
      return "Expected a non-null Object, but received null";
    }
  },
};

const typeIsGeoJson = makeTypeLint(
  GEOJSON_TYPES,
  "geojson",
  "a GeoJSON type",
  "RFC7946 3",
);

export function lint(gj: GeoJSON): LintResultGroup {
  const g = resultGroup("document", []);
  const validObject = g.check(targetIsObject, gj);
  const validType = g.check(typeIsGeoJson, gj.type, "type");

  // Only lint the type if the document level checks pass
  if (validObject && validType) {
    switch (gj.type) {
      case FEATURE:
        g.add(lintFeature(gj));
        break;
      case FEATURE_COLLECTION:
        g.add(lintFeatureCollection(gj));
        break;
      default:
        g.add(lintGeometry(gj));
        break;
    }
  }

  return g.build();
}
