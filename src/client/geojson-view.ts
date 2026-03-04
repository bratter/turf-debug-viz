/**
 * GeoJSON interactive tree renderer for the #geojson-view panel.
 *
 * Listens to viewState "activate" events and renders a collapsible
 * JavaScript-object-style view of the activated GeoJSON, with lint
 * result icons overlaid at matching paths.
 */

import { lintFlat } from "../lint/index.ts";
import { GEOMETRY_TYPES } from "../lint/const.ts";
import type { LintResult, Path } from "../lint/types.ts";
import { Severity } from "../lint/types.ts";
import { viewState } from "./view.ts";
import { Mode } from "./mode-menu.ts";
import type { ViewRow } from "../../types.js";

// ========================================
// Public API
// ========================================

export function initGeoJsonView(): void {
  const container = document.getElementById("geojson-view") as HTMLElement;

  function renderRow(row: ViewRow | null): void {
    container.innerHTML = "";
    if (row === null) return;
    const geojson = row.geojson;
    const lintGroup = lintFlat(geojson);
    const lints = buildLintMap(lintGroup.results as LintResult[]);
    const root = document.createElement("div");
    root.className = "gjv-root";
    container.appendChild(root);
    renderGeoJSON(root, geojson, [], lints);
    // Root-level object has no enclosing collection — remove its closing comma.
    removeLastComma(root);
  }

  viewState.addEventListener("change", (e) => {
    if (e.detail.type === "activate") renderRow(e.detail.row);
    else if (e.detail.type === "clear") renderRow(null);
  });

  window.addEventListener("modechange", (e) => {
    if (e.detail === Mode.DIFF) {
      container.innerHTML = "";
    } else {
      renderRow(viewState.getActiveRow());
    }
  });
}

// ========================================
// Lint Map
// ========================================

function pathKey(path: Path): string {
  return JSON.stringify(path);
}

function buildLintMap(lints: LintResult[]): Map<string, LintResult[]> {
  const map = new Map<string, LintResult[]>();
  for (const lint of lints) {
    const key = pathKey(lint.path);
    const existing = map.get(key);
    if (existing) existing.push(lint);
    else map.set(key, [lint]);
  }
  return map;
}

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
function renderGeoJSON(
  parent: HTMLElement,
  node: unknown,
  path: Path,
  lints: Map<string, LintResult[]>,
  keyLabel?: string,
): void {
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    const type = obj["type"];
    if (type === "Feature") {
      renderFeature(parent, obj, path, lints, keyLabel);
    } else if (type === "FeatureCollection") {
      renderFeatureCollection(parent, obj, path, lints, keyLabel);
    } else if (
      typeof type === "string" &&
      (GEOMETRY_TYPES as readonly string[]).includes(type)
    ) {
      renderGeometry(parent, obj, path, lints, keyLabel);
    } else {
      renderObject(parent, node, path, lints, keyLabel);
    }
  } else {
    renderObject(parent, node, path, lints, keyLabel);
  }
}

// ========================================
// Typed GeoJSON Renderers
// ========================================

function renderFeature(
  parent: HTMLElement,
  node: Record<string, unknown>,
  path: Path,
  lints: Map<string, LintResult[]>,
  keyLabel?: string,
): void {
  const { body } = makeCollapsible(parent, path, lints, "{", keyLabel);

  renderKeyValue(body, "type", node["type"], [...path, "type"], lints);
  if ("id" in node) {
    renderKeyValue(body, "id", node["id"], [...path, "id"], lints);
  }
  if ("bbox" in node) {
    renderKeyValue(body, "bbox", node["bbox"], [...path, "bbox"], lints);
  }
  renderKeyValue(
    body,
    "properties",
    node["properties"],
    [...path, "properties"],
    lints,
  );
  renderGeoJSON(
    body,
    node["geometry"],
    [...path, "geometry"],
    lints,
    "geometry",
  );

  for (const key of Object.keys(node)) {
    if (!FEATURE_KEYS.has(key)) {
      renderKeyValue(body, key, node[key], [...path, key], lints);
    }
  }
  removeLastComma(body);
  addClosingLine(body.parentElement!, "}");
}

