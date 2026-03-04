/**
 * Pure geometry diff overlay computation.
 * Client-side only — uses window.turf (browser global).
 */

import type {
  GeoJSON,
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
  Position,
} from "geojson";

// Turf is loaded locally via a script tag
declare const turf: typeof import("@turf/turf");

// Toggle: set to false to disable point displacement connector overlays
const SHOW_POINT_CONNECTORS = true;

// Toggle: set to true when line overlay implementation is added
const SHOW_LINE_OVERLAY = false;

type PrimaryGeomType = "polygon" | "point" | "line";

function getPrimaryGeomType(gj: GeoJSON): PrimaryGeomType | null {
  switch (gj.type) {
    case "Point":
    case "MultiPoint":
      return "point";
    case "LineString":
    case "MultiLineString":
      return "line";
    case "Polygon":
    case "MultiPolygon":
      return "polygon";
    case "Feature":
      if (gj.geometry === null) return null;
      return getPrimaryGeomType(gj.geometry);
    case "FeatureCollection": {
      const types = new Set(
        gj.features
          .map((f) => (f.geometry ? getPrimaryGeomType(f.geometry) : null))
          .filter((t): t is PrimaryGeomType => t !== null),
      );
      if (types.size === 0) return null;
      if (types.size === 1) return [...types][0]!;
      return null; // Mixed geometry types → incompatible
    }
    case "GeometryCollection":
      // Too complex to decompose meaningfully
      return null;
    default:
      return null;
  }
}

function coerceToPolygonFeature(
  gj: GeoJSON,
): Feature<Polygon | MultiPolygon> | null {
  switch (gj.type) {
    case "Polygon":
    case "MultiPolygon":
      return turf.feature(gj) as Feature<Polygon | MultiPolygon>;
    case "Feature":
      if (
        gj.geometry?.type === "Polygon" ||
        gj.geometry?.type === "MultiPolygon"
      ) {
        return gj as Feature<Polygon | MultiPolygon>;
      }
      return null;
    case "FeatureCollection": {
      const polyFeatures = gj.features.filter(
        (f) =>
          f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
      ) as Feature<Polygon | MultiPolygon>[];
      if (polyFeatures.length === 0) return null;
      if (polyFeatures.length === 1) return polyFeatures[0]!;
      return turf.union(turf.featureCollection(polyFeatures));
    }
    default:
      return null;
  }
}

function computePolygonOverlay(
  from: GeoJSON,
  to: GeoJSON,
): FeatureCollection | undefined {
  const fromFeat = coerceToPolygonFeature(from);
  const toFeat = coerceToPolygonFeature(to);
  if (!fromFeat || !toFeat) return;

  const features: Feature[] = [];

  const removed = turf.difference(turf.featureCollection([fromFeat, toFeat]));
  if (removed) {
    features.push({ ...removed, properties: { diffType: "removed" } });
  }

  const added = turf.difference(turf.featureCollection([toFeat, fromFeat]));
  if (added) {
    features.push({ ...added, properties: { diffType: "added" } });
  }

  if (features.length === 0) return;
  return turf.featureCollection(features);
}

function coerceToPositions(gj: GeoJSON): Position[] {
  switch (gj.type) {
    case "Point":
      return [gj.coordinates];
    case "MultiPoint":
      return gj.coordinates;
    case "Feature":
      if (!gj.geometry) return [];
      return coerceToPositions(gj.geometry);
    case "FeatureCollection":
      return gj.features.flatMap((f) =>
        f.geometry ? coerceToPositions(f.geometry) : [],
      );
    default:
      return [];
  }
}

function computePointOverlay(
  from: GeoJSON,
  to: GeoJSON,
): FeatureCollection | undefined {
  const fromPositions = coerceToPositions(from);
  const toPositions = coerceToPositions(to);
  if (fromPositions.length === 0 || toPositions.length === 0) return;

  const count = Math.min(fromPositions.length, toPositions.length);
  const features: Feature[] = [];

  for (let i = 0; i < count; i++) {
    features.push(
      turf.lineString([fromPositions[i]!, toPositions[i]!], {
        diffType: "connector",
      }),
    );
  }

  if (features.length > 0) return turf.featureCollection(features);
}

export type DiffOverlayResult = { overlay?: FeatureCollection; error?: string };

/**
 * Compute diff overlay FeatureCollection from two GeoJSON objects.
 *
 * Returns a DiffOverlayResult with:
 * - `overlay`: FeatureCollection with features tagged with `diffType`:
 *   - "removed": polygon area only in `from` (red)
 *   - "added": polygon area only in `to` (green)
 *   - "connector": line connecting corresponding points
 * - `error`: set if overlay computation was attempted but threw (e.g. invalid geometry)
 *
 * Both fields are absent if no overlay applies (incompatible types, both lines, etc).
 */
export function computeDiffOverlay(
  from: GeoJSON,
  to: GeoJSON,
): DiffOverlayResult {
  const fromType = getPrimaryGeomType(from);
  const toType = getPrimaryGeomType(to);

  // Incompatible or unsupported types → no overlay
  if (!fromType || !toType || fromType !== toType) return {};

  try {
    switch (fromType) {
      case "polygon":
        return { overlay: computePolygonOverlay(from, to) };
      case "point":
        // Toggle SHOW_POINT_CONNECTORS to disable point displacement indicators
        if (SHOW_POINT_CONNECTORS)
          return { overlay: computePointOverlay(from, to) };
        return {};
      case "line":
        // Line overlay not implemented; toggle SHOW_LINE_OVERLAY to enable
        if (!SHOW_LINE_OVERLAY) return {};
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `Creation of visual diff overlay failed: ${message}` };
  }

  return {};
}
