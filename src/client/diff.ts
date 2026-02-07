/**
 * Diff mode state management
 *
 * Holds DiffEntry state and emits 'change' events when state mutates.
 * Extends native EventTarget for typed event handling.
 */

import type { DiffEntry, ViewRow } from "../../types.js";
import { create } from "d3-selection";

// ========================================
// Event Types
// ========================================

export type DiffStateChangeDetail =
  | { type: "add"; diff: DiffEntry }
  | { type: "delete"; id: number }
  | { type: "activate"; diff: DiffEntry | null }
  | { type: "clear" };

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

  // The mode indicator
  left.append("li").text("diff");

  right
    .append("li")
    .append("button")
    .text("New diff")
    .on("click", () =>
      console.log("diff - new diff (needs shape selection UI)"),
    );

  return [left.node()!, right.node()!];
}
