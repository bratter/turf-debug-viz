/**
 * Geometry lints.
 */

import type { LintContext, LintResultGroup, Path } from "./types.ts";
import {
  GEOMETRY_TYPES,
  POINT,
  MULTI_POINT,
  LINE_STRING,
  MULTI_LINE_STRING,
  POLYGON,
  MULTI_POLYGON,
  GEOMETRY_COLLECTION,
} from "./const.ts";
import { resultGroup } from "./builder.ts";
import { makeArrayLint, makeObjectLint, makeTypeLint } from "./helpers.ts";
import { lintBbox } from "./bbox.ts";
import { lintPoint, lintMultiPoint } from "./point.ts";
import { lintLineString, lintMultiLineString } from "./linestring.ts";
import { lintPolygon, lintMultiPolygon } from "./polygon.ts";

const geometryIsObject = makeObjectLint("Geometry", { ref: "RFC7946 3.1" });
const geometriesIsArray = makeArrayLint("geometries", { ref: "RFC7946 3.1.8" });
const typeIsGeometry = makeTypeLint(
  GEOMETRY_TYPES,
  "geometry",
  "a Geometry type",
  "RFC7946 3.1",
);

export function lintGeometry(
  target: unknown,
  ctx: LintContext = {},
  path: Path = [],
): LintResultGroup {
  const g = resultGroup("Geometry", ctx, path);

  if (!g.check(geometryIsObject, target)) return g.build();
  const geom = target as Record<string, unknown>;

  g.member(typeIsGeometry, geom, "type");
  g.add(lintBbox(geom.bbox, g.ctx, path));

  switch (geom.type) {
    case POINT:
      lintPoint(g, geom);
      break;
    case MULTI_POINT:
      lintMultiPoint(g, geom);
      break;
    case LINE_STRING:
      lintLineString(g, geom);
      break;
    case MULTI_LINE_STRING:
      lintMultiLineString(g, geom);
      break;
    case POLYGON:
      lintPolygon(g, geom);
      break;
    case MULTI_POLYGON:
      lintMultiPolygon(g, geom);
      break;
    case GEOMETRY_COLLECTION: {
      if (!g.check(geometriesIsArray, geom.geometries, "geometries")) break;
      g.checkAll("geometries", lintGeometry, geom.geometries as unknown[], {
        quiet: true,
        segment: "geometries",
      });
      break;
    }
  }

  return g.build();
}
