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

export const DEFAULT_SETTINGS: LintSettings = {
  collapsePositions: true,
  infoOnSkip: false,
};

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
): { passed: boolean; skipped: boolean; message?: string } {
  if (lint.optional && value === undefined)
    return { passed: true, skipped: false };

  let message: string | boolean;
  try {
    message = lint.test(value, ctx);
  } catch (err) {
    message =
      err instanceof Error && err.message
        ? `Lint threw an error with message: ${err.message}`
        : "Lint threw an unknown error";
  }

  if (typeof message === "string")
    return { passed: false, skipped: false, message };
  return { passed: true, skipped: !message };
}

function hasFailing(results: (LintResult | LintResultGroup)[], atOrAbove: Severity, tag?: Tag): boolean {
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
  const results: (LintResult | LintResultGroup)[] = [];

  return {
    ctx,
    path,
    hasFailure(tag?: Tag, atOrAbove: Severity = Severity.Error): boolean {
      return hasFailing(results, atOrAbove, tag);
    },
    hasSchemaError(): boolean {
      return hasFailing(results, Severity.Error, "Schema");
    },
    test<T = unknown>(
      lint: Lint<T>,
      target: T,
      segment?: string | number,
    ): boolean {
      const { value } = resolve(target, path, segment);
      return runLint(lint, value as T, ctx).passed;
    },
    check<T = unknown>(
      lint: Lint<T>,
      target: T,
      segment?: string | number,
    ): boolean {
      const { value, resolvedPath } = resolve(target, path, segment);
      const { passed, skipped, message } = runLint(lint, value as T, ctx);

      if (skipped) {
        if (ctx.settings.infoOnSkip) {
          results.push({
            name: "skipped",
            path: resolvedPath,
            description:
              "Skipping lint without error, usually due to a failed precondition",
            severity: Severity.Info,
            tag: lint.tag,
            message: `Lint ${lint.name} was skipped`,
            passed: true,
          });
        }
      } else {
        results.push({
          name: lint.name,
          path: resolvedPath,
          description: lint.description,
          severity: lint.severity,
          tag: lint.tag,
          message,
          passed,
        });
      }

      return passed;
    },
    checkAll<T = unknown>(
      name: string,
      lintOrFn: Lint<T> | GroupFn<T>,
      target: T[],
      options?: { collapse?: boolean; segment?: string | number },
    ) {
      const collapse = ctx.scope.collapse || options?.collapse || false;
      const childCtx = collapse ? withScope(ctx, { collapse: true }) : ctx;
      const sub = resultGroup(name, childCtx, path, options?.segment);
      for (let i = 0; i < target.length; i++) {
        if (typeof lintOrFn === "function") {
          sub.group(lintOrFn as GroupFn, target, i);
        } else {
          // Cast appropriate as we know we are in bounds
          sub.check(lintOrFn as Lint<T | undefined>, target, i);
        }
      }

      const built = sub.build();

      // TODO: Consider eliminating general collapse logic and moving it into
      // position linting only
      if (collapse) {
        const leaves = flattenLintResult(built).results as LintResult[];

        // Count passes by tag; failures go straight to output
        const passByTag = new Map<Tag, number>();
        const totalByTag = new Map<Tag, number>();
        const collapsed: LintResult[] = [];

        for (const r of leaves) {
          totalByTag.set(r.tag, (totalByTag.get(r.tag) ?? 0) + 1);
          if (r.passed) {
            passByTag.set(r.tag, (passByTag.get(r.tag) ?? 0) + 1);
          } else {
            collapsed.push(r);
          }
        }

        // Per-tag passing summaries
        const summaries: LintResult[] = [];
        for (const [tag, total] of totalByTag) {
          const passing = passByTag.get(tag) ?? 0;
          summaries.push({
            name: `${name}-${tag.toLowerCase()}`,
            path: built.path,
            description: `${passing} of ${total} ${tag} lints passed across ${target.length} ${name}`,
            severity: Severity.Info,
            tag,
            passed: true,
          });
        }

        results.push({
          name,
          path: built.path,
          results: [...summaries, ...collapsed],
          severity: built.severity,
          passed: built.passed,
          children: summaries.length + collapsed.length,
          total: built.total,
        });
      } else {
        results.push(built);
      }
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
