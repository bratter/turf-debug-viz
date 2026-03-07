/**
 * Diff-tree-aware pair renderer.
 *
 * Walks the DiffResult tree and renders both diff columns simultaneously,
 * producing per-row alignment and synchronized collapse.
 *
 * Positions are always treated as leaf nodes: at coordinate depth 0, we always
 * render an inline [lng, lat] line regardless of what the diff tree looks like.
 * This is enforced via geometry-type-aware depth tracking (see renderCoordsPair).
 */

import {
  appendPrimitive,
  removeLastComma,
  renderGeoJSON,
  renderPosition,
  noAnnotate,
} from "./gjv-render.ts";
import type {
  DiffGroup,
  DiffLeaf,
  DiffNode,
  DiffResult,
} from "../diff/types.ts";

// ========================================
// Public API
// ========================================

export function renderDiffPair(
  fromRoot: HTMLElement,
  toRoot: HTMLElement,
  result: DiffResult,
): void {
  renderGroupPair(fromRoot, toRoot, result.root, undefined);
  removeLastComma(fromRoot);
  removeLastComma(toRoot);
}

// ========================================
// Pair Renderers
// ========================================

function renderGroupPair(
  fromParent: HTMLElement,
  toParent: HTMLElement,
  group: DiffGroup,
  keyLabel: string | undefined,
): void {
  // Fast path: position-shaped group (2–3 numeric-valued DiffLeaf children).
  // Handles the common case of matching geometry types without needing type context.
  if (isPositionGroup(group)) {
    renderPositionPair(fromParent, toParent, group, keyLabel);
    return;
  }

  // Geometry group: use coordinate-depth-aware rendering so positions are
  // always rendered inline, even when geometry types differ.
  const depths = getGeometryDepths(group);
  if (depths !== null) {
    renderGeometryGroupPair(
      fromParent,
      toParent,
      group,
      keyLabel,
      depths.fromDepth,
      depths.toDepth,
    );
    return;
  }

  // Generic object/array
  const isArr = isGroupArray(group);
  const open = isArr ? "[" : "{";
  const close = isArr ? "]" : "}";

  const { fromBody, toBody, fromNode, toNode } = makeLinkedCollapsible(
    fromParent,
    toParent,
    open,
    keyLabel,
  );

  renderChildren(fromBody, toBody, group.children);

  removeLastComma(fromBody);
  removeLastComma(toBody);
  addClosingLine(fromNode, close);
  addClosingLine(toNode, close);
}

/**
 * Renders a geometry DiffGroup ({type, coordinates, …}) using depth-aware
 * coordinate rendering so that positions are always displayed as leaf nodes.
 */
function renderGeometryGroupPair(
  fromParent: HTMLElement,
  toParent: HTMLElement,
  group: DiffGroup,
  keyLabel: string | undefined,
  fromDepth: number,
  toDepth: number,
): void {
  const { fromBody, toBody, fromNode, toNode } = makeLinkedCollapsible(
    fromParent,
    toParent,
    "{",
    keyLabel,
  );

  for (const child of group.children) {
    const key = child.path[child.path.length - 1];
    const childKeyLabel = key !== undefined ? String(key) : undefined;

    if (key === "coordinates") {
      if (child.kind === "group") {
        renderCoordsPair(
          fromBody,
          toBody,
          child,
          childKeyLabel,
          fromDepth,
          toDepth,
        );
      } else {
        // Entire coordinates key removed or added
        renderCoordLeafPair(
          fromBody,
          toBody,
          child as DiffLeaf,
          childKeyLabel,
          fromDepth,
          toDepth,
        );
      }
    } else if (child.kind === "leaf") {
      renderLeafPair(fromBody, toBody, child, childKeyLabel);
    } else {
      renderGroupPair(fromBody, toBody, child, childKeyLabel);
    }
  }

  removeLastComma(fromBody);
  removeLastComma(toBody);
  addClosingLine(fromNode, "}");
  addClosingLine(toNode, "}");
}

