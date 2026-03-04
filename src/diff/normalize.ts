import {
  FEATURE,
  FEATURE_COLLECTION,
  GEOMETRY_COLLECTION,
  GEOMETRY_TYPES,
} from "../lint/const.ts";

export interface NormalizeOptions {
  /** Decimal places to round coordinates to. Default: 6. */
  precision?: number;
}

/**
 * Returns a canonical form of the given GeoJSON value. Pure function; input is
 * never mutated. Non-GeoJSON input is returned unchanged.
 *
 * Normalization steps (in order):
 *   1. Round coordinate values to `precision` decimal places
 *   2. Remove duplicate consecutive positions in rings/linestrings
 *   3. Rotate each linear ring to start at its lex-smallest coordinate
 *   4. Sort sub-geometries in Multi* types by their first coordinate
 *   5. Sort features in a FeatureCollection by their geometry's first coordinate
 *
 * Note: winding direction is intentionally NOT normalized (a linting concern).
 */
export function normalizeGeoJSON(
  geojson: unknown,
  opts?: NormalizeOptions,
): unknown {
  const precision = opts?.precision ?? 6;
  return normalizeValue(geojson, precision);
}

// ========================================
// Top-level dispatch
// ========================================

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function normalizeValue(v: unknown, precision: number): unknown {
  if (!isPlainObject(v)) return v;
  const obj = v as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== "string") return v;

  if (type === FEATURE) return normalizeFeature(obj, precision);
  if (type === FEATURE_COLLECTION)
    return normalizeFeatureCollection(obj, precision);
  if (type === GEOMETRY_COLLECTION)
    return normalizeGeometryCollection(obj, precision);
  if ((GEOMETRY_TYPES as readonly string[]).includes(type))
    return normalizeGeometry(obj, precision);
  return v;
}

// ========================================
// Feature / FeatureCollection
// ========================================

function normalizeFeature(
  obj: Record<string, unknown>,
  precision: number,
): Record<string, unknown> {
  return {
    ...obj,
    geometry:
      obj.geometry != null
        ? normalizeValue(obj.geometry, precision)
        : obj.geometry,
  };
}

function normalizeFeatureCollection(
  obj: Record<string, unknown>,
  precision: number,
): Record<string, unknown> {
  if (!Array.isArray(obj.features)) return obj;
  const normalized = obj.features.map((f) => normalizeValue(f, precision));
  return { ...obj, features: sortFeatures(normalized) };
}

function normalizeGeometryCollection(
  obj: Record<string, unknown>,
  precision: number,
): Record<string, unknown> {
  if (!Array.isArray(obj.geometries)) return obj;
  return {
    ...obj,
    geometries: obj.geometries.map((g) => normalizeValue(g, precision)),
  };
}

// ========================================
// Geometry normalization
// ========================================

function normalizeGeometry(
  obj: Record<string, unknown>,
  precision: number,
): Record<string, unknown> {
  const type = obj.type as string;
  const coords = obj.coordinates;

  if (!Array.isArray(coords)) return obj;

  switch (type) {
    case "Point":
      return {
        ...obj,
        coordinates: normalizePos(coords as number[], precision),
      };

    case "MultiPoint":
      return {
        ...obj,
        coordinates: sortByFirstPos(
          (coords as number[][]).map((p) => normalizePos(p, precision)),
        ),
      };

    case "LineString":
      return {
        ...obj,
        coordinates: normalizeLineString(coords as number[][], precision),
      };

    case "MultiLineString":
      return {
        ...obj,
        coordinates: sortByFirstPos(
          (coords as number[][][]).map((ls) =>
            normalizeLineString(ls, precision),
          ),
        ),
      };

    case "Polygon":
      return {
        ...obj,
        coordinates: normalizePolygon(coords as number[][][], precision),
      };

    case "MultiPolygon":
      return {
        ...obj,
        coordinates: sortByFirstPos(
          (coords as number[][][][]).map((poly) =>
            normalizePolygon(poly, precision),
          ),
        ),
      };

    default:
      return obj;
  }
}

// ========================================
// Coordinate operations
// ========================================

function roundToPrec(n: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(n * factor) / factor;
}

function normalizePos(pos: number[], precision: number): number[] {
  return pos.map((n) => roundToPrec(n, precision));
}

function normalizeLineString(ls: number[][], precision: number): number[][] {
  const rounded = ls.map((p) => normalizePos(p, precision));
  return dedupCoords(rounded);
}

function normalizeRing(ring: number[][], precision: number): number[][] {
  const rounded = ring.map((p) => normalizePos(p, precision));
  const deduped = dedupCoords(rounded);
  if (deduped.length < 4) return deduped; // degenerate — preserve as-is
  return rotateRing(deduped);
}

function normalizePolygon(
  rings: number[][][],
  precision: number,
): number[][][] {
  return rings.map((ring) => normalizeRing(ring, precision));
}

/** Remove consecutive duplicate positions. */
function dedupCoords(coords: number[][]): number[][] {
  if (coords.length === 0) return coords;
  const result: number[][] = [coords[0]!];
  for (let i = 1; i < coords.length; i++) {
    if (!posEq(result[result.length - 1]!, coords[i]!)) {
      result.push(coords[i]!);
    }
  }
  return result;
}

function posEq(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Rotate a closed ring so it starts at its lexicographically smallest position
 * (lng first, then lat as tiebreaker).
 */
function rotateRing(ring: number[][]): number[][] {
  // ring is closed: ring[0] coordinate-equals ring[ring.length - 1]
  const open = ring.slice(0, -1);
  let minIdx = 0;
  for (let i = 1; i < open.length; i++) {
    if (comparePosLex(open[i]!, open[minIdx]!) < 0) minIdx = i;
  }
  // Reassemble: positions from minIdx to end, then 0..minIdx-1, re-close with ring[minIdx]
  return [...ring.slice(minIdx, -1), ...ring.slice(0, minIdx), ring[minIdx]!];
}

/** Lexicographic comparison of coordinate arrays (lng first). */
function comparePosLex(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return a.length - b.length;
}

// ========================================
// Sorting helpers
// ========================================

/**
 * Sort an array of coordinate sequences by the first position of each element.
 * Works for: positions[], linestrings[], polygons[] (each a sub-geometry of a Multi* type).
 */
function sortByFirstPos<T extends unknown[]>(items: T[]): T[] {
  return [...items].sort((a, b) => comparePosLex(firstPos(a), firstPos(b)));
}

/** Extract the first position from a coordinate value of arbitrary nesting depth. */
function firstPos(coords: unknown): number[] {
  if (!Array.isArray(coords) || coords.length === 0) return [];
  if (typeof coords[0] === "number") return coords as number[];
  return firstPos(coords[0]);
}

function sortFeatures(features: unknown[]): unknown[] {
  return [...features].sort((a, b) => {
    const pa = featureFirstPos(a);
    const pb = featureFirstPos(b);
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return comparePosLex(pa, pb);
  });
}

function featureFirstPos(feature: unknown): number[] | null {
  if (!isPlainObject(feature)) return null;
  const geom = (feature as Record<string, unknown>).geometry;
  if (geom == null || !isPlainObject(geom)) return null;
  const coords = (geom as Record<string, unknown>).coordinates;
  if (!Array.isArray(coords)) return null;
  const pos = firstPos(coords);
  return pos.length > 0 ? pos : null;
}
