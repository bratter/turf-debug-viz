/**
 * Position lints (RFC7946 3.1.1).
 */

import type { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
import { Severity } from "./types.ts";
import { resultGroup } from "./builder.ts";
import { makeArrayLint } from "./helpers.ts";

const positionIsArray = makeArrayLint("position", { ref: "RFC7946 3.1.1" });

const positionMinLength: Lint = {
  name: "position-min-length",
  description: "A position MUST have at least 2 elements (RFC7946 3.1.1)",
  severity: Severity.Error,
  tag: "Schema",
  test(target: unknown) {
    const len = (target as unknown[]).length;
    if (len < 2)
      return `Expected at least 2 elements (longitude, latitude), received ${len}`;
  },
};

const positionMaxLength: Lint = {
  name: "position-max-length",
  description:
    "A position SHOULD NOT have more than 3 elements (RFC7946 3.1.1)",
  severity: Severity.Warn,
  tag: "Schema",
  test(target: unknown) {
    const len = (target as unknown[]).length;
    if (len > 3)
      return `Positions SHOULD NOT have more than 3 elements (RFC7946 3.1.1), received ${len}`;
  },
};

const positionElement: Lint = {
  name: "position-element-number",
  description: "Each position element MUST be a number (RFC7946 3.1.1)",
  severity: Severity.Error,
  tag: "Schema",
  test(target: unknown) {
    if (typeof target !== "number")
      return `Expected a number, received ${typeof target}`;
  },
};

const DIM_KEY = Symbol("dimensionality");

const positionDimensionality: Lint = {
  name: "position-dimensionality",
  description: "All positions in a geometry MUST have the same dimensionality",
  severity: Severity.Error,
  tag: "Geometry",
  test(target: unknown, ctx) {
    const len = (target as unknown[]).length;
    if (ctx.state[DIM_KEY] === undefined) {
      ctx.state[DIM_KEY] = len;
    } else if (len !== ctx.state[DIM_KEY]) {
      return `Expected ${ctx.state[DIM_KEY]} elements to match other positions, received ${len}`;
    }
  },
};

export function lintPosition(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("position", ctx, path);
  if (!g.check(positionIsArray, target)) return g.build();
  g.check(positionMinLength, target);
  g.check(positionMaxLength, target);
  g.checkAll("elements", positionElement, target as unknown[]);
  g.check(positionDimensionality, target);
  return g.build();
}