/**
 * Depth-aware coordinate rendering.
 *
 * At depth 0: always renders as a single inline position line on both sides.
 * Positions are treated as leaf nodes — never collapsibles.
 *
 * At depth > 0: linked collapsible, recurses into children with depth − 1.
 * DiffLeafs at depth > 0 are entire sub-arrays that were added/removed.
 */
function renderCoordsPair(
  fromParent: HTMLElement,
  toParent: HTMLElement,
  node: DiffNode,
  keyLabel: string | undefined,
  fromDepth: number,
  toDepth: number,
): void {
  // Position level: always render inline regardless of node structure
  if (fromDepth === 0 || toDepth === 0) {
    const fromCoords = extractPositionCoords(node, "from");
    const toCoords = extractPositionCoords(node, "to");
    const diffClass = node.status === "unchanged" ? null : "gjv-diff-changed";
    appendPositionLine(fromParent, fromCoords, keyLabel, diffClass);
    appendPositionLine(toParent, toCoords, keyLabel, diffClass);
    return;
  }

  // Array level: DiffLeaf means an entire sub-array was added/removed
  if (node.kind === "leaf") {
    renderCoordLeafPair(
      fromParent,
      toParent,
      node,
      keyLabel,
      fromDepth,
      toDepth,
    );
    return;
  }

  // DiffGroup: linked collapsible, recurse
  const { fromBody, toBody, fromNode, toNode } = makeLinkedCollapsible(
    fromParent,
    toParent,
    "[",
    keyLabel,
  );

  for (const child of node.children) {
    const childKey = child.path[child.path.length - 1];
    const childKeyLabel = childKey !== undefined ? String(childKey) : undefined;
    renderCoordsPair(
      fromBody,
      toBody,
      child,
      childKeyLabel,
      fromDepth - 1,
      toDepth - 1,
    );
  }

  removeLastComma(fromBody);
  removeLastComma(toBody);
  addClosingLine(fromNode, "]");
  addClosingLine(toNode, "]");
}

/**
 * Handles a DiffLeaf at any coordinates level — an entire sub-array (ring,
 * position, or position-array) that was added or removed.
 *
 * At depth 1: the value is a position → render inline + spacer.
 * At depth > 1: the value is a ring or deeper → linked collapsible pair.
 * At depth 0: should not occur (the node would be a position DiffGroup, not
 *   a leaf), but falls back to renderLeafPair for safety.
 */
function renderCoordLeafPair(
  fromParent: HTMLElement,
  toParent: HTMLElement,
  leaf: DiffLeaf,
  keyLabel: string | undefined,
  fromDepth: number,
  toDepth: number,
): void {
  if (leaf.status === "removed") {
    const valueDepth = fromDepth - 1;
    if (valueDepth <= 0) {
      appendPositionLine(
        fromParent,
        Array.isArray(leaf.from) ? (leaf.from as unknown[]) : [],
        keyLabel,
        "gjv-diff-removed",
      );
      appendSpacer(toParent);
    } else {
      renderLinkedSubtreePair(
        fromParent,
        toParent,
        leaf.from,
        keyLabel,
        "gjv-diff-removed",
        "gjv-diff-missing",
      );
    }
  } else if (leaf.status === "added") {
    const valueDepth = toDepth - 1;
    if (valueDepth <= 0) {
      appendSpacer(fromParent);
      appendPositionLine(
        toParent,
        Array.isArray(leaf.to) ? (leaf.to as unknown[]) : [],
        keyLabel,
        "gjv-diff-added",
      );
    } else {
      renderLinkedSubtreePair(
        fromParent,
        toParent,
        leaf.to,
        keyLabel,
        "gjv-diff-missing",
        "gjv-diff-added",
      );
    }
  } else {
    renderLeafPair(fromParent, toParent, leaf, keyLabel);
  }
}

