/**
 * Polygon and MultiPolygon geometry lints.
 */

import type { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
import { Severity } from "./types.ts";
import { resultGroup, isError } from "./builder.ts";
import { makeArrayLint, EPSILON, skip, ok, warn, error } from "./helpers.ts";
import { lintPosition } from "./position.ts";
import { duplicatePositions } from "./linestring.ts";

const ringIsArray = makeArrayLint("ring", { ref: "RFC7946 3.1.6" });
const polygonCoordsIsArray = makeArrayLint("coordinates", {
  ref: "RFC7946 3.1.6",
});
const multiPolygonCoordsIsArray = makeArrayLint("coordinates", {
  ref: "RFC7946 3.1.7",
});

const ringMinLength: Lint<unknown[]> = {
  name: "ring-min-length",
  description: "A linear ring MUST have 4 or more positions (RFC7946 3.1.6)",
  tag: "Geometry",
  test(target) {
    if (target.length < 4)
      return error(`Expected at least 4 positions, received ${target.length}`);
    return ok();
  },
};

const ringClosed: Lint<unknown[]> = {
  name: "ring-closed",
  description: "First and last positions MUST be equivalent (RFC7946 3.1.6)",
  tag: "Geometry",
  test(target) {
    const first = target[0];
    const last = target[target.length - 1];
    if (!Array.isArray(first) || !Array.isArray(last)) return skip();
    if (first.length !== last.length) {
      return error(
        `First position has ${first.length} elements, last has ${last.length}`,
      );
    }
    for (let i = 0; i < first.length; i++) {
      if (first[i] !== last[i]) {
        return error(`Ring is not closed: first=[${first}], last=[${last}]`);
      }
    }
    return ok();
  },
};

/** Signed area via shoelace formula. Positive = CCW, negative = CW. */
function signedArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i]![0]! * ring[i + 1]![1]! - ring[i + 1]![0]! * ring[i]![1]!;
  }
  return sum;
}
const CCW = "counterclockwise";
const CW = "clockwise";

const ringWindingExterior: Lint<number[][]> = {
  name: "ring-winding-exterior",
  description: "Exterior rings MUST be counterclockwise (RFC7946 3.1.6)",
  tag: "Geometry",
  test(target) {
    const area = signedArea(target);
    if (Math.abs(area) < EPSILON) return skip();
    const actual = area > 0 ? CCW : CW;
    if (actual !== CCW)
      return error(`Expected counterclockwise winding, got ${actual}`);
    return ok();
  },
};

const ringWindingInterior: Lint<number[][]> = {
  name: "ring-winding-interior",
  description: "Interior rings (holes) MUST be clockwise (RFC7946 3.1.6)",
  tag: "Geometry",
  test(target) {
    const area = signedArea(target);
    if (Math.abs(area) < EPSILON) return skip();
    const actual = area > 0 ? CCW : CW;
    if (actual !== CW)
      return error(`Expected clockwise winding, got ${actual}`);
    return ok();
  },
};

const ringDegenerateArea: Lint<number[][]> = {
  name: "ring-degenerate-area",
  description: "A linear ring with near-zero area is degenerate",
  tag: "Geometry",
  test(target) {
    if (Math.abs(signedArea(target)) < EPSILON)
      return warn("Ring has near-zero area (collinear or coincident positions)");
    return ok();
  },
};

/** Return the cross-product sign of (q-p) x (r-p). */
function orientation(p: number[], q: number[], r: number[]): number {
  return (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!);
}

/** Check if segment (a,b) properly intersects segment (c,d). */
function segmentsIntersect(
  a: number[],
  b: number[],
  c: number[],
  d: number[],
): boolean {
  const d1 = orientation(c, d, a);
  const d2 = orientation(c, d, b);
  const d3 = orientation(a, b, c);
  const d4 = orientation(a, b, d);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
    return true;

  // Collinear overlap cases
  if (d1 === 0 && onSegment(c, d, a)) return true;
  if (d2 === 0 && onSegment(c, d, b)) return true;
  if (d3 === 0 && onSegment(a, b, c)) return true;
  if (d4 === 0 && onSegment(a, b, d)) return true;

  return false;
}

/** Check if point p lies on segment (a,b), given collinearity. */
function onSegment(a: number[], b: number[], p: number[]): boolean {
  return (
    Math.min(a[0]!, b[0]!) <= p[0]! &&
    p[0]! <= Math.max(a[0]!, b[0]!) &&
    Math.min(a[1]!, b[1]!) <= p[1]! &&
    p[1]! <= Math.max(a[1]!, b[1]!)
  );
}

const ringSelfIntersection: Lint<number[][]> = {
  name: "ring-self-intersection",
  description: "A linear ring MUST NOT self-intersect (RFC7946 3.1.6)",
  tag: "Geometry",
  test(target) {
    const n = target.length - 1; // exclude closing duplicate
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        // Skip the pair where the last segment meets the first (they share a vertex)
        if (i === 0 && j === n - 1) continue;
        if (segmentsIntersect(target[i]!, target[i + 1]!, target[j]!, target[j + 1]!)) {
          pairs.push([i, j]);
        }
      }
    }
    if (pairs.length > 0)
      return [
        Severity.Error,
        `${pairs.length} self-intersection(s)`,
        pairs,
      ];
    return ok();
  },
};

export function lintLinearRing(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("ring", ctx, path);
  if (isError(g.check(ringIsArray, target))) return g.build();
  const arr = target as unknown[];

  g.checkAll("positions", lintPosition, arr);

  // Run ring validation after positions are checked
  // The first two don't strictly require schema validity, but we test anyway
  if (g.hasSchemaError()) return g.build();

  g.check(ringMinLength, arr);
  g.check(ringClosed, arr);
  g.check(duplicatePositions, arr as number[][]);

  // Only continue if we have a structurally valid linear ring
  if (g.hasMaxSeverityOf()) return g.build();

  const ring = arr as number[][];
  g.check(ringDegenerateArea, ring);

  const ringIndex = path[path.length - 1];
  if (ringIndex === 0) g.check(ringWindingExterior, ring);
  else g.check(ringWindingInterior, ring);

  g.check(ringSelfIntersection, ring);

  return g.build();
}

export function lintPolygon(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("polygon", ctx, path);
  if (isError(g.check(polygonCoordsIsArray, target))) return g.build();
  g.checkAll("rings", lintLinearRing, target as unknown[]);

  return g.build();
}

export function lintMultiPolygon(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("multi-polygon", ctx, path);
  if (isError(g.check(multiPolygonCoordsIsArray, target))) return g.build();
  g.checkAll("polygons", lintPolygon, target as unknown[]);

  return g.build();
}
