import {
  FEATURE,
  FEATURE_COLLECTION,
  GEOMETRY_COLLECTION,
  GEOMETRY_TYPES,
} from "../lint/const.ts";
import { normalizeGeoJSON } from "./normalize.ts";
import type {
  DiffGroup,
  DiffLeaf,
  DiffNode,
  DiffResult,
  DiffStatus,
  Path,
} from "./types.ts";

export interface DiffOptions {
  /** Apply GeoJSON normalization before comparing (see Chunk C). Default: false. */
  normalize?: boolean;
  /** Coordinate precision for normalization. Only used when normalize: true. Default: 6. */
  precision?: number;
}

export function diffGeoJSON(
  from: unknown,
  to: unknown,
  opts?: DiffOptions,
): DiffResult {
  let a = from;
  let b = to;
  if (opts?.normalize) {
    const p = opts.precision ?? 6;
    a = normalizeGeoJSON(from, { precision: p });
    b = normalizeGeoJSON(to, { precision: p });
  }
  return _diff(a, b);
}

function _diff(from: unknown, to: unknown): DiffResult {
  const node = diffValues(from, to, []);
  const root: DiffGroup =
    node.kind === "group"
      ? node
      : { kind: "group", path: [], status: node.status, children: [node] };
  return { root, hasChanges: root.status !== "unchanged" };
}

export function buildDiffMap(result: DiffResult): Map<string, DiffStatus> {
  const map = new Map<string, DiffStatus>();
  function walk(node: DiffNode): void {
    map.set(JSON.stringify(node.path), node.status);
    if (node.kind === "group") {
      for (const child of node.children) walk(child);
    }
  }
  walk(result.root);
  return map;
}

// ========================================
// Internal helpers
// ========================================

function isPrimitive(v: unknown): v is null | string | number | boolean {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function leaf(
  path: Path,
  status: DiffStatus,
  from: unknown,
  to: unknown,
): DiffLeaf {
  return { kind: "leaf", path, status, from, to };
}

/** Returns the most severe status among children; empty → "unchanged". */
function worstStatus(children: DiffNode[]): DiffStatus {
  let worst: DiffStatus = "unchanged";
  for (const c of children) {
    if (c.status === "changed") return "changed";
    if (c.status === "added") {
      worst = "added";
    } else if (c.status === "removed" && worst !== "added") {
      worst = "removed";
    }
  }
  return worst;
}

function diffValues(from: unknown, to: unknown, path: Path): DiffNode {
  if (isPrimitive(from) && isPrimitive(to)) {
    return leaf(path, from === to ? "unchanged" : "changed", from, to);
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    return diffArrays(from, to, path);
  }
  if (isPlainObject(from) && isPlainObject(to)) {
    return diffObjects(from, to, path);
  }
  // Type mismatch (e.g. string vs object, array vs object)
  return leaf(path, "changed", from, to);
}

function diffObjects(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
  path: Path,
): DiffGroup {
  const keys = getGeoJSONKeyOrder(from, to);
  const children: DiffNode[] = [];

  for (const key of keys) {
    const inFrom = key in from;
    const inTo = key in to;
    const childPath = [...path, key];

    if (inFrom && !inTo) {
      children.push(leaf(childPath, "removed", from[key], undefined));
    } else if (!inFrom && inTo) {
      children.push(leaf(childPath, "added", undefined, to[key]));
    } else {
      children.push(diffValues(from[key], to[key], childPath));
    }
  }

  return { kind: "group", path, status: worstStatus(children), children };
}

function diffArrays(from: unknown[], to: unknown[], path: Path): DiffGroup {
  const len = Math.max(from.length, to.length);
  const children: DiffNode[] = [];

  for (let i = 0; i < len; i++) {
    const childPath = [...path, i];
    if (i >= from.length) {
      children.push(leaf(childPath, "added", undefined, to[i]));
    } else if (i >= to.length) {
      children.push(leaf(childPath, "removed", from[i], undefined));
    } else {
      children.push(diffValues(from[i], to[i], childPath));
    }
  }

  return { kind: "group", path, status: worstStatus(children), children };
}

// ========================================
// GeoJSON-aware key ordering
// ========================================

const FEATURE_KEY_ORDER = ["type", "id", "bbox", "properties", "geometry"];
const FEATURE_COLLECTION_KEY_ORDER = ["type", "bbox", "features"];
const GEOMETRY_KEY_ORDER = ["type", "bbox", "coordinates"];
const GEOMETRY_COLLECTION_KEY_ORDER = ["type", "bbox", "geometries"];

function getGeoJSONKeyOrder(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
): string[] {
  const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
  const type = (from.type ?? to.type) as string | undefined;

  let canonicalOrder: string[];

  if (type === FEATURE) {
    canonicalOrder = FEATURE_KEY_ORDER;
  } else if (type === FEATURE_COLLECTION) {
    canonicalOrder = FEATURE_COLLECTION_KEY_ORDER;
  } else if (type === GEOMETRY_COLLECTION) {
    canonicalOrder = GEOMETRY_COLLECTION_KEY_ORDER;
  } else if (
    typeof type === "string" &&
    (GEOMETRY_TYPES as readonly string[]).includes(type)
  ) {
    canonicalOrder = GEOMETRY_KEY_ORDER;
  } else {
    // Unknown object (including properties): all keys alphabetically
    return [...allKeys].sort();
  }

  const canonicalSet = new Set(canonicalOrder);
  const result: string[] = [];

  for (const key of canonicalOrder) {
    if (allKeys.has(key)) result.push(key);
  }

  const foreign = [...allKeys].filter((k) => !canonicalSet.has(k)).sort();
  return [...result, ...foreign];
}
