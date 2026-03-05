/**
 * Diff tree renderer for the #geojson-view panel in DIFF mode.
 *
 * Shows two side-by-side collapsible GeoJSON trees with diff-status
 * highlights. Shares the core rendering logic from gjv-render.ts.
 */

import { diffState } from "./diff.ts";
import { Mode, getCurrentMode } from "./mode-menu.ts";
import { diffGeoJSON, buildDiffMap } from "../diff/engine.ts";
import { renderGeoJSON, removeLastComma } from "./gjv-render.ts";
import type { AnnotationFn } from "./gjv-render.ts";
import type { DiffStatus } from "../diff/types.ts";
import type { DiffEntry, ViewRow } from "../../types.js";

// ========================================
// Public API
// ========================================

export function initDiffView(): void {
  const container = document.getElementById("geojson-view") as HTMLElement;

  function renderDiff(diff: DiffEntry | null): void {
    container.innerHTML = "";
    container.classList.remove("gjv-diff-layout");
    if (!diff) return;

    const result = diffGeoJSON(diff.from.geojson, diff.to.geojson, {
      normalize: true,
    });
    const diffMap = buildDiffMap(result);

    container.classList.add("gjv-diff-layout");

    const fromCol = document.createElement("div");
    fromCol.className = "gjv-diff-col gjv-diff-from";

    const toCol = document.createElement("div");
    toCol.className = "gjv-diff-col gjv-diff-to";

    // Column headers
    fromCol.appendChild(makeDiffColHeader("from", diff.from));
    toCol.appendChild(makeDiffColHeader("to", diff.to));

    // Render both trees
    const fromAnnotate = makeDiffAnnotations(diffMap, "from");
    const toAnnotate = makeDiffAnnotations(diffMap, "to");

    const fromRoot = document.createElement("div");
    fromRoot.className = "gjv-root";
    fromCol.appendChild(fromRoot);
    renderGeoJSON(fromRoot, diff.from.geojson, [], fromAnnotate);
    removeLastComma(fromRoot);

    const toRoot = document.createElement("div");
    toRoot.className = "gjv-root";
    toCol.appendChild(toRoot);
    renderGeoJSON(toRoot, diff.to.geojson, [], toAnnotate);
    removeLastComma(toRoot);

    container.appendChild(fromCol);
    container.appendChild(toCol);
  }

  diffState.addEventListener("change", (e) => {
    if (getCurrentMode() !== Mode.DIFF) return;
    if (e.detail.type === "activate") renderDiff(e.detail.diff);
    if (e.detail.type === "clear") renderDiff(null);
  });

  // Note: geojson-view.ts registers its modechange listener first (registered
  // before initDiffView in index.ts), so when entering DIFF mode it clears
  // the container before this handler renders the diff.
  window.addEventListener("modechange", (e) => {
    if (e.detail === Mode.DIFF) {
      renderDiff(diffState.getActiveDiff());
    } else {
      // geojson-view.ts handles rendering the view row; just remove diff layout.
      container.classList.remove("gjv-diff-layout");
    }
  });
}

// ========================================
// Diff Annotation Provider
// ========================================

function makeDiffAnnotations(
  diffMap: Map<string, DiffStatus>,
  side: "from" | "to",
): AnnotationFn {
  return (line, path) => {
    const status = diffMap.get(JSON.stringify(path));
    if (!status || status === "unchanged") return;

    let cls: string;
    if (status === "removed") {
      cls = side === "from" ? "gjv-diff-removed" : "gjv-diff-missing";
    } else if (status === "added") {
      cls = side === "from" ? "gjv-diff-missing" : "gjv-diff-added";
    } else {
      // changed: only highlight this line, no subtree propagation needed
      line.classList.add("gjv-diff-changed");
      return;
    }

    line.classList.add(cls);

    // For removed/added/missing: also mark the parent .gjv-node so CSS can
    // propagate the highlight to the entire body and closing bracket.
    if (line.parentElement?.classList.contains("gjv-node")) {
      line.parentElement.classList.add(cls);
    }
  };
}

// ========================================
// Column Header
// ========================================

function makeDiffColHeader(side: "from" | "to", row: ViewRow): HTMLElement {
  const header = document.createElement("header");
  const prefix = side === "from" ? "From" : "To";
  header.textContent = row.label ? `${prefix}: ${row.label}` : prefix;
  return header;
}
