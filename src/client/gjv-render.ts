/**
 * Shared GeoJSON tree renderer.
 *
 * Rendering functions accept an `annotate` callback instead of a concrete
 * lint map, allowing callers to attach arbitrary per-node decorations
 * (lint icons, diff highlights, etc.).
 */

import type { Path } from "../lint/types.ts";
import { GEOMETRY_TYPES } from "../lint/const.ts";

// ========================================
// Public Types
// ========================================

/**
 * Callback that, given a DOM line element and its path, attaches any
 * per-node annotations (lint icons, diff highlights, etc.).
 */
export type AnnotationFn = (line: HTMLElement, path: Path) => void;

/** No-op annotation function for callers that need no decorations. */
export const noAnnotate: AnnotationFn = () => {};

// ========================================
// GeoJSON Router
// ========================================

// Module-level sets for known keys in each GeoJSON type, used to detect extra keys.
const FEATURE_KEYS = new Set(["type", "id", "bbox", "properties", "geometry"]);
const FEATURE_COLLECTION_KEYS = new Set(["type", "bbox", "features"]);
const GEOMETRY_KEYS = new Set(["type", "bbox", "coordinates", "geometries"]);

/**
 * Routes to the appropriate typed renderer. All GeoJSON renderers accept an
 * optional keyLabel that gets placed on their header line (e.g. "geometry: {").
 */
export function renderGeoJSON(
  parent: HTMLElement,
  node: unknown,
  path: Path,
  annotate: AnnotationFn,
  keyLabel?: string,
): void {
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    const type = obj["type"];
    if (type === "Feature") {
      renderFeature(parent, obj, path, annotate, keyLabel);
    } else if (type === "FeatureCollection") {
      renderFeatureCollection(parent, obj, path, annotate, keyLabel);
    } else if (
      typeof type === "string" &&
      (GEOMETRY_TYPES as readonly string[]).includes(type)
    ) {
      renderGeometry(parent, obj, path, annotate, keyLabel);
    } else {
      renderObject(parent, node, path, annotate, keyLabel);
    }
  } else {
    renderObject(parent, node, path, annotate, keyLabel);
  }
}

// ========================================
// Typed GeoJSON Renderers
// ========================================

function renderFeature(
  parent: HTMLElement,
  node: Record<string, unknown>,
  path: Path,
  annotate: AnnotationFn,
  keyLabel?: string,
): void {
  const { body } = makeCollapsible(parent, path, annotate, "{", keyLabel);

  renderKeyValue(body, "type", node["type"], [...path, "type"], annotate);
  if ("id" in node) {
    renderKeyValue(body, "id", node["id"], [...path, "id"], annotate);
  }
  if ("bbox" in node) {
    renderKeyValue(body, "bbox", node["bbox"], [...path, "bbox"], annotate);
  }
  renderKeyValue(
    body,
    "properties",
    node["properties"],
    [...path, "properties"],
    annotate,
  );
  renderGeoJSON(
    body,
    node["geometry"],
    [...path, "geometry"],
    annotate,
    "geometry",
  );

  for (const key of Object.keys(node)) {
    if (!FEATURE_KEYS.has(key)) {
      renderKeyValue(body, key, node[key], [...path, key], annotate);
    }
  }
  removeLastComma(body);
  addClosingLine(body.parentElement!, "}");
}

