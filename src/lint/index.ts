/**
 * Linting logic for GeoJSON.
 *
 * Build a comprehensive json-ready lint report for any geojson object. The
 * linter walks the GeoJSON object triggering the required tests at each level.
 * This is intended as a comprehensive suite of lints, with no consideration of
 * performance.
 */

import { Severity, type LintResultGroup, type LintSettings } from "./types.ts";
import { GEOJSON_TYPES, FEATURE, FEATURE_COLLECTION } from "./const.ts";
import { createContext, DEFAULT_SETTINGS, filterLintResult, flattenLintResult, resultGroup } from "./builder.ts";
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

export {
  filterLintResult,
  flattenLintResult,
} from "./builder.ts";

export function lintFlat(target: unknown, severity: Severity = Severity.Info, settings: Partial<LintSettings> = {}): LintResultGroup {
  const results = lint(target, settings);
  const filtered = filterLintResult(results, r => r.passed && r.severity >= severity);

  return flattenLintResult(filtered);
}

/**
 * Lint a GeoJSON object.
 *
 * Produces a lint tree for maximium flexibility in processing results.
 * Consider using {@link lint} 
 */
export function lint(
  target: unknown,
  settings: Partial<LintSettings> = {},
): LintResultGroup {
  const ctx = createContext({ ...DEFAULT_SETTINGS, ...settings });
  const g = resultGroup("document", ctx, []);

  if (!g.check(rootIsObject, target)) return g.build();
  const gj = target as Record<string, unknown>;

  if (!g.check(typeIsGeoJson, gj, "type")) return g.build();

  switch (gj.type) {
    case FEATURE:
      g.group(lintFeature, gj);
      break;
    case FEATURE_COLLECTION:
      g.group(lintFeatureCollection, gj);
      break;
    default:
      g.group(lintGeometry, gj);
      break;
  }

  return g.build();
}
