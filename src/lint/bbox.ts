/**
 * Bounding box lints.
 */

import type { Lint, LintResultGroup, Path } from "./types.ts";
import { Severity } from "./types.ts";
import { resultGroup } from "./builder.ts";
import { makeArrayLint } from "./helpers.ts";

const bboxIsArray = makeArrayLint("bbox", { ref: "RFC7946 5" });

const bboxLength: Lint = {
  name: "bbox-length",
  description: "A bbox MUST have 4 or 6 elements (RFC7946 5)",
  severity: Severity.Error,
  tag: "Schema",
  test(target: unknown) {
    const len = (target as unknown[]).length;
    if (len !== 4 && len !== 6)
      return `Expected 4 or 6 elements, received ${len}`;
  },
};

const bboxElement: Lint = {
  name: "bbox-element-number",
  description: "Each bbox element MUST be a number (RFC7946 5)",
  severity: Severity.Error,
  tag: "Schema",
  test(target: unknown) {
    if (typeof target !== "number")
      return `Expected a number, received ${typeof target}`;
  },
};

export function lintBbox(
  bbox: unknown,
  path: Path = [],
): LintResultGroup | undefined {
  if (bbox === undefined) return;
  const g = resultGroup("bbox", path, "bbox");

  if (!g.check(bboxIsArray, bbox)) return g.build();
  g.check(bboxLength, bbox);
  g.checkAll("elements", bboxElement, bbox as unknown[]);

  return g.build();
}
