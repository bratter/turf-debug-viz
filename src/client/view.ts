/**
 * View mode state management
 *
 * Holds ViewRow state and emits 'change' events when state mutates.
 * Extends native EventTarget for typed event handling.
 */

import type { SendMessage, ViewRow } from "../../types.js";
import { create } from "d3-selection";
import { Mode, changeMode } from "./mode-menu.ts";

// ========================================
// Event Types
// ========================================

export type ViewStateChangeDetail =
  | { type: "add"; row: ViewRow }
  | { type: "delete"; index: number }
  | { type: "update"; row: ViewRow }
  | { type: "activate"; row: ViewRow | null }
  | { type: "clear"; rows: ViewRow[] };

interface ViewStateEventMap {
  change: CustomEvent<ViewStateChangeDetail>;
}

// ========================================
// ViewState Class
// ========================================

// Interface merging for typed event listeners (no runtime cost)
interface ViewState {
  addEventListener<K extends keyof ViewStateEventMap>(
    type: K,
    listener: (ev: ViewStateEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof ViewStateEventMap>(
    type: K,
    listener: (ev: ViewStateEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * State management class for main view data
 */
class ViewState extends EventTarget {
  private rows: ViewRow[] = [];
  private nextIndex = 0;
  private activeRowIndex: number | null = null;

  /**
   * Get all rows (readonly to prevent external mutation)
   */
  getRows(): readonly ViewRow[] {
    return this.rows;
  }

  /**
   * Get a single row by its stable index
   */
  getRow(index: number): ViewRow | undefined {
    return this.rows.find((r) => r.index === index);
  }

  /**
   * Get the currently active row, or null if none
   */
  getActiveRow(): ViewRow | null {
    if (this.activeRowIndex === null) return null;
    return this.getRow(this.activeRowIndex) ?? null;
  }

  /**
   * Set the active row by index, or null to clear
   */
  setActiveRow(index: number | null): void {
    if (index === null) {
      this.activeRowIndex = null;
      return this.emit({ type: "activate", row: null });
    }
    if (this.activeRowIndex === index) return;

    const row = this.getRow(index);
    if (!row) return;

    this.activeRowIndex = index;
    this.emit({ type: "activate", row });
  }

  /**
   * Add a new row from an incoming SendMessage
   */
  addRow(message: SendMessage): ViewRow {
    const row: ViewRow = {
      ...message,
      index: this.nextIndex++,
      isExpanded: false,
      isHidden: false,
    };

    this.rows.push(row);
    this.emit({ type: "add", row });
    return row;
  }

  /**
   * Delete a row by its stable index
   */
  deleteRow(index: number): void {
    const arrayIndex = this.rows.findIndex((r) => r.index === index);
    if (arrayIndex === -1) return;

    this.rows.splice(arrayIndex, 1);
    this.emit({ type: "delete", index });

    if (this.activeRowIndex === index) {
      this.setActiveRow(null);
    }
  }

  /**
   * Set the expanded state of a row
   */
  setExpanded(index: number, expanded: boolean): void {
    const row = this.getRow(index);
    if (!row || row.isExpanded === expanded) return;

    row.isExpanded = expanded;
    this.emit({ type: "update", row });
  }

  /**
   * Set the hidden state of a row
   */
  setHidden(index: number, hidden: boolean): void {
    const row = this.getRow(index);
    if (!row || row.isHidden === hidden) return;

    row.isHidden = hidden;
    this.emit({ type: "update", row });
  }

  /**
   * Clear all rows
   */
  clear(): void {
    const rows = this.rows;
    this.rows = [];
    this.nextIndex = 0;
    this.activeRowIndex = null;
    this.emit({ type: "clear", rows });
  }

  private emit(detail: ViewStateChangeDetail): void {
    this.dispatchEvent(new CustomEvent("change", { detail }));
  }
}

// ========================================
// Singleton Export
// ========================================

export const viewState = new ViewState();

// ========================================
// View Menu UI
// ========================================

export function buildViewMenu(): HTMLElement[] {
  const left = create("ul");
  const right = create("ul");

  // The mode indicator (click to switch)
  left
    .append("li")
    .text("view")
    .on("click", () => changeMode(Mode.DIFF));

  // The clear-all button
  right
    .append("li")
    .append("button")
    .text("Clear all")
    .on("click", () => viewState.clear());

  return [left.node()!, right.node()!];
}
