import type { LintResult, LintResultGroup, LintSettings } from "../types.ts";
import { createContext } from "../builder.ts";

/** Create a fresh LintContext with showSkipped: true by default. */
export function ctx(settings?: LintSettings) {
  return createContext({ showSkipped: true, ...settings });
}

/** Find a result by name in a group's results array. */
export function find(group: LintResultGroup, name: string) {
  return group.results.find((r) => r.name === name) as
    | LintResult
    | LintResultGroup
    | undefined;
}

/** Recursively find a lint result by name anywhere in the tree. */
export function findDeep(
  group: LintResultGroup,
  name: string,
): LintResult | LintResultGroup | undefined {
  for (const r of group.results) {
    if (r.name === name) return r;
    if ("results" in r) {
      const found = findDeep(r, name);
      if (found) return found;
    }
  }
}
