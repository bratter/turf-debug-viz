/**
 * Linting logic for GeoJSON.
 *
 * Build a comprehensive json-ready lint report for any geojson object. The
 * linter walks the GeoJSON object triggering the required tests at each level.
 * This is intended as a comprehsive suite of lints, with no consideration of
 * performance.
 */

import type { LintResultGroup } from "./types.ts";
import { GEOJSON_TYPES, FEATURE, FEATURE_COLLECTION } from "./const.ts";
import { resultGroup } from "./builder.ts";
import { makeObjectLint, makeTypeLint } from "./helpers.ts";
import { lintFeature, lintFeatureCollection } from "./feature.ts";
import { lintGeometry } from "./geometry.ts";

const rootIsObject = makeObjectLint("root", { ref: "RFC7946 3" });
const typeIsGeoJson = makeTypeLint(
  GEOJSON_TYPES,
  "geojson",
  "a GeoJSON type",
  "RFC7946 3",
);

export function lint(target: unknown): LintResultGroup {
  const g = resultGroup("document", []);

  if (!g.check(rootIsObject, target)) return g.build();
  const gj = target as Record<string, unknown>;

  if (!g.check(typeIsGeoJson, gj.type, "type")) return g.build();

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

  return g.build();
}
