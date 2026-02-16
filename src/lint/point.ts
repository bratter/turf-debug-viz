/**
 * Point and MultiPoint geometry lints.
 */

import type { ResultGroupBuilder } from "./types.ts";
import { makeArrayLint } from "./helpers.ts";
import { lintPosition } from "./position.ts";

const coordinatesIsArray = makeArrayLint("coordinates", {
  ref: "RFC7946 3.1.3",
});

export function lintPoint(
  g: ResultGroupBuilder,
  geom: Record<string, unknown>,
): void {
  g.add(lintPosition(geom.coordinates, [...g.path, "coordinates"]));
}

export function lintMultiPoint(
  g: ResultGroupBuilder,
  geom: Record<string, unknown>,
): void {
  if (!g.check(coordinatesIsArray, geom.coordinates, "coordinates")) return;
  g.checkAll("positions", lintPosition, geom.coordinates as unknown[], {
    quiet: true,
    segment: "coordinates",
  });
}
