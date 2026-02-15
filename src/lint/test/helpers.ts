import type { LintResult, LintResultGroup } from "../types.ts";

/** Find a result by name in a group's results array. */
export function find(group: LintResultGroup, name: string) {
  return group.results.find((r) => r.name === name) as
    | LintResult
    | LintResultGroup
    | undefined;
}
