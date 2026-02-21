/**
 * Bounding box lints.
 */

import type { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
import { resultGroup, isError } from "./builder.ts";
import {
  isRecord,
  makeArrayLint,
  skip,
  ok,
  info,
  warn,
  error,
} from "./helpers.ts";
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
  tag: "Schema",
  test(target) {
    const len = target.length;
    if (len !== 4 && len !== 6) {
      return error(`Expected 4 or 6 elements, received ${len}`);
    }
    return ok();
  },
};

const bboxElements: Lint<unknown[]> = {
  name: "bbox-elements",
  description: "All bbox elements MUST be numbers (RFC7946 5)",
  tag: "Schema",
  test(target) {
    const bad = target
      .map((v, i) => [v, i])
      .filter(([v]) => typeof v !== "number");
    if (bad.length > 0) {
      const details = bad.map(([v, i]) => `[${i}]: ${typeof v}`).join(", ");
      return error(`Non-numeric elements: ${details}`);
    }
    return ok();
  },
};

// TODO: Strongly consider simplyfing this to cast to GeoJSON and wrap in a
// try-catch, then can just return false in the error branch
// TODO: Consider writing more tests for this
const bboxDimensionality: Lint<number[]> = {
  name: "bbox-dimensionality",
  description:
    "A bounding box MUST be an array of length 2*n where n is the coordinate dimensionality (RFC7946 5)",
  tag: "Geometry",
  test(target, ctx) {
    // Any error state where we can't get the first valid coordinate except
    // where a Feature has a null geometry is an error
    let parent = ctx.scope.parent;
    if (!isRecord(parent)) return skip();

    // Special case to get the parent to a geometry from a feature
    if (parent.type === FEATURE_COLLECTION) {
      // Try to find the first feature with a non-null geometry - we use this
      // one whether it is valid or not and just error out later if it isn't
      if (Array.isArray(parent.features)) {
        const fWithGeom = parent.features.find((f) => f.geometry !== null);
        if (fWithGeom) parent = fWithGeom?.geometry;
        // If all the geometries are null or there are none, the lint passes
        else return ok();
      } else {
        return ok();
      }
    } else if (parent.type === FEATURE) {
      parent = parent.geometry;
      // If feature has a null geometry, the lint passes
      if (parent === null) return ok();
    }

    // Retest as we may have reassigned
    if (!isRecord(parent)) return skip();

    // Special case to get a geometry collection to a geometry type - has to be
    // done after parent reassignment from features
    if (parent.type === GEOMETRY_COLLECTION) {
      if (Array.isArray(parent.geometries)) {
        parent = parent.geometries[0];
      }
    }

    // Retest as we may have reassigned, then get coordinates
    if (!isRecord(parent)) return skip();
    const coords = parent.coordinates;
    if (!Array.isArray(coords)) return skip();

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
        return skip();
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
        return ok();
      else
        return error(
          `Bbox is not 2*n the first coordinate, coordinate dim is ${cmp.length}, bbox dim is ${target.length}`,
        );
    } else {
      return skip();
    }
  },
};

const bboxLongitudeRange: Lint<number[]> = {
  name: "bbox-longitude-range",
  description: "Bbox longitudes MUST be in [-180, 180] (RFC7946 5)",
  tag: "Geometry",
  test(target) {
    const half = target.length / 2;
    const west = target[0]!,
      east = target[half]!;
    const bad: string[] = [];
    if (west < -180 || west > 180) bad.push(`west=${west}`);
    if (east < -180 || east > 180) bad.push(`east=${east}`);
    if (bad.length > 0)
      return error(`Longitude out of [-180, 180]: ${bad.join(", ")}`);
    return ok();
  },
};

const bboxLatitudeRange: Lint<number[]> = {
  name: "bbox-latitude-range",
  description: "Bbox latitudes MUST be in [-90, 90] (RFC7946 5)",
  tag: "Geometry",
  test(target) {
    const half = target.length / 2;
    const south = target[1]!,
      north = target[half + 1]!;
    const bad: string[] = [];
    if (south < -90 || south > 90) bad.push(`south=${south}`);
    if (north < -90 || north > 90) bad.push(`north=${north}`);
    if (bad.length > 0)
      return error(`Latitude out of [-90, 90]: ${bad.join(", ")}`);
    return ok();
  },
};

const bboxLatitudeOrder: Lint<number[]> = {
  name: "bbox-latitude-order",
  description: "South latitude MUST NOT exceed north latitude (RFC7946 5)",
  tag: "Geometry",
  test(target) {
    const half = target.length / 2;
    const south = target[1]!,
      north = target[half + 1]!;
    if (south > north)
      return error(
        `South latitude (${south}) exceeds north latitude (${north})`,
      );
    return ok();
  },
};

const bboxAntimeridian: Lint<number[]> = {
  name: "bbox-antimeridian",
  description: "Bbox crosses the antimeridian (west > east) (RFC7946 5)",
  tag: "Geometry",
  test(target) {
    const half = target.length / 2;
    const west = target[0]!,
      east = target[half]!;
    if (west > east)
      return info(`Bbox crosses the antimeridian: west=${west}, east=${east}`);
    return skip();
  },
};

const bboxPolarCap: Lint<number[]> = {
  name: "bbox-polar-cap",
  description:
    "Full polar cap bounding boxes SHOULD use -180/180 longitude (RFC7946 5)",
  tag: "Geometry",
  test(target) {
    const half = target.length / 2;
    const west = target[0]!,
      south = target[1]!;
    const east = target[half]!,
      north = target[half + 1]!;
    if (south !== -90 && north !== 90) return skip(); // not polar
    if (Math.abs(east - west) < 360) return skip(); // partial polar region
    if (west === -180 && east === 180) return skip(); // correct canonical form
    return warn(
      `Polar cap bbox should use west=-180, east=180; got west=${west}, east=${east}`,
    );
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

  if (isError(g.check(bboxIsArray, bbox))) return g.build();
  const arr = bbox as unknown[];
  g.check(bboxLength, arr);
  g.check(bboxElements, arr);

  // Geometry lints require basic structure correctness
  if (g.hasSchemaError()) return g.build();

  const nums = arr as number[];
  g.check(bboxDimensionality, nums);
  g.check(bboxLongitudeRange, nums);
  g.check(bboxLatitudeRange, nums);
  g.check(bboxLatitudeOrder, nums);
  g.check(bboxAntimeridian, nums);
  g.check(bboxPolarCap, nums);

  return g.build();
}
