/**
 * Geometry lints.
 */

import {
  type Lint,
  type LintContext,
  type LintResultGroup,
  type Path,
} from "./types.ts";
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
import { resultGroup, withScope, isError } from "./builder.ts";
import {
  isRecord,
  makeArrayLint,
  makeObjectLint,
  makeTypeLint,
  foreignMember,
  ok,
  warn,
} from "./helpers.ts";
import { lintBbox } from "./bbox.ts";
import { lintPosition } from "./position.ts";
import { lintMultiPoint } from "./point.ts";
import { lintLineString, lintMultiLineString } from "./linestring.ts";
import { lintPolygon, lintMultiPolygon } from "./polygon.ts";

const GEOMETRY_KEYS = new Set(["type", "coordinates", "bbox"]);
const GC_KEYS = new Set(["type", "geometries", "bbox"]);

const geometryIsObject = makeObjectLint("geometry", { ref: "RFC7946 3.1" });
const geometriesIsArray = makeArrayLint("geometries", { ref: "RFC7946 3.1.8" });
const typeIsGeometry = makeTypeLint(
  GEOMETRY_TYPES,
  "geometry",
  "a Geometry type",
  "RFC7946 3.1",
);
const noParentCollection: Lint = {
  name: "no-parent-collection",
  description: "GeometryCollections SHOULD not be nested (RFC7946 3.1.8)",
  tag: "Schema",
  test(_, ctx) {
    const parent = ctx.scope.parent;
    if (isRecord(parent) && parent.type === GEOMETRY_COLLECTION) {
      return warn(
        "GeometryCollection has a parent GeometryCollection, but SHOULD not be nested",
      );
    }
    return ok();
  },
};

export function lintGeometry(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("geometry", withScope(ctx, { parent: target }), path);

  if (isError(g.check(geometryIsObject, target))) return g.build();
  const geom = target as Record<string, unknown>;

  g.check(typeIsGeometry, geom, "type");
  g.group(lintBbox, geom, "bbox");

  const allowedKeys =
    geom.type === GEOMETRY_COLLECTION ? GC_KEYS : GEOMETRY_KEYS;
  for (const key of Object.keys(geom)) {
    if (!allowedKeys.has(key)) g.check(foreignMember, geom, key);
  }

  switch (geom.type) {
    case POINT:
      g.group(lintPosition, geom, "coordinates");
      break;
    case MULTI_POINT:
      g.group(lintMultiPoint, geom, "coordinates");
      break;
    case LINE_STRING:
      g.group(lintLineString, geom, "coordinates");
      break;
    case MULTI_LINE_STRING:
      g.group(lintMultiLineString, geom, "coordinates");
      break;
    case POLYGON:
      g.group(lintPolygon, geom, "coordinates");
      break;
    case MULTI_POLYGON:
      g.group(lintMultiPolygon, geom, "coordinates");
      break;
    case GEOMETRY_COLLECTION: {
      g.check(noParentCollection, geom);
      if (isError(g.check(geometriesIsArray, geom, "geometries"))) break;
      g.checkAll("geometries", lintGeometry, geom.geometries as unknown[], {
        segment: "geometries",
      });
      break;
    }
  }

  return g.build();
}
