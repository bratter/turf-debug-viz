/**
 * Polygon and MultiPolygon geometry lints.
 */

import type { LintContext, LintResultGroup, Path } from "./types.ts";
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
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("ring", ctx, path);
  if (!g.check(ringIsArray, target)) return g.build();
  g.checkAll("positions", lintPosition, target as unknown[], { quiet: true });
  return g.build();
}

export function lintPolygon(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("polygon", ctx, path);
  if (!g.check(polygonIsArray, target)) return g.build();
  g.checkAll("rings", lintLinearRing, target as unknown[]);
  return g.build();
}

export function lintMultiPolygon(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("MultiPolygon", ctx, path);
  if (!g.check(coordinatesIsArray, target)) return g.build();
  g.checkAll("polygons", lintPolygon, target as unknown[]);
  return g.build();
}
