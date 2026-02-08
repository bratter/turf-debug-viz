/**
 * Feature and FeatureCollection lints.
 */

import { Feature, FeatureCollection } from "geojson";
import { LintResultGroup, Path } from "./types.ts";
import { FEATURE, FEATURE_COLLECTION } from "./const.ts";
import { resultGroup } from "./builder.ts";
import { makeTypeLint, makeArrayLint } from "./helpers.ts";
import { lintBbox } from "./bbox.ts";

const typeIsFeatureCollection = makeTypeLint(FEATURE_COLLECTION, "RFC7946 3.3");
const typeIsFeature = makeTypeLint(FEATURE, "RFC7946 3.2");
const featuresIsArray = makeArrayLint("features", "RFC7946 3.3");

export function lintFeatureCollection(
  fc: FeatureCollection,
  path: Path = [],
): LintResultGroup {
  const cGroup = resultGroup(FEATURE_COLLECTION, path);
  cGroup.check(typeIsFeatureCollection, fc);
  cGroup.add(lintBbox(fc));

  const fGroup = resultGroup("features", path, "features");
  if (fGroup.check(featuresIsArray, fc.features)) {
    fGroup.checkAll(lintFeature, fc.features);
  }

  cGroup.add(fGroup.build());
  return cGroup.build();
}

// TODO: Build the feature linter
// maybe info level lint for null geometry in feature?
export function lintFeature(f: Feature, path: Path = []): LintResultGroup {
  const g = resultGroup(FEATURE, path);
  g.check(typeIsFeature, f);

  return g.build();
}
