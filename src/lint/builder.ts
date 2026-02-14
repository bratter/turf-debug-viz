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
  const check = <T = any>(
    lint: Lint<T>,
    target: T,
    ...segments: Path
  ): boolean => {
    let message: string | undefined;
    try {
      message = lint.test(target);
    } catch (err) {
      message = err.message
        ? `Lint threw an error with message: ${err.message}`
        : "Lint threw an unknown error";
    }
    const result: LintResult = {
      name: lint.name,
      path: [...path, ...segments],
      description: lint.description,
      severity: lint.severity,
      tag: lint.tag,
      passed: message == null,
    };

    if (!result.passed) result.message = message;
    results.push(result);

    return result.passed;
  };

  return {
    check,
    checkAll<T = any>(lintOrFn: Lint<T> | GroupFn<T>, target: T[]) {
      target.forEach((item, i) => {
        if (typeof lintOrFn === "function") {
          results.push(lintOrFn(item, [...path, i]));
        } else {
          check(lintOrFn, item, i);
        }
      });
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