function renderFeatureCollection(
  parent: HTMLElement,
  node: Record<string, unknown>,
  path: Path,
  annotate: AnnotationFn,
  keyLabel?: string,
): void {
  const { body } = makeCollapsible(parent, path, annotate, "{", keyLabel);

  renderKeyValue(body, "type", node["type"], [...path, "type"], annotate);
  if ("bbox" in node) {
    renderKeyValue(body, "bbox", node["bbox"], [...path, "bbox"], annotate);
  }

  const features = node["features"];
  const featuresPath = [...path, "features"];
  if (Array.isArray(features) && features.length > 0) {
    const { body: arrBody } = makeCollapsible(
      body,
      featuresPath,
      annotate,
      "[",
      "features",
    );
    for (let i = 0; i < features.length; i++) {
      renderGeoJSON(
        arrBody,
        features[i],
        [...featuresPath, i],
        annotate,
        String(i),
      );
    }
    removeLastComma(arrBody);
    addClosingLine(arrBody.parentElement!, "]");
  } else {
    renderKeyValue(body, "features", features, featuresPath, annotate);
  }

  for (const key of Object.keys(node)) {
    if (!FEATURE_COLLECTION_KEYS.has(key)) {
      renderKeyValue(body, key, node[key], [...path, key], annotate);
    }
  }
  removeLastComma(body);
  addClosingLine(body.parentElement!, "}");
}

const COORD_DEPTH: Record<string, number> = {
  Point: 0,
  MultiPoint: 1,
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3,
};

function renderGeometry(
  parent: HTMLElement,
  node: Record<string, unknown>,
  path: Path,
  annotate: AnnotationFn,
  keyLabel?: string,
): void {
  const { body } = makeCollapsible(parent, path, annotate, "{", keyLabel);
  const type = node["type"] as string;

  renderKeyValue(body, "type", node["type"], [...path, "type"], annotate);
  if ("bbox" in node) {
    renderKeyValue(body, "bbox", node["bbox"], [...path, "bbox"], annotate);
  }

  if (type === "GeometryCollection") {
    const geoms = node["geometries"];
    const geomsPath = [...path, "geometries"];
    if (Array.isArray(geoms) && geoms.length > 0) {
      const { body: geomsBody } = makeCollapsible(
        body,
        geomsPath,
        annotate,
        "[",
        "geometries",
      );
      for (let i = 0; i < geoms.length; i++) {
        renderGeoJSON(
          geomsBody,
          geoms[i],
          [...geomsPath, i],
          annotate,
          String(i),
        );
      }
      removeLastComma(geomsBody);
      addClosingLine(geomsBody.parentElement!, "]");
    } else {
      renderKeyValue(body, "geometries", geoms, geomsPath, annotate);
    }
  } else {
    const depth = COORD_DEPTH[type] ?? 0;
    const coordPath = [...path, "coordinates"];
    if (depth === 0) {
      // Point: render coordinates inline as `coordinates: [lng, lat]`
      const line = makeLine(body);
      const keySpan = document.createElement("span");
      keySpan.className = "gjv-key";
      keySpan.textContent = "coordinates: ";
      line.appendChild(keySpan);
      renderPosition(line, node["coordinates"], coordPath, annotate);
    } else {
      const { body: coordBody } = makeCollapsible(
        body,
        coordPath,
        annotate,
        "[",
        "coordinates",
      );
      renderCoords(coordBody, node["coordinates"], coordPath, annotate, depth);
      removeLastComma(coordBody);
      addClosingLine(coordBody.parentElement!, "]");
    }
  }

  for (const key of Object.keys(node)) {
    if (!GEOMETRY_KEYS.has(key)) {
      renderKeyValue(body, key, node[key], [...path, key], annotate);
    }
  }
  removeLastComma(body);
  addClosingLine(body.parentElement!, "}");
}

// ========================================
// Generic Value/Object Rendering
// ========================================

function renderObject(
  parent: HTMLElement,
  obj: unknown,
  path: Path,
  annotate: AnnotationFn,
  keyLabel?: string,
): void {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    // Not actually an object — treat as primitive
    if (keyLabel !== undefined) {
      renderKeyValue(parent, keyLabel, obj, path, annotate);
    } else {
      const line = makeLine(parent);
      appendPrimitive(line, obj);
      appendComma(line);
      annotate(line, path);
    }
    return;
  }

  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length === 0) {
    const line = makeLine(parent);
    if (keyLabel !== undefined) {
      const keySpan = document.createElement("span");
      keySpan.className = "gjv-key";
      keySpan.textContent = `${keyLabel}: `;
      line.appendChild(keySpan);
    }
    line.append("{}");
    appendComma(line);
    annotate(line, path);
    return;
  }

  const { body } = makeCollapsible(parent, path, annotate, "{", keyLabel);
  for (const key of keys) {
    renderKeyValue(body, key, record[key], [...path, key], annotate);
  }
  removeLastComma(body);
  addClosingLine(body.parentElement!, "}");
}

