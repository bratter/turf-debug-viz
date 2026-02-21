/**
 * MultiPoint geometry lint.
 */

import type { LintContext, LintResultGroup, Path } from "./types.ts";
import { resultGroup, isError } from "./builder.ts";
import { makeArrayLint } from "./helpers.ts";
import { lintPosition } from "./position.ts";

const coordinatesIsArray = makeArrayLint("coordinates", {
  ref: "RFC7946 3.1.3",
});

export function lintMultiPoint(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("multi-point", ctx, path);
  if (isError(g.check(coordinatesIsArray, target))) return g.build();
  g.checkAll("positions", lintPosition, target as unknown[]);
  return g.build();
}
