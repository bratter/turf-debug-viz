/**
 * Polygon and MultiPolygon geometry lints.
 */

import type {
  LintContext,
  LintResultGroup,
  Path,
  ResultGroupBuilder,
} from "./types.ts";
import { resultGroup } from "./builder.ts";
import { makeArrayLint } from "./helpers.ts";
import { lintPosition } from "./position.ts";

const ringIsArray = makeArrayLint("ring", { ref: "RFC7946 3.1.6" });
const polygonIsArray = makeArrayLint("polygon", { ref: "RFC7946 3.1.6" });
const coordinatesIsArray = makeArrayLint("coordinates", {
  ref: "RFC7946 3.1.7",
});

export function lintLinearRing(
  target: unknown,
  ctx: LintContext = {},
  path: Path = [],
): LintResultGroup {
  const g = resultGroup("ring", ctx, path);
  if (!g.check(ringIsArray, target)) return g.build();
  g.checkAll("positions", lintPosition, target as unknown[], { quiet: true });
  return g.build();
}

export function lintPolygonCoords(
  target: unknown,
  ctx: LintContext = {},
  path: Path = [],
): LintResultGroup {
  const g = resultGroup("polygon", ctx, path);
  if (!g.check(polygonIsArray, target)) return g.build();
  g.checkAll("rings", lintLinearRing, target as unknown[], { quiet: true });
  return g.build();
}

export function lintPolygon(
  g: ResultGroupBuilder,
  geom: Record<string, unknown>,
): void {
  g.add(lintPolygonCoords(geom.coordinates, g.ctx, [...g.path, "coordinates"]));
}

export function lintMultiPolygon(
  g: ResultGroupBuilder,
  geom: Record<string, unknown>,
): void {
  if (!g.check(coordinatesIsArray, geom.coordinates, "coordinates")) return;
  g.checkAll("polygons", lintPolygonCoords, geom.coordinates as unknown[], {
    quiet: true,
    segment: "coordinates",
  });
}
