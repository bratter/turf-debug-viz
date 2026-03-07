/**
 * Diff tree renderer for the #geojson-view panel in DIFF mode.
 *
 * Shows two side-by-side collapsible GeoJSON trees with diff-status
 * highlights. Shares the core rendering logic from gjv-render.ts.
 */

import { diffState } from "./diff.ts";
import { Mode, getCurrentMode } from "./mode-menu.ts";
import { diffGeoJSON } from "../diff/engine.ts";
import { renderDiffPair } from "./diff-render.ts";
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

    container.classList.add("gjv-diff-layout");

    const fromCol = document.createElement("div");
    fromCol.className = "gjv-diff-col gjv-diff-from";

    const toCol = document.createElement("div");
    toCol.className = "gjv-diff-col gjv-diff-to";

    // Column headers
    fromCol.appendChild(makeDiffColHeader("from", diff.from));
    toCol.appendChild(makeDiffColHeader("to", diff.to));

    // Render both trees in lockstep for alignment + synchronized collapse
    const fromRoot = document.createElement("div");
    fromRoot.className = "gjv-root";
    fromCol.appendChild(fromRoot);

    const toRoot = document.createElement("div");
    toRoot.className = "gjv-root";
    toCol.appendChild(toRoot);

    renderDiffPair(fromRoot, toRoot, result);

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
// Column Header
// ========================================

function makeDiffColHeader(side: "from" | "to", row: ViewRow): HTMLElement {
  const header = document.createElement("header");
  const prefix = side === "from" ? "From" : "To";
  header.textContent = row.label ? `${prefix}: ${row.label}` : prefix;
  return header;
}
