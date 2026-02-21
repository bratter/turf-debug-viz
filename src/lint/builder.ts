import {
  Path,
  LintContext,
  LintSettings,
  Scope,
  ResultGroupBuilder,
  LintResult,
  LintResultGroup,
  Lint,
  GroupFn,
  Severity,
  Tag,
} from "./types.ts";

export const DEFAULT_SETTINGS: LintSettings = {};

/** Create a fresh LintContext with optional user settings. */
export function createContext(
  settings: LintSettings = DEFAULT_SETTINGS,
): LintContext {
  return { settings, state: {}, scope: {} };
}

/** Shallow-copy scope options, preserving shared state by reference. */
export function withScope(
  ctx: LintContext,
  overrides: Partial<Scope>,
): LintContext {
  return { ...ctx, scope: { ...ctx.scope, ...overrides } };
}

/**
 * Resolve value and path from target + segment.
 *
 * When a segment is provided, accesses target[segment] and appends the
 * segment to the path. No segment: target and path pass through unchanged.
 */
function resolve(
  target: unknown,
  path: Path,
  segment?: string | number,
): { value: unknown; resolvedPath: Path } {
  const value =
    segment != null
      ? (target as Record<string | number, unknown>)[segment]
      : target;
  const resolvedPath = segment != null ? [...path, segment] : path;
  return { value, resolvedPath };
}

/** Run a lint's test function, returning the result. */
function runLint<T = unknown>(
  lint: Lint<T>,
  value: T,
  ctx: LintContext,
): [Severity, string?] {
  let result: Severity | [Severity, string?];
  try {
    result = lint.test(value, ctx);
  } catch (err) {
    result = [
      Severity.Error,
      err instanceof Error && err.message
        ? `Lint threw an error with message: ${err.message}`
        : "Lint threw an unknown error",
    ];
  }

  return Array.isArray(result) ? result : [result];
}

function hasFailing(
  results: (LintResult | LintResultGroup)[],
  atOrAbove: Severity,
  tag?: Tag,
): boolean {
  for (const r of results) {
    if (r.passed) continue;
    if ("results" in r) {
      if (hasFailing(r.results, atOrAbove, tag)) return true;
    } else {
      if (tag && r.tag !== tag) continue;
      if (r.severity >= atOrAbove) return true;
    }
  }
  return false;
}

export function isError(
  item: Severity | LintResult | LintResultGroup,
): boolean {
  return (typeof item === "number" ? item : item.severity) >= Severity.Error;
}

/**
 * Creates a builder for assembling lint results into a named group.
 *
 * @param name - Display name for the group
 * @param ctx - Lint context
 * @param path - Base path from the object root
 * @param segment - Optional path segment to append to base
 */
export function resultGroup(
  name: string,
  ctx: LintContext,
  path: Path,
  segment?: string | number,
): ResultGroupBuilder {
  if (segment != null) path = [...path, segment];
  const tagList = ctx.settings.tags;
  const results: (LintResult | LintResultGroup)[] = [];

  return {
    ctx,
    path,
    hasMaxSeverityOf(atOrAbove: Severity = Severity.Error, tag?: Tag): boolean {
      return hasFailing(results, atOrAbove, tag);
    },
    hasSchemaError(): boolean {
      return hasFailing(results, Severity.Error, "Schema");
    },
    check<T = unknown>(
      lint: Lint<T>,
      target: T,
      segment?: string | number,
    ): Severity {
      // Skip without notification if the lint's tag is not in the tag list
      if (tagList && !tagList.includes(lint.tag)) return Severity.Skip;

      const { value, resolvedPath } = resolve(target, path, segment);
      const [severity, message] = runLint(lint, value as T, ctx);
      const passed = severity <= Severity.Info;

      // Don't emit skip results unless setting tells us to
      if (severity === Severity.Skip && !ctx.settings.showSkipped)
        return Severity.Skip;

      results.push({
        name: lint.name,
        path: resolvedPath,
        description: lint.description,
        tag: lint.tag,
        severity,
        passed,
        message,
      });

      return severity;
    },
    checkAll<T = unknown>(
      name: string,
      lintOrFn: Lint<T> | GroupFn<T>,
      target: T[],
      options?: { segment?: string | number },
    ) {
      const sub = resultGroup(name, ctx, path, options?.segment);
      for (let i = 0; i < target.length; i++) {
        if (typeof lintOrFn === "function") {
          sub.group(lintOrFn as GroupFn, target, i);
        } else {
          // Cast appropriate as we know we are in bounds
          sub.check(lintOrFn as Lint<T | undefined>, target, i);
        }
      }
      results.push(sub.build());
    },
    group(fn: GroupFn, target: unknown, segment?: string | number) {
      const { value, resolvedPath } = resolve(target, path, segment);
      const result = fn(value, ctx, resolvedPath);
      if (result !== undefined) results.push(result);
    },
    add(...child: (LintResult | LintResultGroup | undefined)[]) {
      for (const c of child) if (c !== undefined) results.push(c);
    },
    build(): LintResultGroup {
      let passed = true;
      let severity = 0;
      let total = 0;
      const children = results.length;

      for (const r of results) {
        total += "results" in r ? r.total : 1;
        if (!r.passed) {
          passed = false;
          severity = Math.max(severity, r.severity);
        }
      }

      return { name, path, results, severity, passed, children, total };
    },
  };
}

