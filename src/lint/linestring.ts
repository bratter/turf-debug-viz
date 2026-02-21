/**
 * LineString and MultiLineString geometry lints.
 */

import type { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
import { resultGroup, isError } from "./builder.ts";
import { makeArrayLint, ok, error } from "./helpers.ts";
import { lintPosition } from "./position.ts";

const lineIsArray = makeArrayLint("line", { ref: "RFC7946 3.1.4" });
const coordinatesIsArray = makeArrayLint("coordinates", {
  ref: "RFC7946 3.1.5",
});

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
