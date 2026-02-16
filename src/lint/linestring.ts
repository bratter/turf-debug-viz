/**
 * LineString and MultiLineString geometry lints.
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

const lineIsArray = makeArrayLint("line", { ref: "RFC7946 3.1.4" });
const coordinatesIsArray = makeArrayLint("coordinates", {
  ref: "RFC7946 3.1.5",
});

export function lintLine(
  target: unknown,
  ctx: LintContext = {},
  path: Path = [],
): LintResultGroup {
  const g = resultGroup("line", ctx, path);
  if (!g.check(lineIsArray, target)) return g.build();
  g.checkAll("positions", lintPosition, target as unknown[], { quiet: true });
  return g.build();
}

export function lintLineString(
  g: ResultGroupBuilder,
  geom: Record<string, unknown>,
): void {
  g.add(lintLine(geom.coordinates, g.ctx, [...g.path, "coordinates"]));
}

export function lintMultiLineString(
  g: ResultGroupBuilder,
  geom: Record<string, unknown>,
): void {
  if (!g.check(coordinatesIsArray, geom.coordinates, "coordinates")) return;
  g.checkAll("lines", lintLine, geom.coordinates as unknown[], {
    quiet: true,
    segment: "coordinates",
  });
}
