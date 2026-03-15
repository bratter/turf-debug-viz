/**
 * Mode-aware sidebar list renderer.
 *
 * Renders ViewRows in VIEW mode and DiffEntries in DIFF mode using
 * d3 selection.join() for efficient keyed DOM reconciliation.
 */

import { select, type Selection } from "d3-selection";
import type { ViewRow, DiffEntry } from "../../types.js";
import {
  getFeatureColor,
  createMetadataHTML,
  createDiffMetadataHTML,
} from "./helpers.ts";
import { viewState } from "./view.ts";
import { diffState } from "./diff.ts";
import { Mode, getCurrentMode } from "./mode-menu.ts";

/**
 * Initialize the sidebar list renderer.
 *
 * Subscribes to viewState, diffState, modechange, and themechange events
 * and re-renders the #log element accordingly.
 */
export function initList() {
  const log = select<HTMLUListElement, unknown>("#log");

  function render() {
    let isEmpty: boolean;
    let placeholderText: string;

    if (getCurrentMode() === Mode.DIFF && !diffState.isSelecting()) {
      renderDiffList(log);
      isEmpty = diffState.getDiffs().length === 0;
      placeholderText = "No diffs yet";
    } else {
      renderViewList(log);
      isEmpty = viewState.getRows().length === 0;
      placeholderText = "No items yet";
    }

    log
      .selectAll<HTMLLIElement, number>(".empty-placeholder")
      .data(isEmpty ? [1] : [])
      .join(
        (enter) =>
          enter.append("li").attr("class", "empty-placeholder").text(placeholderText),
        (update) => update.text(placeholderText),
        (exit) => exit.remove(),
      );
  }

  // Initial render
  render();

  // ========================================
  // Event Handlers
  // ========================================

  viewState.addEventListener("change", render);
  diffState.addEventListener("change", render);
  window.addEventListener("modechange", render);
  window.addEventListener("themechange", render);
}

// ========================================
// View Mode Rendering
// ========================================

function renderViewList(
  log: Selection<HTMLUListElement, unknown, HTMLElement, unknown>,
) {
  const rows = [...viewState.getRows()].reverse();
  const selecting = diffState.isSelecting();

  log.classed("selecting", selecting);

  log.selectAll(".row.diff-row").remove();

  log
    .selectAll<HTMLLIElement, ViewRow>(".row:not(.diff-row)")
    .data(rows, (d) => d.index)
    .join((enter) => {
      const row = enter
        .append("li")
        .classed("row", true)
        .on("click", (_, d) => {
          if (diffState.isSelecting()) {
            diffState.select(d.index);
          } else {
            viewState.setActiveRow(d.index);
          }
        });

      row.append("span").html(createMetadataHTML);
      row
        .append("div")
        .attr("class", "row-buttons")
        .call(addButton, "visibility-btn", "\u{1F441}\uFE0F", (d: ViewRow) => {
          const r = viewState.getRow(d.index);
          if (r) viewState.setHidden(d.index, !r.isHidden);
        }, "Toggle visibility")
        .call(addButton, "solo-btn", "◎", (d: ViewRow) => {
          viewState.soloRow(d.index);
        }, "Solo — hide all others (Shift+Enter)")
        .call(addButton, "zoom-btn", "\u{1F50D}", (d: ViewRow) => {
          window.map?.scheduleFit([d.index]);
        }, "Zoom to fit")
        .call(addButton, "delete-btn", "\u{1F5D1}\uFE0F", (d: ViewRow) => {
          viewState.deleteRow(d.index);
        }, "Delete");

      return row;
    })
    .classed("hidden", (d) => d.isHidden)
    .classed(
      "active",
      (d) => viewState.getActiveRow()?.index === d.index,
    )
    .classed(
      "selected-from",
      (d) => selecting && diffState.selectionFrom() === d.index,
    )
    .classed(
      "selected-to",
      (d) => selecting && diffState.selectionTo() === d.index,
    )
    .style("--row-color", (d) => getFeatureColor(d.index))
    .order();
}

// ========================================
// Diff Mode Rendering
// ========================================

function renderDiffList(
  log: Selection<HTMLUListElement, unknown, HTMLElement, unknown>,
): void {
  const diffs = [...diffState.getDiffs()].reverse();

  log.selectAll(".row:not(.diff-row)").remove();

  log
    .selectAll<HTMLLIElement, DiffEntry>(".row.diff-row")
    .data(diffs, (d) => d.id)
    .join((enter) => {
      const row = enter
        .append("li")
        .classed("row", true)
        .classed("diff-row", true)
        .on("click", (_, d) => {
          diffState.setActiveDiff(d.id);
        });

      row.append("span").html(createDiffMetadataHTML);
      row
        .append("div")
        .attr("class", "row-buttons")
        .call(addButton, "zoom-btn", "\u{1F50D}", (d: DiffEntry) => {
          window.map?.scheduleFit([d.from.index, d.to.index], true);
        }, "Zoom to fit")
        .call(addButton, "delete-btn", "\u{1F5D1}\uFE0F", (d: DiffEntry) => {
          diffState.deleteDiff(d.id);
        }, "Delete");

      return row;
    })
    .classed("active", (d) => diffState.getActiveDiff()?.id === d.id)
    .style("--swatch-from", (d) => getFeatureColor(d.from.index))
    .style("--swatch-to", (d) => getFeatureColor(d.to.index))
    .order();
}

function addButton<D>(
  container: Selection<HTMLDivElement, D, any, any>,
  cls: string,
  icon: string,
  action: (d: D) => void,
  title?: string,
) {
  container
    .append("button")
    .attr("class", cls)
    .attr("title", title ?? null)
    .text(icon)
    .on("click", (e: MouseEvent, d: D) => {
      e.stopPropagation();
      action(d);
    });
}
