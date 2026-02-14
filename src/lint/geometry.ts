/**
 * Geometry lints.
 */

import type { Geometry } from "geojson";
import type { LintResultGroup, Path } from "./types.ts";
import { GEOMETRY_TYPES } from "./const.ts";
import { resultGroup } from "./builder.ts";
import { makeTypeLint } from "./helpers.ts";
import { lintBbox } from "./bbox.ts";

const typeIsGeometry = makeTypeLint(
  GEOMETRY_TYPES,
  "geometry",
  "a Geometry type",
  "RFC7946 3.1",
);

export function lintGeometry(geom: Geometry, path: Path = []): LintResultGroup {
  const g = resultGroup("Geometry", path);
  g.check(typeIsGeometry, geom);
  g.add(lintBbox(geom, path));
  return g.build();
}
