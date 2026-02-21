/**
 * Linter constants.
 */

import { Severity } from "./types.ts";

export const FEATURE = "Feature";
export const FEATURE_COLLECTION = "FeatureCollection";
export const POINT = "Point";
export const MULTI_POINT = "MultiPoint";
export const LINE_STRING = "LineString";
export const MULTI_LINE_STRING = "MultiLineString";
export const POLYGON = "Polygon";
export const MULTI_POLYGON = "MultiPolygon";
export const GEOMETRY_COLLECTION = "GeometryCollection";

export const GEOMETRY_TYPES = [
  POINT,
  MULTI_POINT,
  LINE_STRING,
  MULTI_LINE_STRING,
  POLYGON,
  MULTI_POLYGON,
  GEOMETRY_COLLECTION,
] as const;
export const GEOJSON_TYPES = [
  FEATURE,
  FEATURE_COLLECTION,
  ...GEOMETRY_TYPES,
] as const;

/** Convert severity levels to human-readable text */
export const SEV_LEVELS: Record<Severity, string> = {
  [Severity.Skip]: "Skip",
  [Severity.Ok]: "Ok",
  [Severity.Info]: "Info",
  [Severity.Warn]: "Warning",
  [Severity.Error]: "Error",
};
