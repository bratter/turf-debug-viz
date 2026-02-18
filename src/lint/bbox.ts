/**
 * Bounding box lints.
 */

import type { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
import { Severity } from "./types.ts";
import { resultGroup } from "./builder.ts";
import { isRecord, makeArrayLint } from "./helpers.ts";
import {
  FEATURE,
  FEATURE_COLLECTION,
  GEOMETRY_COLLECTION,
  LINE_STRING,
  MULTI_LINE_STRING,
  MULTI_POINT,
  MULTI_POLYGON,
  POINT,
  POLYGON,
} from "./const.ts";

const bboxIsArray = makeArrayLint("bbox", { ref: "RFC7946 5" });

const bboxLength: Lint<unknown[]> = {
  name: "bbox-length",
  description: "A bbox MUST have 4 or 6 elements (RFC7946 5)",
  severity: Severity.Error,
  tag: "Schema",
  test(target) {
    const len = target.length;
    if (len !== 4 && len !== 6) {
      return `Expected 4 or 6 elements, received ${len}`;
    }
    return true;
  },
};

const bboxElements: Lint<unknown[]> = {
  name: "bbox-elements",
  description: "All bbox elements MUST be numbers (RFC7946 5)",
  severity: Severity.Error,
  tag: "Schema",
  test(target) {
    const bad = target
      .map((v, i) => [v, i])
      .filter(([v]) => typeof v !== "number");
    if (bad.length > 0) {
      const details = bad.map(([v, i]) => `[${i}]: ${typeof v}`).join(", ");
      return `Non-numeric elements: ${details}`;
    }
    return true;
  },
};

// TODO: Strongly consider simplyfing this to cast to GeoJSON and wrap in a
// try-catch, then can just return false in the error branch
// TODO: Consider writing more tests for this
const bboxDimensionality: Lint<number[]> = {
  name: "bbox-dimensionality",
  description:
    "A bounding box MUST be an array of length 2*n where n is the coordinate dimensionality (RFC7946 5)",
  severity: Severity.Error,
  tag: "Schema",
  test(target, ctx) {
    // Any error state where we can't get the first valid coordinate except
    // where a Feature has a null geometry is an error
    let parent = ctx.scope.parent;
    if (!isRecord(parent)) return false;

    // Special case to get the parent to a geometry from a feature
    if (parent.type === FEATURE_COLLECTION) {
      // Try to find the first feature with a non-null geometry - we use this
      // one whether it is valid or not and just error out later if it isn't
      if (Array.isArray(parent.features)) {
        const fWithGeom = parent.features.find((f) => f.geometry !== null);
        if (fWithGeom) parent = fWithGeom?.geometry;
        // If all the geometries are null or there are none, the lint passes
        else return true;
      } else {
        return true;
      }
    } else if (parent.type === FEATURE) {
      parent = parent.geometry;
      // If feature has a null geometry, the lint passes
      if (parent === null) return true;
    }

    // Retest as we may have reassigned
    if (!isRecord(parent)) return false;

    // Special case to get a geometry collection to a geometry type - has to be
    // done after parent reassignment from features
    if (parent.type === GEOMETRY_COLLECTION) {
      if (Array.isArray(parent.geometries)) {
        parent = parent.geometries[0];
      }
    }

    // Retest as we may have reassigned, then get coordinates
    if (!isRecord(parent)) return false;
    const coords = parent.coordinates;
    if (!Array.isArray(coords)) return false;

    // Now work on the geometries to get the comparison position
    let cmp: unknown;
    switch (parent.type) {
      case POINT:
        // Point is a position
        cmp = coords;
        break;
      case MULTI_POINT:
      case LINE_STRING:
        // Array of positions
        cmp = coords[0];
        break;
      case MULTI_LINE_STRING:
      case POLYGON:
        cmp = coords[0]?.[0];
        break;
      case MULTI_POLYGON:
        cmp = coords[0]?.[0]?.[0];
        break;
      default:
        // Abort if we don't have a valid geometry
        // This includes nested geometry collections
        return false;
    }

    // Abandon if we don't happen to have a valid position - this will usually
    // give a point when the first geometry is valid (and therefore might not)
    // be any other errors, but it will miss empty multipoints inside a
    // collection. We don't audit anything about the cmp position or bbox as
    // that info is all covered in other lints. We choose to pass if cmp length
    // is > 3 and bbox length is 3 - this will warn elsewhere.
    if (Array.isArray(cmp) && cmp.length >= 2) {
      if (
        2 * cmp.length === target.length ||
        (cmp.length > 3 && target.length === 6)
      )
        return true;
      else
        return `Bbox is not 2*n the first coordinate, coordinate dim is ${cmp.length}, bbox dim is ${target.length}`;
    } else {
      return false;
    }
  },
};

export function lintBbox(
  bbox: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup | undefined {
  // Optional bboxes are ok, just skip linting
  if (bbox === undefined) return;
  const g = resultGroup("bbox", ctx, path);

  if (!g.check(bboxIsArray, bbox)) return g.build();
  g.check(bboxLength, bbox as unknown[]);
  g.check(bboxElements, bbox as unknown[]);
  g.check(bboxDimensionality, bbox as number[]);

  return g.build();
}
