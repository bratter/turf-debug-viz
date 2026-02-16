/**
 * LineString and MultiLineString geometry lints.
 */

import type { LintContext, LintResultGroup, Path } from "./types.ts";
import { resultGroup } from "./builder.ts";
import { makeArrayLint } from "./helpers.ts";
import { lintPosition } from "./position.ts";

const lineIsArray = makeArrayLint("line", { ref: "RFC7946 3.1.4" });
const coordinatesIsArray = makeArrayLint("coordinates", {
  ref: "RFC7946 3.1.5",
});

export function lintLineString(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("line", ctx, path);
  if (!g.check(lineIsArray, target)) return g.build();
  g.checkAll("positions", lintPosition, target as unknown[], { quiet: true });
  return g.build();
}

export function lintMultiLineString(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("MultiLineString", ctx, path);
  if (!g.check(coordinatesIsArray, target)) return g.build();
  g.checkAll("lines", lintLineString, target as unknown[]);
  return g.build();
}
