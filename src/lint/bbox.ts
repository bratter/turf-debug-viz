/**
 * Bounding box lint helper.
 */

import type { LintResultGroup, Path } from "./types.ts";
import { resultGroup } from "./builder.ts";

// TODO: Build bbox lint
export function lintBbox(
  bbox: unknown,
  path: Path = [],
): LintResultGroup | undefined {
  if (bbox === undefined) return;
  const g = resultGroup("bbox", path, "bbox");

  return g.build();
}