function renderFeatureCollection(
  parent: HTMLElement,
  node: Record<string, unknown>,
  path: Path,
  lints: Map<string, LintResult[]>,
  keyLabel?: string,
): void {
  const { body } = makeCollapsible(parent, path, lints, "{", keyLabel);

  renderKeyValue(body, "type", node["type"], [...path, "type"], lints);
  if ("bbox" in node) {
    renderKeyValue(body, "bbox", node["bbox"], [...path, "bbox"], lints);
  }

  const features = node["features"];
  const featuresPath = [...path, "features"];
  if (Array.isArray(features) && features.length > 0) {
    const { body: arrBody } = makeCollapsible(
      body,
      featuresPath,
      lints,
      "[",
      "features",
    );
    for (let i = 0; i < features.length; i++) {
      renderGeoJSON(
        arrBody,
        features[i],
        [...featuresPath, i],
        lints,
        String(i),
      );
    }
    removeLastComma(arrBody);
    addClosingLine(arrBody.parentElement!, "]");
  } else {
    renderKeyValue(body, "features", features, featuresPath, lints);
  }

  for (const key of Object.keys(node)) {
    if (!FEATURE_COLLECTION_KEYS.has(key)) {
      renderKeyValue(body, key, node[key], [...path, key], lints);
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
  lints: Map<string, LintResult[]>,
  keyLabel?: string,
): void {
  const { body } = makeCollapsible(parent, path, lints, "{", keyLabel);
  const type = node["type"] as string;

  renderKeyValue(body, "type", node["type"], [...path, "type"], lints);
  if ("bbox" in node) {
    renderKeyValue(body, "bbox", node["bbox"], [...path, "bbox"], lints);
  }

  if (type === "GeometryCollection") {
    const geoms = node["geometries"];
    const geomsPath = [...path, "geometries"];
    if (Array.isArray(geoms) && geoms.length > 0) {
      const { body: geomsBody } = makeCollapsible(
        body,
        geomsPath,
        lints,
        "[",
        "geometries",
      );
      for (let i = 0; i < geoms.length; i++) {
        renderGeoJSON(geomsBody, geoms[i], [...geomsPath, i], lints, String(i));
      }
      removeLastComma(geomsBody);
      addClosingLine(geomsBody.parentElement!, "]");
    } else {
      renderKeyValue(body, "geometries", geoms, geomsPath, lints);
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
      renderPosition(line, node["coordinates"], coordPath, lints);
    } else {
      const { body: coordBody } = makeCollapsible(
        body,
        coordPath,
        lints,
        "[",
        "coordinates",
      );
      renderCoords(coordBody, node["coordinates"], coordPath, lints, depth);
      removeLastComma(coordBody);
      addClosingLine(coordBody.parentElement!, "]");
    }
  }

  for (const key of Object.keys(node)) {
    if (!GEOMETRY_KEYS.has(key)) {
      renderKeyValue(body, key, node[key], [...path, key], lints);
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
  lints: Map<string, LintResult[]>,
  keyLabel?: string,
): void {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    // Not actually an object — treat as primitive
    if (keyLabel !== undefined) {
      renderKeyValue(parent, keyLabel, obj, path, lints);
    } else {
      const line = makeLine(parent);
      appendPrimitive(line, obj);
      appendComma(line);
      renderLintIcons(line, path, lints);
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
    renderLintIcons(line, path, lints);
    return;
  }

  const { body } = makeCollapsible(parent, path, lints, "{", keyLabel);
  for (const key of keys) {
    renderKeyValue(body, key, record[key], [...path, key], lints);
  }
  removeLastComma(body);
  addClosingLine(body.parentElement!, "}");
}

function renderArray(
  parent: HTMLElement,
  arr: unknown[],
  path: Path,
  lints: Map<string, LintResult[]>,
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
    renderLintIcons(line, path, lints);
    return;
  }

  const { body } = makeCollapsible(parent, path, lints, "[", keyLabel);
  for (let i = 0; i < arr.length; i++) {
    renderValue(body, arr[i], [...path, i], lints);
  }
  removeLastComma(body);
  addClosingLine(body.parentElement!, "]");
}

function renderValue(
  parent: HTMLElement,
  value: unknown,
  path: Path,
  lints: Map<string, LintResult[]>,
): void {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      renderArray(parent, value, path, lints);
    } else {
      renderObject(parent, value, path, lints);
    }
    return;
  }
  const line = makeLine(parent);
  appendPrimitive(line, value);
  appendComma(line);
  renderLintIcons(line, path, lints);
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
  lints: Map<string, LintResult[]>,
): void {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      renderArray(parent, value, path, lints, key);
    } else {
      renderObject(parent, value, path, lints, key);
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
  renderLintIcons(line, path, lints);
}

// ========================================
// Coordinate Renderers
// ========================================

/**
 * Renders coordinate arrays into parent.
 * depth 1  → array of positions (each rendered as one line with lint icons)
 * depth 2+ → array of collapsible sub-arrays (each header gets lint icons)
 *
 * Callers are responsible for calling removeLastComma(parent) after this
 * function returns, before sealing the enclosing block with addClosingLine.
 */
function renderCoords(
  parent: HTMLElement,
  coords: unknown,
  path: Path,
  lints: Map<string, LintResult[]>,
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
      renderPosition(line, coords[i], [...path, i], lints);
    }
    return;
  }

  // depth >= 2: each element is a sub-array (ring, line, polygon, …)
  for (let i = 0; i < coords.length; i++) {
    const subPath = [...path, i];
    const { body } = makeCollapsible(parent, subPath, lints, "[", String(i));
    renderCoords(body, coords[i], subPath, lints, depth - 1);
    removeLastComma(body);
    addClosingLine(body.parentElement!, "]");
  }
}

