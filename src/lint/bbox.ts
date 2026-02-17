/**
 * Bounding box lints.
 */

import type { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
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

const bboxElements: Lint = {
  name: "bbox-elements",
  description: "All bbox elements MUST be numbers (RFC7946 5)",
  severity: Severity.Error,
  tag: "Schema",
  test(target: unknown) {
    const arr = target as unknown[];
    const bad = arr
      .map((v, i) => [v, i] as const)
      .filter(([v]) => typeof v !== "number");
    if (bad.length > 0) {
      const details = bad.map(([v, i]) => `[${i}]: ${typeof v}`).join(", ");
      return `Non-numeric elements: ${details}`;
    }
  },
};

export function lintBbox(
  bbox: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup | undefined {
  if (bbox === undefined) return;
  const g = resultGroup("bbox", ctx, path);

  if (!g.check(bboxIsArray, bbox)) return g.build();
  g.check(bboxLength, bbox);
  g.check(bboxElements, bbox);

  return g.build();
}
