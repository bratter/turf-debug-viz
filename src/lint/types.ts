/**
 * Linter types.
 */

/** An object access path */
export type Path = (string | number)[];

/** User-provided settings for a lint run */
export interface LintSettings {
  /** Only run lints matching these tags (all tags if unset) */
  tags?: Tag[];
}

/** Per-scope options that cascade to children via {@link withScope} */
export interface ScopeOptions {
  /** Suppress passing results in this scope */
  quiet?: boolean;
}

/** Context threaded through the entire lint tree */
export interface LintContext {
  /** User-provided settings, immutable for the lint run */
  readonly settings: LintSettings;
  /** Shared mutable state for cross-check coordination (keyed by symbols) */
  readonly state: Record<symbol, unknown>;
  /** Per-scope options, shallow-copied when narrowing */
  readonly scope: ScopeOptions;
}

/** Lint severity levels */
export const enum Severity {
  Info = 0,
  Warn = 1,
  Error = 2,
}

/** Tags for filtering test types */
export type Tag = "Schema" | "Geometry";

/**
 * The callback function that runs the Lint.
 *
 * Returns null or undefined on success, or an appropriate error message on
 * failure.
 */
export type TestFn<T = unknown> = (
  target: T,
  ctx: LintContext,
) => string | undefined;

/**
 * The callback function that builds a LintGroup.
 */
export type GroupFn<T = unknown> = (
  item: T,
  ctx: LintContext,
  path: Path,
) => LintResultGroup | undefined;

/**
 * Specification for an individual lint.
 */
export interface Lint<T = unknown> {
  /** Unique name of the lint */
  name: string;
  /** Human readable lint description */
  description: string;
  /** Severity level of the lint */
  severity: Exclude<Severity, "Ok">;
  /** Tag for filtering */
  tag: Tag;
  /** Hint for the lint runner to skip but mark as passed when undefined **/
  optional?: boolean;
  /** The linting function to run */
  test: TestFn<T>;
}

/**
 * Specification for a lint result.
 */
export interface LintResult extends Omit<Lint, "test" | "optional"> {
  /** Path from the object root to the member under test */
  path: Path;
  /** Whether the lint succeeded */
  passed: boolean;
  /** Optional failure message */
  message?: string;
}

/**
 * Specification for a group of lints.
 */
export interface LintResultGroup {
  /** Friendly name for the group of lints */
  name: string;
  /** Path from the object root to the starting point of the lint */
  path: Path;
  /** Child results and groups */
  results: (LintResult | LintResultGroup)[];
  /** The maximum severity level of failures in the underlying results */
  severity: Severity;
  /** Whether all children passed */
  passed: boolean;
  /** Number of direct children before any quiet filtering */
  children: number;
  /** Total number of leaf LintResult nodes in the subtree */
  total: number;
}

/**
 * Builder returned by {@link resultGroup} for assembling lint results.
 */
export interface ResultGroupBuilder {
  /** The shared lint context. */
  readonly ctx: LintContext;
  /** The resolved path of this builder. */
  readonly path: Path;
  /**
   * Run a lint against a target, push the result, and return whether it passed.
   *
   * When a segment is provided (string or number), accesses
   * `target[segment]` and appends the segment to the path.
   */
  check<T = unknown>(lint: Lint<T>, target: unknown, segment?: string | number): boolean;
  /**
   * Run a lint against a target and return whether it passed, without
   * pushing any result. Same value resolution as {@link check}.
   */
  test<T = unknown>(lint: Lint<T>, target: unknown, segment?: string | number): boolean;
  /** Run a lint or group function against every element in an array, wrapping results in a named group. */
  checkAll<T = unknown>(
    name: string,
    lintOrFn: Lint<T> | GroupFn<T>,
    target: T[],
    options?: { quiet?: boolean; segment?: string | number },
  ): void;
  /**
   * Call a group function and add the returned group as a child.
   *
   * When a segment is provided (string or number), accesses
   * `target[segment]` and appends the segment to the child path.
   */
  group<T = unknown>(fn: GroupFn, target: T, segment?: string | number): void;
  /**
   * Call a group function and merge its results into this group (no nesting).
   *
   * Same value resolution as {@link group}, but the returned group's
   * results are spread into this builder rather than added as a child group.
   */
  inline<T = unknown>(fn: GroupFn, target: T, segment?: string | number): void;
  /** Push pre-built results or child groups. Undefined values are silently ignored. */
  add(...child: (LintResult | LintResultGroup | undefined)[]): void;
  /** Finalize and return the result group. */
  build(): LintResultGroup;
}
