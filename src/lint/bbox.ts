/**
 * Bounding box lint helper.
 */

import type { GeoJSON } from "geojson";
import type { LintResultGroup, Path } from "./types.ts";
import { resultGroup } from "./builder.ts";

// TODO: Finalize what this should return when there is no bbox
// Could be undefined, LintResult, or LintResultGroup
// TODO: Build bbox lint
export function lintBbox(gj: GeoJSON, path: Path = []): LintResultGroup {
  const g = resultGroup("bbox", path, "bbox");

  return g.build();
}
