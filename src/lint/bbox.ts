/**
 * Bounding box lint helper.
 */

import type { GeoJSON } from "geojson";
import type { LintResultGroup, Path } from "./types.ts";
import { resultGroup } from "./builder.ts";

// TODO: Build bbox lint
export function lintBbox(
  gj: GeoJSON,
  path: Path = [],
): LintResultGroup | undefined {
  if (gj.bbox === undefined) return undefined;
  const g = resultGroup("bbox", path, "bbox");

  return g.build();
}
