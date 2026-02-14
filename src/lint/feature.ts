/**
 * Feature and FeatureCollection lints.
 */

import { Feature, FeatureCollection } from "geojson";
import { Lint, LintResultGroup, Path } from "./types.ts";
import { Severity } from "./types.ts";
import { FEATURE, FEATURE_COLLECTION } from "./const.ts";
import { resultGroup } from "./builder.ts";
import { makeTypeLint, makeArrayLint, makeObjectLint } from "./helpers.ts";
import { lintBbox } from "./bbox.ts";
import { lintGeometry } from "./geometry.ts";

const typeIsFeatureCollection = makeTypeLint(FEATURE_COLLECTION, "RFC7946 3.3");
const typeIsFeature = makeTypeLint(FEATURE, "RFC7946 3.2");
const featuresIsArray = makeArrayLint("features", { ref: "RFC7946 3.3" });
const propertiesIsObject = makeObjectLint("properties", {
  nullable: true,
  ref: "RFC7946 3.2",
});
const geometryIsObject = makeObjectLint("geometry", {
  nullable: true,
  ref: "RFC7946 3.2",
});

const idIsStringOrNumber: Lint<unknown> = {
  name: "id-type",
  description:
    "If present, the id member MUST be a string or number (RFC7946 3.2)",
  severity: Severity.Error,
  tag: "Schema",
  test(target: unknown) {
    if (typeof target !== "string" && typeof target !== "number")
      return `Expected a string or number, received ${typeof target}`;
  },
};

const geometryIsNull: Lint<unknown> = {
  name: "geometry-null",
  description:
    "A null geometry is valid per RFC7946, but may cause issues with some GeoJSON processing tools",
  severity: Severity.Info,
  tag: "Schema",
  test() {
    return "A null geometry is valid per RFC7946, but may cause issues with some GeoJSON processing tools";
  },
};

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

export function lintFeature(f: Feature, path: Path = []): LintResultGroup {
  const g = resultGroup(FEATURE, path);
  g.check(typeIsFeature, f);
  g.add(lintBbox(f, path));

  // id -- optional, validate type only if present
  if (f.id !== undefined) {
    const idGroup = resultGroup("id", path, "id");
    idGroup.check(idIsStringOrNumber, f.id);
    g.add(idGroup.build());
  }

  // properties -- required, nullable
  const propsGroup = resultGroup("properties", path, "properties");
  propsGroup.check(propertiesIsObject, f.properties);
  g.add(propsGroup.build());

  // geometry -- required, nullable with info lint
  const geomGroup = resultGroup("geometry", path, "geometry");
  if (geomGroup.check(geometryIsObject, f.geometry)) {
    if (f.geometry === null) {
      geomGroup.check(geometryIsNull, f.geometry);
    } else {
      geomGroup.add(lintGeometry(f.geometry, [...path, "geometry"]));
    }
  }
  g.add(geomGroup.build());

  return g.build();
}