/**
 * Fills a pre-created line element with a position's `[x, y]` content,
 * a trailing comma, and any lint icons for the given path.
 */
function renderPosition(
  line: HTMLElement,
  pos: unknown,
  path: Path,
  lints: Map<string, LintResult[]>,
): void {
  if (!Array.isArray(pos)) {
    appendPrimitive(line, pos);
    appendComma(line);
    renderLintIcons(line, path, lints);
    return;
  }
  line.append("[");
  for (let i = 0; i < pos.length; i++) {
    if (i > 0) line.append(", ");
    appendPrimitive(line, pos[i]);
  }
  line.append("]");
  appendComma(line);
  renderLintIcons(line, path, lints);
}

// ========================================
// Lint Icons
// ========================================

function renderLintIcons(
  parent: HTMLElement,
  path: Path,
  lints: Map<string, LintResult[]>,
): void {
  const key = pathKey(path);
  const results = lints.get(key);
  if (!results || results.length === 0) return;

  const iconsSpan = document.createElement("span");
  iconsSpan.className = "gjv-icons";

  for (const result of results) {
    if (result.severity < Severity.Info) continue;
    const icon = document.createElement("span");
    icon.title = result.message
      ? `${result.description}: ${result.message}`
      : result.description;
    icon.className = "gjv-icon";
    if (result.severity >= Severity.Error) {
      icon.textContent = "✖";
      icon.classList.add("gjv-icon-error");
    } else if (result.severity >= Severity.Warn) {
      icon.textContent = "⚠";
      icon.classList.add("gjv-icon-warn");
    } else {
      icon.textContent = "ℹ";
      icon.classList.add("gjv-icon-info");
    }
    iconsSpan.appendChild(icon);
  }

  if (iconsSpan.childElementCount > 0) {
    parent.appendChild(iconsSpan);
  }
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
function removeLastComma(parent: HTMLElement): void {
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
  lints: Map<string, LintResult[]>,
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

  // Icons pushed to the right via margin-left: auto in CSS
  renderLintIcons(header, path, lints);

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

function appendPrimitive(parent: HTMLElement, value: unknown): void {
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
