/**
 * Point and MultiPoint geometry lints.
 */

import type { Path, ResultGroupBuilder } from "./types.ts";
import { resultGroup } from "./builder.ts";
import { makeArrayLint } from "./helpers.ts";
import { lintPosition } from "./position.ts";

const coordinatesIsArray = makeArrayLint("coordinates", {
  ref: "RFC7946 3.1.3",
});

export function lintPoint(
  g: ResultGroupBuilder,
  geom: Record<string, unknown>,
  path: Path,
): void {
  g.add(lintPosition(geom.coordinates, [...path, "coordinates"]));
}

export function lintMultiPoint(
  g: ResultGroupBuilder,
  geom: Record<string, unknown>,
  path: Path,
): void {
  const coords = resultGroup("coordinates", path, "coordinates");
  if (coords.check(coordinatesIsArray, geom.coordinates)) {
    coords.checkAll(lintPosition, geom.coordinates as unknown[]);
  }
  g.add(coords.build());
}
