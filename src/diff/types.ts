export type Path = (string | number)[];

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

/** A leaf node: a single value at a path that has been compared */
export interface DiffLeaf {
  kind: "leaf";
  path: Path;
  status: DiffStatus;
  from: unknown; // undefined when status = "added"
  to: unknown; // undefined when status = "removed"
}

/** A group node: an object or array with children, status = worst of children */
export interface DiffGroup {
  kind: "group";
  path: Path;
  status: DiffStatus;
  children: DiffNode[];
}

export type DiffNode = DiffLeaf | DiffGroup;

export interface DiffResult {
  root: DiffGroup;
  hasChanges: boolean;
}
