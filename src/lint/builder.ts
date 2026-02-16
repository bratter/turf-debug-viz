import {
  Path,
  LintContext,
  ResultGroupBuilder,
  LintResult,
  LintResultGroup,
  Lint,
  GroupFn,
} from "./types.ts";

/**
 * Creates a builder for assembling lint results into a named group.
 *
 * @param name - Display name for the group
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
  const check = <T = unknown>(
    lint: Lint<T>,
    target: T,
    segment?: string | number,
  ): boolean => {
    // If the lint is marked optional, skip if undefined
    if (lint.optional && target === undefined) return true;

    let message: string | undefined;
    try {
      message = lint.test(target, ctx);
    } catch (err) {
      message =
        err instanceof Error && err.message
          ? `Lint threw an error with message: ${err.message}`
          : "Lint threw an unknown error";
    }

    // Loose equality check detects null or undefined from the lint test
    // where no message returned indicated a pass
    const passed = message == null;

    // If the lint is marked quiet, skip appending the results
    if (!lint.quiet) {
      results.push({
        name: lint.name,
        path: segment != null ? [...path, segment] : path,
        description: lint.description,
        severity: lint.severity,
        tag: lint.tag,
        message,
        passed,
      });
    }

    return passed;
  };

  return {
    ctx,
    path,
    check,
    checkAll<T = unknown>(
      name: string,
      lintOrFn: Lint<T> | GroupFn<T>,
      target: T[],
      options?: { quiet?: boolean; segment?: string | number },
    ) {
      const sub = resultGroup(name, ctx, path, options?.segment);
      target.forEach((item, i) => {
        if (typeof lintOrFn === "function") {
          sub.add(lintOrFn(item, ctx, [...sub.path, i]));
        } else {
          sub.check(lintOrFn, item, i);
        }
      });

      const built = sub.build();

      if (options?.quiet) {
        const failures = built.results.filter((r) => !r.passed);
        results.push({ ...built, results: failures });
      } else {
        results.push(built);
      }
    },
    member(
      lint: Lint,
      target: Record<string, unknown>,
      member: string,
    ): boolean {
      return check(lint, target[member], member);
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
        passed = passed && r.passed;
        if (!passed) {
          severity = Math.max(severity, r.severity);
        }
      }

      return { name, path, results, severity, passed, children, total };
    },
  };
}
