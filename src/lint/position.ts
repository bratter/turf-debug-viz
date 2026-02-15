/**
 * Position lints (RFC7946 3.1.1).
 */

import type { Lint, LintResultGroup, Path } from "./types.ts";
import { Severity } from "./types.ts";
import { resultGroup } from "./builder.ts";
import { makeArrayLint } from "./helpers.ts";

const positionIsArray = makeArrayLint("position", { ref: "RFC7946 3.1.1" });

const positionMinLength: Lint = {
  name: "position-min-length",
  description:
    "A position MUST have at least 2 elements (RFC7946 3.1.1)",
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

export function lintPosition(
  target: unknown,
  path: Path = [],
): LintResultGroup {
  const g = resultGroup("position", path);
  if (!g.check(positionIsArray, target)) return g.build();
  g.check(positionMinLength, target);
  g.check(positionMaxLength, target);
  g.checkAll(positionElement, target as unknown[]);
  return g.build();
}
