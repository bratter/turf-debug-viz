import {
  Path,
  ResultGroupBuilder,
  LintResult,
  LintResultGroup,
  Lint,
  GroupFn,
} from "./types.ts";
import { Severity } from "./types.ts";

/**
 * Creates a builder for assembling lint results into a named group.
 *
 * @param name - Display name for the group
 * @param path - Base path from the object root
 * @param segments - Additional path segments to append to base
 */
export function resultGroup(
  name: string,
  path: Path,
  ...segments: Path
): ResultGroupBuilder {
  path = [...path, ...segments];
  const results: (LintResult | LintResultGroup)[] = [];
  const check = <T = unknown>(
    lint: Lint<T>,
    target: T,
    ...segments: Path
  ): boolean => {
    // If the lint is marked optional, skip if undefined
    if (lint.optional && target === undefined) return true;

    let message: string | undefined;
    try {
      message = lint.test(target);
    } catch (err) {
      message = err instanceof Error && err.message
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
        path: [...path, ...segments],
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
    check,
    checkAll<T = unknown>(lintOrFn: Lint<T> | GroupFn<T>, target: T[]) {
      target.forEach((item, i) => {
        if (typeof lintOrFn === "function") {
          results.push(lintOrFn(item, [...path, i]));
        } else {
          check(lintOrFn, item, i);
        }
      });
    },
    member(lint: Lint, target: Record<string, unknown>, member: string): boolean {
      return check(lint, target[member], member);
    },
    add(...child: (LintResult | LintResultGroup | undefined)[]) {
      for (const c of child) if (c !== undefined) results.push(c);
    },
    build(): LintResultGroup {
      let passed = true;
      let severity = 0;
      for (const r of results) {
        passed = passed && r.passed;
        if (!passed) {
          severity = Math.max(severity, r.severity);
          if (severity >= Severity.Error) break;
        }
      }
      return { name, path, results, severity, passed };
    },
  };
}