/**
 * Extracts the position coordinate array from a DiffNode for one side.
 *
 * For a DiffGroup: collects numeric child values for the given side,
 * skipping any that are non-numeric (handles type-mismatch gracefully).
 * For a DiffLeaf: returns the numeric elements of the from/to value array.
 */
function extractPositionCoords(node: DiffNode, side: "from" | "to"): unknown[] {
  if (node.kind === "leaf") {
    const val = side === "from" ? node.from : node.to;
    return Array.isArray(val) ? (val as unknown[]).filter((v) => typeof v === "number") : [];
  }
  const coords: unknown[] = [];
  for (const child of node.children) {
    if (child.kind === "leaf") {
      const val = side === "from" ? child.from : child.to;
      if (typeof val === "number") coords.push(val);
    }
  }
  return coords;
}

function renderChildren(
  fromParent: HTMLElement,
  toParent: HTMLElement,
  children: DiffNode[],
): void {
  for (const child of children) {
    const key = child.path[child.path.length - 1];
    const keyLabel = key !== undefined ? String(key) : undefined;

    if (child.kind === "leaf") {
      renderLeafPair(fromParent, toParent, child, keyLabel);
    } else {
      renderGroupPair(fromParent, toParent, child, keyLabel);
    }
  }
}

function renderLeafPair(
  fromParent: HTMLElement,
  toParent: HTMLElement,
  leaf: DiffLeaf,
  keyLabel: string | undefined,
): void {
  const { status, from, to } = leaf;

  if (status === "unchanged") {
    renderLeafValue(fromParent, from, keyLabel, null);
    renderLeafValue(toParent, from, keyLabel, null);
  } else if (status === "changed") {
    renderLeafValue(fromParent, from, keyLabel, "gjv-diff-changed");
    renderLeafValue(toParent, to, keyLabel, "gjv-diff-changed");
  } else if (status === "removed") {
    if (isComplexValue(from)) {
      renderLinkedSubtreePair(
        fromParent,
        toParent,
        from,
        keyLabel,
        "gjv-diff-removed",
        "gjv-diff-missing",
      );
    } else {
      renderLeafValue(fromParent, from, keyLabel, "gjv-diff-removed");
      appendSpacer(toParent);
    }
  } else if (status === "added") {
    if (isComplexValue(to)) {
      renderLinkedSubtreePair(
        fromParent,
        toParent,
        to,
        keyLabel,
        "gjv-diff-missing",
        "gjv-diff-added",
      );
    } else {
      appendSpacer(fromParent);
      renderLeafValue(toParent, to, keyLabel, "gjv-diff-added");
    }
  }
}

function renderLeafValue(
  parent: HTMLElement,
  value: unknown,
  keyLabel: string | undefined,
  diffClass: string | null,
): void {
  if (value === undefined) {
    appendSpacer(parent);
    return;
  }

  if (value !== null && typeof value === "object") {
    if (isPositionArray(value)) {
      appendPositionLine(parent, value as unknown[], keyLabel, diffClass);
      return;
    }
    // Non-position object/array: pre-collapsed subtree
    renderGeoJSON(parent, value, [], noAnnotate, keyLabel);
    const el = parent.lastElementChild as HTMLElement;
    if (el && diffClass) {
      applyNodeDiffClass(el, diffClass);
      if (el.classList.contains("gjv-node")) el.classList.add("closed");
    }
    return;
  }

  const line = makeLine(parent);
  if (diffClass) line.classList.add(diffClass);

  if (keyLabel !== undefined) {
    const keySpan = document.createElement("span");
    keySpan.className = "gjv-key";
    keySpan.textContent = `${keyLabel}: `;
    line.appendChild(keySpan);
  }

  appendPrimitive(line, value);
  appendComma(line);
}

