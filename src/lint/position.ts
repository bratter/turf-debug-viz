/**
 * Position lints (RFC7946 3.1.1).
 */

import type { Lint, LintContext, LintResultGroup, Path } from "./types.ts";
import { resultGroup, isError } from "./builder.ts";
import { makeArrayLint, ok, warn, error } from "./helpers.ts";

const positionIsArray = makeArrayLint("position", { ref: "RFC7946 3.1.1" });

const positionMinLength: Lint<unknown[]> = {
  name: "position-min-length",
  description: "A position MUST have at least 2 elements (RFC7946 3.1.1)",
  tag: "Schema",
  test(target) {
    const len = target.length;
    if (len < 2) {
      return error(
        `Expected at least 2 elements (longitude, latitude), received ${len}`,
      );
    }
    return ok();
  },
};

const positionMaxLength: Lint<unknown[]> = {
  name: "position-max-length",
  description:
    "A position SHOULD NOT have more than 3 elements (RFC7946 3.1.1)",
  tag: "Schema",
  test(target) {
    const len = target.length;
    if (len > 3) {
      return warn(
        `Positions SHOULD NOT have more than 3 elements (RFC7946 3.1.1), received ${len}`,
      );
    }
    return ok();
  },
};

const positionElements: Lint<unknown[]> = {
  name: "position-elements",
  description: "All position elements MUST be numbers (RFC7946 3.1.1)",
  tag: "Schema",
  test(target) {
    const arr = target;
    const bad = arr
      .map((v, i) => [v, i] as const)
      .filter(([v]) => typeof v !== "number");

    if (bad.length > 0) {
      const details = bad.map(([v, i]) => `[${i}]: ${typeof v}`).join(", ");
      return error(`Non-numeric elements: ${details}`);
    }
    return ok();
  },
};

const DIM_KEY = Symbol("dimensionality");

const positionDimensionality: Lint<unknown[]> = {
  name: "position-dimensionality",
  description: "All positions in a geometry MUST have the same dimensionality",
  tag: "Geometry",
  test(target, ctx) {
    const len = target.length;
    if (ctx.state[DIM_KEY] === undefined) {
      ctx.state[DIM_KEY] = len;
    } else if (len !== ctx.state[DIM_KEY]) {
      return error(
        `Expected ${ctx.state[DIM_KEY]} elements to match other positions, received ${len}`,
      );
    }
    return ok();
  },
};

const longitudeRange: Lint<number[]> = {
  name: "longitude-range",
  description: "Longitude (index 0) MUST be in [-180, 180] (RFC7946 3.1.1)",
  tag: "Geometry",
  test(target) {
    const lng = target[0]!;
    if (lng < -180 || lng > 180)
      return error(`Longitude ${lng} is outside [-180, 180]`);
    return ok();
  },
};

const latitudeRange: Lint<number[]> = {
  name: "latitude-range",
  description: "Latitude (index 1) MUST be in [-90, 90] (RFC7946 3.1.1)",
  tag: "Geometry",
  test(target) {
    const lat = target[1]!;
    if (lat < -90 || lat > 90)
      return error(`Latitude ${lat} is outside [-90, 90]`);
    return ok();
  },
};

export function lintPosition(
  target: unknown,
  ctx: LintContext,
  path: Path,
): LintResultGroup {
  const g = resultGroup("position", ctx, path);
  if (isError(g.check(positionIsArray, target))) return g.build();
  const arr = target as unknown[];

  g.check(positionMinLength, arr);
  g.check(positionMaxLength, arr);
  g.check(positionElements, arr);
  g.check(positionDimensionality, arr);

  // Geometry lints require valid structure
  if (g.hasSchemaError()) return g.build();

  const pos = arr as number[];
  g.check(longitudeRange, pos);
  g.check(latitudeRange, pos);

  return g.build();
}