/**
 * Recursively filter a lint result tree, keeping only leaf results that
 * match the predicate. Empty groups are pruned. Aggregates (passed,
 * severity, total, children) are recomputed bottom-up.
 */
export function filterLintResult(
  group: LintResultGroup,
  predicate: (r: LintResult) => boolean,
): LintResultGroup {
  const filtered: (LintResult | LintResultGroup)[] = [];

  for (const r of group.results) {
    if ("results" in r) {
      const child = filterLintResult(r, predicate);
      if (child.results.length > 0) filtered.push(child);
    } else {
      if (predicate(r)) filtered.push(r);
    }
  }

  let passed = true;
  let severity = 0;
  let total = 0;

  for (const r of filtered) {
    total += "results" in r ? r.total : 1;
    if (!r.passed) {
      passed = false;
      severity = Math.max(severity, r.severity);
    }
  }

  return {
    name: group.name,
    path: group.path,
    results: filtered,
    severity,
    passed,
    children: filtered.length,
    total,
  };
}

/**
 * Recursively trim a lint result tree, removing leaf results that don't
 * match the predicate. Unlike {@link filterLintResult}, the original
 * group's aggregates (passed, severity, total, children) are preserved.
 * Useful for hiding passing results while keeping the original counts.
 */
export function trimLintResult(
  group: LintResultGroup,
  predicate: (r: LintResult) => boolean,
): LintResultGroup {
  const trimmed: (LintResult | LintResultGroup)[] = [];

  for (const r of group.results) {
    if ("results" in r) {
      const child = trimLintResult(r, predicate);
      if (child.results.length > 0) trimmed.push(child);
    } else {
      if (predicate(r)) trimmed.push(r);
    }
  }

  return {
    name: group.name,
    path: group.path,
    results: trimmed,
    severity: group.severity,
    passed: group.passed,
    children: group.children,
    total: group.total,
  };
}

/**
 * Flatten a lint result tree into a single group with all leaf
 * {@link LintResult} nodes in a flat array. Groups are removed;
 * aggregates are recomputed from the leaves.
 *
 * Useful after {@link filterLintResult} for a simple list of results:
 * `flattenLintResult(filterLintResult(group, predicate))`
 */
export function flattenLintResult(group: LintResultGroup): LintResultGroup {
  const leaves: LintResult[] = [];

  function collect(node: LintResult | LintResultGroup): void {
    if ("results" in node) {
      for (const child of node.results) collect(child);
    } else {
      leaves.push(node);
    }
  }

  for (const r of group.results) collect(r);

  let passed = true;
  let severity = 0;

  for (const r of leaves) {
    if (!r.passed) {
      passed = false;
      severity = Math.max(severity, r.severity);
    }
  }

  return {
    name: group.name,
    path: group.path,
    results: leaves,
    severity,
    passed,
    children: leaves.length,
    total: leaves.length,
  };
}

/**
 * Format a {@link Path} as a human-readable property access string.
 *
 * String segments use dot notation, number segments use bracket notation.
 * Examples:
 * - `["features", 0, "geometry"]` → `"features[0].geometry"`
 * - `[]` → `"(root)"`
 */
export function formatPath(path: Path): string {
  if (path.length === 0) return "(root)";
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") {
      out += `[${seg}]`;
    } else {
      out += out ? `.${seg}` : seg;
    }
  }
  return out;
}
