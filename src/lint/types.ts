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

/** Per-scope data that cascade to children via {@link withScope} */
export interface Scope {
  /** The parent GeoJson object to enable lints to backtrack */
  parent?: unknown;
}

/** Context threaded through the entire lint tree */
export interface LintContext {
  /** User-provided settings, immutable for the lint run */
  readonly settings: LintSettings;
  /** Shared mutable state for cross-check coordination (keyed by symbols) */
  readonly state: Record<symbol, unknown>;
  /** Per-scope options, shallow-copied when narrowing */
  readonly scope: Scope;
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
) => string | boolean;

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
  /** Number of direct children */
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
   * Does the builder currently pass given the severity level.
   *
   * Restricts to the passed tag if one is provided. Level defaults to Error.
   * Useful for gating subsequent lints if Schema lints fail.
   */
  hasFailure(tag?: Tag, atOrAbove?: Severity): boolean;
  /** Special case of hasFailure for Schema errors */
  hasSchemaError(): boolean;
  /** Run a lint directly against a target value. */
  check<T = unknown>(lint: Lint<T>, target: T): boolean;
  /** Run a lint against an object property (`target[segment]`). */
  check<T = unknown>(
    lint: Lint<T | undefined>,
    target: Record<string, T>,
    segment: string,
  ): boolean;
  /** Run a lint against an array element (`target[segment]`). */
  check<T = unknown>(
    lint: Lint<T | undefined>,
    target: T[],
    segment: number,
  ): boolean;
  /** Run a lint or group function against every element in an array, wrapping results in a named group. */
  checkAll<T = unknown>(
    name: string,
    lintOrFn: Lint<T> | GroupFn<T>,
    target: T[],
    options?: { segment?: string | number },
  ): void;
  /** Call a group function directly against a target value. */
  group<T = unknown>(fn: GroupFn<T>, target: T): void;
  /** Call a group function against an object property (`target[segment]`). */
  group<T = unknown>(
    fn: GroupFn<T>,
    target: Record<string, T>,
    segment: string,
  ): void;
  /** Call a group function against an array element (`target[segment]`). */
  group<T = unknown>(fn: GroupFn<T>, target: T[], segment: number): void;
  /** Push pre-built results or child groups. Undefined values are silently ignored. */
  add(...child: (LintResult | LintResultGroup | undefined)[]): void;
  /** Finalize and return the result group. */
  build(): LintResultGroup;
}
