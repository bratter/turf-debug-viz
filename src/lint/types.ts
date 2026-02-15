/**
 * Linter types.
 */

/** An object access path */
export type Path = (string | number)[];

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
export type TestFn<T = unknown> = (target: T) => string | undefined;

/**
 * The callback function that builds a LintGroup.
 */
export type GroupFn<T = unknown> = (item: T, path: Path) => LintResultGroup;

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
  /** Hint for the lint runner to suppress output when the lint passes **/
  quiet?: boolean;
  /** The linting function to run */
  test: TestFn<T>;
}

/**
 * Specification for a lint result.
 */
export interface LintResult extends Omit<Lint, "test" | "optional" | "quiet"> {
  /** Path from the object root to the member under test */
  path: Path;
  /** Whether the lint suceeded */
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
}

/**
 * Builder returned by {@link resultGroup} for assembling lint results.
 */
export interface ResultGroupBuilder {
  /** Run a lint against a target, push the result, and return whether it passed. */
  check<T = unknown>(lint: Lint<T>, target: T, ...segments: Path): boolean;
  /** Run a lint or group function against every element in an array. */
  checkAll<T = unknown>(lintOrFn: Lint<T> | GroupFn<T>, target: T[]): void;
  /**
   * Run a lint against a the given object member of target.
   *
   * Unlike `check` that takes the target directly, `member` is a convenience
   * function for use only with unverified `Record` objects during structural
   * validation that nests exactly one path segment into an unknown object,
   * accessing the member and appending it to the path.
   */
  member<T = unknown>(lint: Lint<T>, target: Record<string, T>, member: string): boolean;
  /** Push pre-built results or child groups. Undefined values are silently ignored. */
  add(...child: (LintResult | LintResultGroup | undefined)[]): void;
  /** Finalize and return the result group. */
  build(): LintResultGroup;
}
