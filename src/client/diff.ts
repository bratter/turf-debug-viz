/**
 * Diff mode state management
 *
 * Holds DiffEntry state and emits 'change' events when state mutates.
 * Extends native EventTarget for typed event handling.
 */

import type { DiffEntry, ViewRow } from "../../types.js";
import { create } from "d3-selection";
import { viewState } from "./view.ts";
import { Mode, changeMode } from "./mode-menu.ts";

// ========================================
// Event Types
// ========================================

export type DiffStateChangeDetail =
  | { type: "add"; diff: DiffEntry }
  | { type: "delete"; id: number }
  | { type: "activate"; diff: DiffEntry | null }
  | { type: "clear" }
  | { type: "selection" };

interface DiffStateEventMap {
  change: CustomEvent<DiffStateChangeDetail>;
}

// ========================================
// DiffState Class
// ========================================

// Interface merging for typed event listeners (no runtime cost)
interface DiffState {
  addEventListener<K extends keyof DiffStateEventMap>(
    type: K,
    listener: (ev: DiffStateEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof DiffStateEventMap>(
    type: K,
    listener: (ev: DiffStateEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * State management class for diff data
 */
class DiffState extends EventTarget {
  private diffs: DiffEntry[] = [];
  private nextId = 0;
  private activeDiffId: number | null = null;

  // Selection state for "new diff" workflow
  private selectionActive = false;
  private selectedFrom: number | null = null;
  private selectedTo: number | null = null;

  /** Whether to auto-activate new diffs when added */
  autoActivate = true;

  /** Get all diffs (readonly to prevent external mutation) */
  getDiffs(): readonly DiffEntry[] {
    return this.diffs;
  }

  /** Get a single diff by its id */
  getDiff(id: number): DiffEntry | undefined {
    return this.diffs.find((d) => d.id === id);
  }

  /** Get the currently active diff, or null if none */
  getActiveDiff(): DiffEntry | null {
    if (this.activeDiffId === null) return null;
    return this.getDiff(this.activeDiffId) ?? null;
  }

  /** Add a new diff from two ViewRows */
  addDiff(from: ViewRow, to: ViewRow, label?: string): DiffEntry {
    const diff: DiffEntry = {
      id: this.nextId++,
      from,
      to,
      label,
      ts: Date.now(),
    };

    this.diffs.push(diff);
    this.emit({ type: "add", diff });

    if (this.autoActivate) {
      this.setActiveDiff(diff.id);
    }

    return diff;
  }

  /** Delete a diff by its id */
  deleteDiff(id: number): void {
    const index = this.diffs.findIndex((d) => d.id === id);
    if (index === -1) return;

    this.diffs.splice(index, 1);

    this.emit({ type: "delete", id });

    // Clear active if it was the deleted diff
    if (this.activeDiffId === id) {
      this.setActiveDiff(null);
    }
  }

  /** Set the active diff by id, or null to clear */
  setActiveDiff(id: number | null) {
    if (id === null) {
      this.activeDiffId = null;
      return this.emit({ type: "activate", diff: null });
    }
    if (this.activeDiffId === id) return;

    const diff = this.getDiff(id);
    if (!diff) return;

    this.activeDiffId = id;
    this.emit({ type: "activate", diff });
  }

  /** Clear all diffs */
  clear(): void {
    this.diffs = [];
    this.nextId = 0;
    this.activeDiffId = null;
    this.emit({ type: "clear" });
  }

  // ========================================
  // Selection (new diff workflow)
  // ========================================

  isSelecting(): boolean {
    return this.selectionActive;
  }

  selectionFrom(): number | null {
    return this.selectedFrom;
  }

  selectionTo(): number | null {
    return this.selectedTo;
  }

  /** Pick a row index for from/to. Toggle-deselects if already selected. */
  select(index: number): void {
    if (!this.selectionActive) return;

    if (this.selectedFrom === index) {
      this.selectedFrom = null;
    } else if (this.selectedTo === index) {
      this.selectedTo = null;
    } else if (this.selectedFrom === null) {
      this.selectedFrom = index;
    } else if (this.selectedTo === null) {
      this.selectedTo = index;
    } else {
      this.selectedTo = index;
    }
    this.emit({ type: "selection" });
  }

  startSelection(): void {
    this.selectionActive = true;
    this.selectedFrom = null;
    this.selectedTo = null;
    this.emit({ type: "selection" });
  }

  cancelSelection(): void {
    this.selectionActive = false;
    this.selectedFrom = null;
    this.selectedTo = null;
    this.emit({ type: "selection" });
  }

  /** Confirm selection: create a diff from the selected rows and exit selection. */
  confirmSelection(label?: string): void {
    if (this.selectedFrom === null || this.selectedTo === null) return;

    const fromRow = viewState.getRow(this.selectedFrom);
    const toRow = viewState.getRow(this.selectedTo);
    if (!fromRow || !toRow) return;

    this.addDiff(fromRow, toRow, label);
    this.cancelSelection();
  }

  private emit(detail: DiffStateChangeDetail): void {
    this.dispatchEvent(new CustomEvent("change", { detail }));
  }
}

// ========================================
// Singleton Export
// ========================================

export const diffState = new DiffState();

// ========================================
// Diff Menu UI
// ========================================

export function buildDiffMenu(): HTMLElement[] {
  const left = create("ul");
  const right = create("ul");

  // The mode indicator (click to switch)
  left
    .append("li")
    .text("diff")
    .on("click", () => changeMode(Mode.VIEW));
  const statusLi = left.append("li");

  // Normal state: "New diff" button
  const newDiffLi = right.append("li");
  newDiffLi
    .append("button")
    .text("New diff")
    .on("click", () => diffState.startSelection());

  // Selecting state: label input, Cancel, Create
  const labelLi = right.append("li");
  const labelInput = labelLi
    .append("input")
    .attr("type", "text")
    .attr("placeholder", "Label (optional)")
    .on("keyup", (e: KeyboardEvent) => e.stopPropagation());

  const cancelLi = right.append("li");
  cancelLi
    .append("button")
    .text("Cancel")
    .on("click", () => diffState.cancelSelection());

  const createLi = right.append("li");
  const createBtn = createLi
    .append("button")
    .text("Create")
    .on("click", () => {
      const label =
        (labelInput.node() as HTMLInputElement).value.trim() || undefined;
      diffState.confirmSelection(label);
    });

  function updateMenu() {
    const selecting = diffState.isSelecting();

    if (selecting) {
      newDiffLi.style("display", "none");
      labelLi.style("display", null);
      cancelLi.style("display", null);
      createLi.style("display", null);

      const ready =
        diffState.selectionFrom() !== null && diffState.selectionTo() !== null;
      createBtn.property("disabled", !ready);

      if (diffState.selectionFrom() === null) {
        statusLi.text("new diff: select from");
      } else if (diffState.selectionTo() === null) {
        statusLi.text("new diff: select to");
      } else {
        statusLi.text("new diff: ready to confirm");
      }
    } else {
      newDiffLi.style("display", null);
      labelLi.style("display", "none");
      cancelLi.style("display", "none");
      createLi.style("display", "none");
      labelInput.property("value", "");
      statusLi.text("");
    }
  }

  // Initial state
  updateMenu();

  diffState.addEventListener("change", (e) => {
    if (e.detail.type === "selection") updateMenu();
  });
  window.addEventListener("modechange", () => {
    if (diffState.isSelecting()) diffState.cancelSelection();
  });

  return [left.node()!, right.node()!];
}
