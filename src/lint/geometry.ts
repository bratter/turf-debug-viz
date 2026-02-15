/**
 * Geometry lints.
 */

import type { LintResultGroup, Path } from "./types.ts";
import { GEOMETRY_TYPES } from "./const.ts";
import { resultGroup } from "./builder.ts";
import { makeObjectLint, makeTypeLint } from "./helpers.ts";
import { lintBbox } from "./bbox.ts";

const geometryIsObject = makeObjectLint("Geometry", { ref: "RFC7946 3.1" });
const typeIsGeometry = makeTypeLint(
  GEOMETRY_TYPES,
  "geometry",
  "a Geometry type",
  "RFC7946 3.1",
);

export function lintGeometry(target: unknown, path: Path = []): LintResultGroup {
  const g = resultGroup("Geometry", path);

  if (!g.check(geometryIsObject, target)) return g.build();
  const geom = target as Record<string, unknown>;

  g.member(typeIsGeometry, geom, "type");
  g.add(lintBbox(geom.bbox, path));

  return g.build();
}