function renderArray(
  parent: HTMLElement,
  arr: unknown[],
  path: Path,
  annotate: AnnotationFn,
  keyLabel?: string,
): void {
  if (arr.length === 0) {
    const line = makeLine(parent);
    if (keyLabel !== undefined) {
      const keySpan = document.createElement("span");
      keySpan.className = "gjv-key";
      keySpan.textContent = `${keyLabel}: `;
      line.appendChild(keySpan);
    }
    line.append("[]");
    appendComma(line);
    annotate(line, path);
    return;
  }

  const { body } = makeCollapsible(parent, path, annotate, "[", keyLabel);
  for (let i = 0; i < arr.length; i++) {
    renderValue(body, arr[i], [...path, i], annotate);
  }
  removeLastComma(body);
  addClosingLine(body.parentElement!, "]");
}

function renderValue(
  parent: HTMLElement,
  value: unknown,
  path: Path,
  annotate: AnnotationFn,
): void {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      renderArray(parent, value, path, annotate);
    } else {
      renderObject(parent, value, path, annotate);
    }
    return;
  }
  const line = makeLine(parent);
  appendPrimitive(line, value);
  appendComma(line);
  annotate(line, path);
}

/**
 * Renders `key: value` where value can be anything.
 * For objects/arrays, creates a collapsible with the key on the header.
 * For primitives, renders on a single line.
 */
function renderKeyValue(
  parent: HTMLElement,
  key: string,
  value: unknown,
  path: Path,
  annotate: AnnotationFn,
): void {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      renderArray(parent, value, path, annotate, key);
    } else {
      renderObject(parent, value, path, annotate, key);
    }
    return;
  }
  const line = makeLine(parent);
  const keySpan = document.createElement("span");
  keySpan.className = "gjv-key";
  keySpan.textContent = `${key}: `;
  line.appendChild(keySpan);
  appendPrimitive(line, value);
  appendComma(line);
  annotate(line, path);
}

// ========================================
// Coordinate Renderers
// ========================================

/**
 * Renders coordinate arrays into parent.
 * depth 1  → array of positions (each rendered as one line with annotations)
 * depth 2+ → array of collapsible sub-arrays (each header gets annotations)
 *
 * Callers are responsible for calling removeLastComma(parent) after this
 * function returns, before sealing the enclosing block with addClosingLine.
 */
function renderCoords(
  parent: HTMLElement,
  coords: unknown,
  path: Path,
  annotate: AnnotationFn,
  depth: number,
): void {
  if (!Array.isArray(coords)) {
    const line = makeLine(parent);
    appendPrimitive(line, coords);
    appendComma(line);
    return;
  }

  if (depth <= 1) {
    // Base case: each element is a position rendered on its own line
    for (let i = 0; i < coords.length; i++) {
      const line = makeLine(parent);
      renderPosition(line, coords[i], [...path, i], annotate);
    }
    return;
  }

  // depth >= 2: each element is a sub-array (ring, line, polygon, …)
  for (let i = 0; i < coords.length; i++) {
    const subPath = [...path, i];
    const { body } = makeCollapsible(parent, subPath, annotate, "[", String(i));
    renderCoords(body, coords[i], subPath, annotate, depth - 1);
    removeLastComma(body);
    addClosingLine(body.parentElement!, "]");
  }
}

/**
 * Fills a pre-created line element with a position's `[x, y]` content,
 * a trailing comma, and any annotations for the given path.
 */
