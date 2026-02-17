/**
 * Static lints and lint factories.
 */

import type { Lint } from "./types.ts";
import { Severity } from "./types.ts";

/** Convert a PascalCase or camelCase string to kebab-case. */
export function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Factory function that creates a lint checking if a value is an Array.
 *
 * Takes the value directly (not the parent). The `member` param is for
 * naming/description only.
 *
 * @param member - Name of the member being checked
 * @param options.ref - Optional spec reference (e.g., "RFC7946 3.3")
 */
export function makeArrayLint(
  member: string,
  options: { ref?: string } = {},
): Lint {
  const { ref } = options;
  const k = kebab(member);
  return {
    name: `${k}-is-array`,
    description: `The ${member} member MUST be an Array${ref ? ` (${ref})` : ""}`,
    severity: Severity.Error,
    tag: "Schema",
    test(target: unknown) {
      if (target === undefined) return `The ${member} member must be present`;
      if (!Array.isArray(target))
        return `Expected an Array, received ${typeof target}`;
    },
  };
}

/**
 * Factory function that creates a lint checking if a value is an Object.
 *
 * Takes the value directly (not the parent). The `member` param is for
 * naming/description only.
 *
 * @param member - Name of the member being checked
 * @param options.nullable - Whether null is a valid value (default: false)
 * @param options.ref - Optional spec reference (e.g., "RFC7946 3.2")
 */
export function makeObjectLint(
  member: string,
  options: { nullable?: boolean; ref?: string } = {},
): Lint {
  const { nullable = false, ref } = options;
  const nullClause = nullable ? " or null" : "";
  const k = kebab(member);
  return {
    name: `${k}-is-object`,
    description: `The ${member} member MUST be an Object${nullClause}${ref ? ` (${ref})` : ""}`,
    severity: Severity.Error,
    tag: "Schema",
    test(target: unknown) {
      if (target === undefined) return `The ${member} member must be present`;
      if (target === null)
        return nullable ? undefined : `Expected an Object, received null`;
      if (Array.isArray(target))
        return `Expected an Object${nullClause}, received an Array`;
      if (typeof target !== "object")
        return `Expected an Object${nullClause}, received ${typeof target}`;
    },
  };
}

/**
 * Factory function that creates a lint checking if the type field matches an expected value.
 *
 * @param type - Expected type string, used in name, description, and error messages
 * @param ref - Optional spec reference (e.g., "RFC7946 3.1")
 */
export function makeTypeLint(type: string, ref?: string): Lint;
/**
 * Factory function that creates a lint checking if the type field matches expected values.
 *
 * @param types - Array of valid type strings
 * @param name - Short name in kebab-case to name the lint after type-
 * @param label - Display label used in description and error messages
 * @param ref - Optional spec reference (e.g., "RFC7946 3.1")
 */
export function makeTypeLint(
  types: readonly string[],
  name: string,
  label: string,
  ref?: string,
): Lint;
export function makeTypeLint(
  types: string | readonly string[],
  nameOrRef?: string,
  label?: string,
  ref?: string,
): Lint {
  const typeList = typeof types === "string" ? [types] : types;
  const name =
    typeof types === "string"
      ? `type-${kebab(types)}`
      : `type-${nameOrRef?.toLowerCase().replaceAll(" ", "-")}`;
  const specRef = typeof types === "string" ? nameOrRef : ref;
  const descInner = typeof types === "string" ? `"${types}"` : label;
  const errorInner = typeof types === "string" ? `type of "${types}"` : label;

  return {
    name,
    description: `Member type MUST be ${descInner}${specRef ? ` (${specRef})` : ""}`,
    severity: Severity.Error,
    tag: "Schema",
    test(target: unknown) {
      if (typeof target !== "string") {
        return `Expected a string type, received ${typeof target}`;
      }
      if (!typeList.includes(target)) {
        return `Expected ${errorInner}, received "${target}"`;
      }
    },
  };
}
