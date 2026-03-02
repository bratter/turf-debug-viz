/**
 * Bounding box lints.
 */

import type { GeoJSON } from "geojson";
import type { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
import { Severity } from "./types.ts";
import { resultGroup, isError } from "./builder.ts";
import {
  makeArrayLint,
  EPSILON,
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

const bboxDimensionality: Lint<number[]> = {
  name: "bbox-dimensionality",
  description:
    "A bounding box MUST be an array of length 2*n where n is the coordinate dimensionality (RFC7946 5)",
  tag: "Geometry",
  test(target, ctx) {
    try {
      let parent = ctx.scope.parent as GeoJSON;

      // Special case to get the parent to a geometry from a feature
      if (parent.type === FEATURE_COLLECTION) {
        // Try to find the first feature with a non-null geometry - we use this
        // one whether it is valid or not and just error out later if it isn't
        const fWithGeom = parent.features.find((f) => f.geometry !== null);
        // If all the geometries are null or there are none, the lint passes
        if (!fWithGeom) return ok();
        parent = fWithGeom.geometry!;
      } else if (parent.type === FEATURE) {
        // If feature has a null geometry, the lint passes
        if (parent.geometry === null) return ok();
        parent = parent.geometry;
      }

      // Special case to get a geometry collection to a geometry type - has to be
      // done after parent reassignment from features
      if (parent.type === GEOMETRY_COLLECTION) {
        parent = parent.geometries[0]!;
      }

      // Now work on the geometries to get the comparison position
      let cmp: unknown;
      switch (parent.type) {
        case POINT:
          // Point is a position
          cmp = parent.coordinates;
          break;
        case MULTI_POINT:
        case LINE_STRING:
          // Array of positions
          cmp = parent.coordinates[0];
          break;
        case MULTI_LINE_STRING:
        case POLYGON:
          cmp = parent.coordinates[0]?.[0];
          break;
        case MULTI_POLYGON:
          cmp = parent.coordinates[0]?.[0]?.[0];
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
    } catch {
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

/** Check if a published bbox crosses the antimeridian (west > east). */
function isAntimeridian(bbox: number[]): boolean {
  const half = bbox.length / 2;
  return bbox[0]! > bbox[half]!;
}

const bboxAntimeridian: Lint<number[]> = {
  name: "bbox-antimeridian",
  description: "Bbox crosses the antimeridian (west > east) (RFC7946 5)",
  tag: "Geometry",
  test(target) {
    if (isAntimeridian(target)) {
      const half = target.length / 2;
      return info(
        `Bbox crosses the antimeridian: west=${target[0]}, east=${target[half]}`,
      );
    }
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

/** Shift negative longitudes into [180, 360) to enable antimeridian-aware comparison. */
function shiftLng(x: number): number {
  return x < 0 ? x + 360 : x;
}

/** Convert shifted longitude back to [-180, 180]. */
function unshiftLng(x: number): number {
  return x > 180 ? x - 360 : x;
}

/** Mutable bounding box accumulator. */
export interface BboxAcc {
  xMin: number;
  xMax: number;
  /** Min longitude in shifted space (negative lngs + 360) for antimeridian handling */
  xMinS: number;
  /** Max longitude in shifted space (negative lngs + 360) for antimeridian handling */
  xMaxS: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  has3D: boolean;
  count: number;
}

function createBboxAcc(): BboxAcc {
  return {
    xMin: Infinity,
    xMax: -Infinity,
    xMinS: Infinity,
    xMaxS: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
    zMin: Infinity,
    zMax: -Infinity,
    has3D: false,
    count: 0,
  };
}

/** Expand accumulator with a single position. Throws if position is too short or dimensionality changes. */
function expandAcc(acc: BboxAcc, pos: number[]): void {
  if (pos.length < 2) throw new Error("Position must have at least 2 elements");
  const is3D = pos.length >= 3;
  if (acc.count === 0) {
    acc.has3D = is3D;
  } else if (acc.has3D !== is3D) {
    throw new Error("Mixed 2D/3D positions");
  }
  const x = pos[0]!,
    y = pos[1]!;
  if (x < acc.xMin) acc.xMin = x;
  if (x > acc.xMax) acc.xMax = x;
  const xs = shiftLng(x);
  if (xs < acc.xMinS) acc.xMinS = xs;
  if (xs > acc.xMaxS) acc.xMaxS = xs;
  if (y < acc.yMin) acc.yMin = y;
  if (y > acc.yMax) acc.yMax = y;
  if (is3D) {
    const z = pos[2]!;
    if (z < acc.zMin) acc.zMin = z;
    if (z > acc.zMax) acc.zMax = z;
  }
  acc.count++;
}

/**
 * Compute the actual bounding box from a GeoJSON parent object.
 *
 * Assumes the parent is well-formed GeoJSON and throws on bad structure
 * (missing coordinates, short positions, mixed dimensionality, etc.).
 * Callers should catch.
 */
export function computeActualBbox(parent: GeoJSON, acc?: BboxAcc): BboxAcc {
  if (!acc) acc = createBboxAcc();

  switch (parent.type) {
    case FEATURE_COLLECTION:
      for (const f of parent.features) computeActualBbox(f, acc);
      break;
    case FEATURE:
      if (parent.geometry !== null) computeActualBbox(parent.geometry, acc);
      break;
    case GEOMETRY_COLLECTION:
      for (const g of parent.geometries) computeActualBbox(g, acc);
      break;
    case POINT:
      expandAcc(acc, parent.coordinates);
      break;
    case MULTI_POINT:
    case LINE_STRING:
      for (const pos of parent.coordinates) expandAcc(acc, pos);
      break;
    case MULTI_LINE_STRING:
    case POLYGON:
      for (const ring of parent.coordinates)
        for (const pos of ring) expandAcc(acc, pos);
      break;
    case MULTI_POLYGON:
      for (const poly of parent.coordinates)
        for (const ring of poly) for (const pos of ring) expandAcc(acc, pos);
      break;
  }
  return acc;
}

/** Format an accumulator as a non-AM-crossing bbox (4 or 6 elements). */
export function accToBbox(acc: BboxAcc): number[] {
  if (acc.has3D)
    return [acc.xMin, acc.yMin, acc.zMin, acc.xMax, acc.yMax, acc.zMax];
  return [acc.xMin, acc.yMin, acc.xMax, acc.yMax];
}

/** Format an accumulator as an AM-crossing bbox (west > east when data spans the antimeridian). */
export function accToAmBbox(acc: BboxAcc): number[] {
  const west = unshiftLng(acc.xMinS);
  const east = unshiftLng(acc.xMaxS);
  if (acc.has3D) return [west, acc.yMin, acc.zMin, east, acc.yMax, acc.zMax];
  return [west, acc.yMin, east, acc.yMax];
}

/** Compute both bbox representations and their widths from an accumulator. */
export function bothBboxes(acc: BboxAcc) {
  const normal = accToBbox(acc);
  const amCrossing = accToAmBbox(acc);
  const normalWidth = acc.xMax - acc.xMin;
  const shiftedWidth = acc.xMaxS - acc.xMinS;
  return { acc, normal, amCrossing, normalWidth, shiftedWidth };
}

const bboxTooSmall: Lint<number[]> = {
  name: "bbox-too-small",
  description: "All coordinates MUST fall within the bounding box (RFC7946 5)",
  tag: "Geometry",
  test(target, ctx) {
    const bboxData = ctx.scope.bbox as
      | ReturnType<typeof bothBboxes>
      | undefined;
    if (!bboxData) return skip();

    const { acc, normal, amCrossing } = bboxData;

    if (acc.count === 0) return info("No positions found in geometry");

    const half = target.length / 2;
    const pubSouth = target[1]!,
      pubNorth = target[half + 1]!;

    // Longitude containment: compare in shifted space for AM-crossing published bboxes,
    // normal space otherwise
    let xTooSmall: boolean;
    const isAM = isAntimeridian(target);
    if (isAM) {
      const pubWestS = shiftLng(target[0]!);
      const pubEastS = shiftLng(target[half]!);
      xTooSmall =
        acc.xMinS < pubWestS - EPSILON || acc.xMaxS > pubEastS + EPSILON;
    } else {
      xTooSmall =
        acc.xMin < target[0]! - EPSILON || acc.xMax > target[half]! + EPSILON;
    }

    const tooSmall =
      xTooSmall ||
      acc.yMin < pubSouth - EPSILON ||
      acc.yMax > pubNorth + EPSILON ||
      (target.length === 6 &&
        acc.has3D &&
        (acc.zMin < target[2]! - EPSILON || acc.zMax > target[5]! + EPSILON));

    if (tooSmall)
      return [
        Severity.Error,
        `Published bbox does not contain all coordinates; actual bbox${isAM ? " (AM crossing)" : ""} is [${isAM ? amCrossing : normal}]`,
        isAM ? amCrossing : normal,
      ];
    return ok();
  },
};

const bboxTooLarge: Lint<number[]> = {
  name: "bbox-too-large",
  description:
    "A bounding box significantly larger than the data may indicate an error",
  tag: "Geometry",
  test(target, ctx) {
    const bboxData = ctx.scope.bbox as
      | ReturnType<typeof bothBboxes>
      | undefined;
    if (!bboxData) return skip();

    const { acc, normal, amCrossing, normalWidth, shiftedWidth } = bboxData;

    if (acc.count === 0) return info("No positions found in geometry");

    const half = target.length / 2;
    const isAM = isAntimeridian(target);
    // Published width: for AM-crossing bboxes, add 360 to get the actual span
    const pubWidth = isAM
      ? target[half]! - target[0]! + 360
      : target[half]! - target[0]!;
    const pubHeight = target[half + 1]! - target[1]!;

    // Compare against the same representation type as the published bbox
    const actualWidth = isAM ? shiftedWidth : normalWidth;
    const actualHeight = acc.yMax - acc.yMin;

    // Return the bbox that matches the published bbox type
    const realBbox = isAM ? amCrossing : normal;

    // For zero-area geometries (points/lines), compare max dimension ratio
    if (actualWidth < EPSILON && actualHeight < EPSILON) {
      // Point-like: any non-zero published bbox is oversized
      if (pubWidth > EPSILON || pubHeight > EPSILON)
        return [
          Severity.Info,
          `Bbox has non-zero area but geometry is point-like; actual bbox is [${realBbox}]`,
          realBbox,
        ];
      return ok();
    }

    if (actualWidth < EPSILON || actualHeight < EPSILON) {
      // Line-like (zero in one dimension): compare the non-zero dimension
      const pubExtent = Math.max(pubWidth, pubHeight);
      const actualExtent = Math.max(actualWidth, actualHeight);
      if (pubExtent > 2 * actualExtent)
        return [
          Severity.Info,
          `Bbox extent is ${(pubExtent / actualExtent).toFixed(1)}x the data extent; actual bbox is [${realBbox}]`,
          realBbox,
        ];
      return ok();
    }

    // 2D area comparison
    const pubArea = pubWidth * pubHeight;
    const actualArea = actualWidth * actualHeight;

    if (pubArea > 2 * actualArea)
      return [
        Severity.Info,
        `Bbox area is ${(pubArea / actualArea).toFixed(1)}x the data extent; actual bbox is [${realBbox}]`,
        realBbox,
      ];
    return ok();
  },
};

const bboxSuboptimalSpan: Lint<number[]> = {
  name: "bbox-suboptimal-span",
  description:
    "Bbox should use the narrower longitude representation when data crosses the antimeridian",
  tag: "Geometry",
  test(target, ctx) {
    const bboxData = ctx.scope.bbox as
      | ReturnType<typeof bothBboxes>
      | undefined;
    if (!bboxData) return skip();

    const { acc, normal, amCrossing, normalWidth, shiftedWidth } = bboxData;

    if (acc.count === 0) return skip();

    // If both representations have the same width, either is fine
    if (Math.abs(normalWidth - shiftedWidth) < EPSILON) return ok();

    const pubIsAM = isAntimeridian(target);
    const shouldBeAM = shiftedWidth < normalWidth;

    if (pubIsAM !== shouldBeAM) {
      const better = shouldBeAM ? amCrossing : normal;
      return [
        Severity.Warn,
        `Bbox uses a wider longitude span than necessary; narrower bbox is the ${shouldBeAM ? "AM crossing" : "standard"} one: [${better}]`,
        better,
      ];
    }
    return ok();
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

  // Pre-compute actual bbox data for the sizing/span lints
  try {
    ctx.scope.bbox = bothBboxes(computeActualBbox(ctx.scope.parent as GeoJSON));

    const tooSmallSev = g.check(bboxTooSmall, nums);
    const tooLargeSev = g.check(bboxTooLarge, nums);

    // Only check span orientation if the bbox is roughly the right size
    if (tooSmallSev < Severity.Info && tooLargeSev < Severity.Info) {
      g.check(bboxSuboptimalSpan, nums);
    }
  } catch {
    // Leave unset; just skip lints
  }

  return g.build();
}