/** Fast-path: renders a position-shaped DiffGroup as paired inline lines. */
function renderPositionPair(
  fromParent: HTMLElement,
  toParent: HTMLElement,
  group: DiffGroup,
  keyLabel: string | undefined,
): void {
  const fromCoords = group.children
    .filter((c) => c.kind === "leaf" && c.from !== undefined)
    .map((c) => (c as DiffLeaf).from);
  const toCoords = group.children
    .filter((c) => c.kind === "leaf" && c.to !== undefined)
    .map((c) => (c as DiffLeaf).to);

  const diffClass = group.status === "unchanged" ? null : "gjv-diff-changed";

  appendPositionLine(fromParent, fromCoords, keyLabel, diffClass);
  appendPositionLine(toParent, toCoords, keyLabel, diffClass);
}

/** Creates a .gjv-line and fills it using the shared renderPosition helper. */
function appendPositionLine(
  parent: HTMLElement,
  coords: unknown[],
  keyLabel: string | undefined,
  diffClass: string | null,
): void {
  const line = makeLine(parent);
  if (diffClass) line.classList.add(diffClass);

  if (keyLabel !== undefined) {
    const keySpan = document.createElement("span");
    keySpan.className = "gjv-key";
    keySpan.textContent = `${keyLabel}: `;
    line.appendChild(keySpan);
  }

  renderPosition(line, coords, [], noAnnotate);
}

/**
 * Renders a removed/added complex value (non-position object/array) as a
 * linked collapsible pair. The value is rendered on BOTH sides: active side
 * with its diff class (red/green), the other side with gjv-diff-missing (grey).
 * Both collapse/expand in sync so lines below stay aligned.
 */
function renderLinkedSubtreePair(
  fromParent: HTMLElement,
  toParent: HTMLElement,
  value: unknown,
  keyLabel: string | undefined,
  fromDiffClass: string,
  toDiffClass: string,
): void {
  renderGeoJSON(fromParent, value, [], noAnnotate, keyLabel);
  const fromNode = fromParent.lastElementChild as HTMLElement;

  renderGeoJSON(toParent, value, [], noAnnotate, keyLabel);
  const toNode = toParent.lastElementChild as HTMLElement;

  if (!fromNode || !toNode) return;

  applyNodeDiffClass(fromNode, fromDiffClass);
  applyNodeDiffClass(toNode, toDiffClass);

  fromNode.classList.add("closed");
  toNode.classList.add("closed");

  // Link: each node's header already self-toggles via renderGeoJSON; add cross-toggle
  if (
    fromNode.classList.contains("gjv-node") &&
    toNode.classList.contains("gjv-node")
  ) {
    const fromHeader = fromNode.firstElementChild as HTMLElement;
    const toHeader = toNode.firstElementChild as HTMLElement;
    fromHeader?.addEventListener("click", () =>
      toNode.classList.toggle("closed"),
    );
    toHeader?.addEventListener("click", () =>
      fromNode.classList.toggle("closed"),
    );
  }
}

// ========================================
// DOM Helpers
// ========================================

function makeLinkedCollapsible(
  fromParent: HTMLElement,
  toParent: HTMLElement,
  open: string,
  keyLabel: string | undefined,
): {
  fromBody: HTMLElement;
  toBody: HTMLElement;
  fromNode: HTMLElement;
  toNode: HTMLElement;
} {
  const from = buildCollapsibleNode(fromParent, open, keyLabel);
  const to = buildCollapsibleNode(toParent, open, keyLabel);

  function toggle(): void {
    from.node.classList.toggle("closed");
    to.node.classList.toggle("closed");
  }

  from.header.addEventListener("click", toggle);
  to.header.addEventListener("click", toggle);

  return {
    fromBody: from.body,
    toBody: to.body,
    fromNode: from.node,
    toNode: to.node,
  };
}

function buildCollapsibleNode(
  parent: HTMLElement,
  open: string,
  keyLabel: string | undefined,
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

  const body = document.createElement("div");
  body.className = "gjv-body";
  node.appendChild(body);

  return { node, header, body };
}

/**
 * Applies a diff class to the header line, body, and closing bracket of a
 * .gjv-node, or directly to a single .gjv-line (e.g. empty object/array).
 */
