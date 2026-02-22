/**
 * LineString and MultiLineString geometry lints.
 */

import {
  Severity,
  type Lint,
  type LintContext,
  type LintResultGroup,
  type Path,
} from "./types.ts";
import { resultGroup, isError } from "./builder.ts";
import { makeArrayLint, EPSILON, ok, warn, error } from "./helpers.ts";
import { lintPosition } from "./position.ts";

const lineIsArray = makeArrayLint("line", { ref: "RFC7946 3.1.4" });
const coordinatesIsArray = makeArrayLint("coordinates", {
  ref: "RFC7946 3.1.5",
});

export const duplicatePositions: Lint<number[][]> = {
  name: "duplicate-positions",
  description:
    "Consecutive identical positions are redundant and may indicate an error",
  tag: "Geometry",
  test(target) {
    const dupes: number[] = [];
    for (let i = 1; i < target.length; i++) {
      const prev = target[i - 1]!;
      const cur = target[i]!;
      if (prev.length === cur.length && prev.every((v, j) => v === cur[j])) {
        dupes.push(i);
      }
    }
    if (dupes.length > 0)
      return [
        Severity.Warn,
        `${dupes.length} duplicate consecutive position(s)`,
        dupes,
      ];
    return ok();
  },
};

const lineDegenerate: Lint<number[][]> = {
  name: "line-degenerate",
  description: "A LineString with zero extent is degenerate",
  tag: "Geometry",
  test(target) {
    if (target.length === 0) return ok();
    let xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity;
    for (const pos of target) {
      if (pos[0]! < xMin) xMin = pos[0]!;
      if (pos[0]! > xMax) xMax = pos[0]!;
      if (pos[1]! < yMin) yMin = pos[1]!;
      if (pos[1]! > yMax) yMax = pos[1]!;
    }
    if (xMax - xMin < EPSILON && yMax - yMin < EPSILON)
      return warn("All positions are identical or within epsilon");
    return ok();
  },
};

const lineMinLength: Lint<unknown[]> = {
  name: "line-min-length",
  description: "A LineString MUST have 2 or more positions (RFC7946 3.1.4)",
  tag: "Geometry",
  test(target) {
    if (target.length < 2)
      return error(`Expected at least 2 positions, received ${target.length}`);
    return ok();
  },
};

export function lintLineString(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("line", ctx, path);
  if (isError(g.check(lineIsArray, target))) return g.build();
  const arr = target as unknown[];
  g.checkAll("positions", lintPosition, arr);

  // Geometry checks require valid structure
  if (g.hasSchemaError()) return g.build();

  g.check(lineMinLength, arr);
  g.check(duplicatePositions, arr as number[][]);
  g.check(lineDegenerate, arr as number[][]);

  return g.build();
}

export function lintMultiLineString(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("multi-line-string", ctx, path);
  if (isError(g.check(coordinatesIsArray, target))) return g.build();
  g.checkAll("lines", lintLineString, target as unknown[]);

  return g.build();
}