function renderPosition(
  line: HTMLElement,
  pos: unknown,
  path: Path,
  annotate: AnnotationFn,
): void {
  if (!Array.isArray(pos)) {
    appendPrimitive(line, pos);
    appendComma(line);
    annotate(line, path);
    return;
  }
  line.append("[");
  for (let i = 0; i < pos.length; i++) {
    if (i > 0) line.append(", ");
    appendPrimitive(line, pos[i]);
  }
  line.append("]");
  appendComma(line);
  annotate(line, path);
}

// ========================================
// DOM Helpers
// ========================================

function makeLine(parent: HTMLElement): HTMLElement {
  const line = document.createElement("div");
  line.className = "gjv-line";
  parent.appendChild(line);
  return line;
}

/** Appends a comma span. Removed by removeLastComma on the last item in a block. */
function appendComma(parent: HTMLElement): void {
  const span = document.createElement("span");
  span.className = "gjv-comma";
  span.textContent = ",";
  parent.appendChild(span);
}

/**
 * Removes the trailing comma from the last rendered item in a block body.
 * For a plain .gjv-line last child, removes its .gjv-comma directly.
 * For a .gjv-node last child, removes the .gjv-comma from its closing bracket line.
 */
export function removeLastComma(parent: HTMLElement): void {
  const last = parent.lastElementChild;
  if (!last) return;
  const target = last.classList.contains("gjv-node")
    ? last.lastElementChild
    : last;
  target?.querySelector(".gjv-comma")?.remove();
}

function makeCollapsible(
  parent: HTMLElement,
  path: Path,
  annotate: AnnotationFn,
  open: string,
  keyLabel?: string,
): { node: HTMLElement; header: HTMLElement; body: HTMLElement } {
  const node = document.createElement("div");
  node.className = "gjv-node";
  parent.appendChild(node);

  const header = document.createElement("div");
  header.className = "gjv-line";
  node.appendChild(header);

  const toggle = document.createElement("span");
  toggle.className = "gjv-toggle";
  toggle.textContent = "▶";
  header.appendChild(toggle);

  if (keyLabel !== undefined) {
    const keySpan = document.createElement("span");
    keySpan.className = "gjv-key";
    keySpan.textContent = `${keyLabel}: `;
    header.appendChild(keySpan);
  }

  const close = open === "{" ? "}" : "]";
  header.append(open);

  const closedEllipsis = document.createElement("span");
  closedEllipsis.className = "gjv-closed-summary";
  closedEllipsis.textContent = "…";
  header.appendChild(closedEllipsis);

  const closedBracket = document.createElement("span");
  closedBracket.className = "gjv-closed-summary";
  closedBracket.textContent = close;
  header.appendChild(closedBracket);

  // Annotations pushed to the right via margin-left: auto in CSS
  annotate(header, path);

  header.addEventListener("click", () => {
    node.classList.toggle("closed");
  });

  const body = document.createElement("div");
  body.className = "gjv-body";
  node.appendChild(body);

  return { node, header, body };
}

function addClosingLine(parent: HTMLElement, bracket: string): void {
  const line = document.createElement("div");
  line.className = "gjv-line";
  line.textContent = bracket;
  appendComma(line);
  parent.appendChild(line);
}

export function appendPrimitive(parent: HTMLElement, value: unknown): void {
  const span = document.createElement("span");
  if (value === null) {
    span.className = "gjv-null";
    span.textContent = "null";
  } else if (typeof value === "boolean") {
    span.className = "gjv-bool";
    span.textContent = String(value);
  } else if (typeof value === "number") {
    span.className = "gjv-num";
    span.textContent = String(value);
  } else if (typeof value === "string") {
    span.className = "gjv-str";
    span.textContent = `"${value}"`;
  } else {
    span.className = "gjv-unknown";
    span.textContent = String(value);
  }
  parent.appendChild(span);
}
