/**
 * GeoJSON interactive tree renderer for the #geojson-view panel.
 *
 * Listens to viewState "activate" events and renders a collapsible
 * JavaScript-object-style view of the activated GeoJSON, with lint
 * result icons overlaid at matching paths.
 */

import { lintFlat } from "../lint/index.ts";
import type { LintResult, Path } from "../lint/types.ts";
import { Severity } from "../lint/types.ts";
import { viewState } from "./view.ts";
import { Mode } from "./mode-menu.ts";
import type { ViewRow } from "../../types.js";
import { renderGeoJSON, removeLastComma } from "./gjv-render.ts";
import type { AnnotationFn } from "./gjv-render.ts";

// ========================================
// Public API
// ========================================

export function initGeoJsonView(): void {
  const container = document.getElementById("geojson-view") as HTMLElement;

  function renderRow(row: ViewRow | null): void {
    container.innerHTML = "";
    if (row === null) {
      const p = document.createElement("p");
      p.className = "empty-placeholder";
      p.textContent = "Select an item to inspect";
      container.appendChild(p);
      return;
    }
    const geojson = row.geojson;
    const lintGroup = lintFlat(geojson);
    const lints = buildLintMap(lintGroup.results as LintResult[]);
    const annotate = makeLintAnnotations(lints);
    const root = document.createElement("div");
    root.className = "gjv-root";
    container.appendChild(root);
    renderGeoJSON(root, geojson, [], annotate);
    // Root-level object has no enclosing collection — remove its closing comma.
    removeLastComma(root);
  }

  // Initial render
  renderRow(viewState.getActiveRow());

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
// Lint Annotation Provider
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

function makeLintAnnotations(lints: Map<string, LintResult[]>): AnnotationFn {
  return (line, path) => renderLintIcons(line, path, lints);
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
