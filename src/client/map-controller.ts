/**
 * MapController - Event-driven coordination between state and map
 *
 * Listens to ViewState, DiffState, and mode change events to translate
 * state changes into map operations. Keeps client.ts focused on UI and
 * map.ts focused on Mapbox operations.
 */

import type { ViewRow, DiffEntry } from "../../types.js";
import { MapView } from "./map.ts";
import { viewState } from "./view.ts";
import { diffState } from "./diff.ts";
import { Mode, getCurrentMode, getAutoFit } from "./mode-menu.ts";
import { computeDiffOverlay } from "../diff/overlay.ts";

const geojsonView = document.getElementById("geojson-view") as HTMLElement;

class MapController {
  private map: MapView;

  constructor(map: MapView) {
    this.map = map;

    // Listen to ViewState changes
    viewState.addEventListener("change", (e) => {
      const detail = e.detail;

      switch (detail.type) {
        case "add":
          this.handleViewAdd(detail.row);
          break;
        case "delete":
          this.map.removeFromMap(detail.index);
          if (getCurrentMode() === Mode.VIEW) this.scheduleAutofit();
          break;
        case "update":
          if (getCurrentMode() === Mode.VIEW) {
            this.map.setLayerVisibility(detail.row.index, !detail.row.isHidden);
          }
          break;
        case "activate":
          if (getCurrentMode() === Mode.VIEW && getAutoFit() && detail.row) {
            this.map.scheduleFit([detail.row.index]);
          }
          break;
        case "clear":
          this.map.clearMap(detail.rows);
          break;
      }
    });

    // Listen to DiffState changes
    diffState.addEventListener("change", (e) => {
      const detail = e.detail;

      switch (detail.type) {
        case "activate":
          this.handleDiffActivate(detail.diff);
          break;
        case "clear":
          // If in diff mode, all shapes are now hidden
          if (getCurrentMode() === Mode.DIFF) {
            this.applyDiffModeVisibility(null);
          }
          break;
      }
    });

    // Listen to mode changes
    window.addEventListener("modechange", (e) => {
      this.handleModeChange(e.detail);
    });
  }

  // ========================================
  // State Handlers
  // ========================================

  private handleViewAdd(row: ViewRow): void {
    this.map.addToMap(row);
    const visible = this.shouldRowBeVisible(row);
    this.map.setLayerVisibility(row.index, visible);

    if (visible) this.scheduleAutofit();
  }

  private handleDiffActivate(diff: DiffEntry | null): void {
    if (getCurrentMode() !== Mode.DIFF) return;

    this.applyDiffModeVisibility(diff);
    this.applyDiffOverlay(diff);

    if (getAutoFit() && diff) {
      // In diff mode, fit to indices regardless of isHidden
      this.map.scheduleFit([diff.from.index, diff.to.index], false);
    }
  }

  // ========================================
  // Mode Change Handler
  // ========================================

  private handleModeChange(mode: Mode): void {
    if (mode === Mode.VIEW) {
      this.applyViewModeVisibility();
      this.map.setDiffOverlay(null);
    } else {
      const diff = diffState.getActiveDiff();
      this.applyDiffModeVisibility(diff);
      this.applyDiffOverlay(diff);
    }
    this.scheduleAutofit();
  }

  // ========================================
  // Diff Overlay Helper
  // ========================================

  private applyDiffOverlay(diff: DiffEntry | null): void {
    if (!diff) {
      this.map.setDiffOverlay(null);
      geojsonView.textContent = "";
      return;
    }
    const { overlay, error } = computeDiffOverlay(diff.from.geojson, diff.to.geojson);
    this.map.setDiffOverlay(overlay ?? null);
    geojsonView.textContent = "";
    if (error) {
      const p = document.createElement("p");
      p.className = "overlay-error";
      p.textContent = error;
      geojsonView.appendChild(p);
    }
  }

  // ========================================
  // Visibility Helpers
  // ========================================

  private applyViewModeVisibility(): void {
    for (const row of viewState.getRows()) {
      this.map.setLayerVisibility(row.index, !row.isHidden);
    }
  }

  private applyDiffModeVisibility(diff: DiffEntry | null): void {
    // Hide all shapes first
    for (const row of viewState.getRows()) {
      this.map.setLayerVisibility(row.index, false);
    }

    // Show only activeDiff shapes (regardless of isHidden)
    if (diff) {
      this.map.setLayerVisibility(diff.from.index, true);
      this.map.setLayerVisibility(diff.to.index, true);
    }
  }

  // ========================================
  // Autofit Helpers
  // ========================================

  private scheduleAutofit(): void {
    if (!getAutoFit()) return;

    const mode = getCurrentMode();
    if (mode === Mode.VIEW) {
      this.map.scheduleFit();
    } else {
      const diff = diffState.getActiveDiff();
      if (diff) {
        // In diff mode, fit to indices regardless of isHidden
        this.map.scheduleFit([diff.from.index, diff.to.index], false);
      }
    }
  }

  private shouldRowBeVisible(row: ViewRow): boolean {
    if (getCurrentMode() === Mode.VIEW) {
      return !row.isHidden;
    }

    const diff = diffState.getActiveDiff();
    return diff
      ? row.index === diff.from.index || row.index === diff.to.index
      : false;
  }
}

export { MapController };