function applyNodeDiffClass(node: HTMLElement, diffClass: string): void {
  if (node.classList.contains("gjv-node")) {
    const header = node.firstElementChild as HTMLElement;
    const body = node.querySelector(":scope > .gjv-body") as HTMLElement;
    const closing = node.lastElementChild as HTMLElement;
    if (header) header.classList.add(diffClass);
    if (body) body.classList.add(diffClass);
    if (closing && closing !== body && closing !== header) {
      closing.classList.add(diffClass);
    }
  } else {
    node.classList.add(diffClass);
  }
}

function makeLine(parent: HTMLElement): HTMLElement {
  const line = document.createElement("div");
  line.className = "gjv-line";
  parent.appendChild(line);
  return line;
}

function appendComma(parent: HTMLElement): void {
  const span = document.createElement("span");
  span.className = "gjv-comma";
  span.textContent = ",";
  parent.appendChild(span);
}

function addClosingLine(node: HTMLElement, bracket: string): void {
  const line = document.createElement("div");
  line.className = "gjv-line";
  line.textContent = bracket;
  appendComma(line);
  node.appendChild(line);
}

function appendSpacer(parent: HTMLElement): void {
  const spacer = document.createElement("div");
  spacer.className = "gjv-diff-spacer";
  parent.appendChild(spacer);
}

// ========================================
// Utilities
// ========================================

/** Coordinate depth for each geometry type (excludes GeometryCollection). */
const COORD_DEPTH: Record<string, number> = {
  Point: 0,
  MultiPoint: 1,
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3,
};

const ARRAY_KEYS = new Set(["features", "geometries", "coordinates"]);

function isGroupArray(group: DiffGroup): boolean {
  if (group.children.length > 0) {
    const firstKey =
      group.children[0].path[group.children[0].path.length - 1];
    return typeof firstKey === "number";
  }
  const lastKey = group.path[group.path.length - 1];
  return typeof lastKey === "number" || ARRAY_KEYS.has(String(lastKey));
}

/**
 * Fast-path position detection: a DiffGroup with 2–3 DiffLeaf children
 * whose keys are numeric and all from/to values are numbers or undefined.
 * Only matches 2–3 elements so 4-element bboxes are excluded.
 */
function isPositionGroup(group: DiffGroup): boolean {
  if (group.children.length < 2 || group.children.length > 3) return false;
  return group.children.every(
    (c) =>
      c.kind === "leaf" &&
      typeof c.path[c.path.length - 1] === "number" &&
      (c.from === undefined || typeof c.from === "number") &&
      (c.to === undefined || typeof c.to === "number"),
  );
}

/**
 * Returns true for position arrays: [lng, lat] or [lng, lat, alt].
 * Capped at 3 so 4-element bboxes are not treated as positions.
 */
function isPositionArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 3 &&
    value.every((v) => typeof v === "number")
  );
}

function isComplexValue(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return !isPositionArray(value);
}

/**
 * If the DiffGroup looks like a GeoJSON geometry (has a "type" child whose
 * from/to value is a known geometry type with coordinates), returns the
 * coordinate depths for each side.
 *
 * When one side's type is unknown, the other side's depth is used as a
 * fallback so we still render positions inline on the known side.
 */
function getGeometryDepths(
  group: DiffGroup,
): { fromDepth: number; toDepth: number } | null {
  const typeChild = group.children.find(
    (c) =>
      c.kind === "leaf" && c.path[c.path.length - 1] === "type",
  ) as DiffLeaf | undefined;

  if (!typeChild) return null;

  const fromDepth =
    typeof typeChild.from === "string"
      ? COORD_DEPTH[typeChild.from]
      : undefined;
  const toDepth =
    typeof typeChild.to === "string" ? COORD_DEPTH[typeChild.to] : undefined;

  if (fromDepth === undefined && toDepth === undefined) return null;

  return {
    fromDepth: fromDepth ?? toDepth!,
    toDepth: toDepth ?? fromDepth!,
  };
}
