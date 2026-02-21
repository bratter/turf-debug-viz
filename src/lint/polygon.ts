/**
 * Polygon and MultiPolygon geometry lints.
 */

import type { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
import { Severity } from "./types.ts";
import { resultGroup, isError } from "./builder.ts";
import { makeArrayLint, skip, ok, warn, error } from "./helpers.ts";
import { lintPosition } from "./position.ts";

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
    if (area === 0) return warn(`Degenerate area, could not determine winding`);
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
    if (area === 0) return warn(`Degenerate area, could not determine winding`);
    const actual = area > 0 ? CCW : CW;
    if (actual !== CW)
      return error(`Expected clockwise winding, got ${actual}`);
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

  // Only continue if we have a structurally valid linear ring
  if (g.hasMaxSeverityOf()) return g.build();

  const ringIndex = path[path.length - 1];
  const ring = arr as number[][];
  if (ringIndex === 0) g.check(ringWindingExterior, ring);
  else g.check(ringWindingInterior, ring);

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
