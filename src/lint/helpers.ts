/**
 * Static lints and lint factories.
 */

import type { GeoJSON } from "geojson";
import type { Lint } from "./types.ts";
import { Severity } from "./types.ts";

/**
 * Factory function that creates a lint checking if a member is an Array.
 *
 * @param memberLabel - Name of the member being checked
 * @param ref - Optional spec reference (e.g., "RFC7946 3.3")
 */
export function makeArrayLint(
  memberLabel: string,
  ref?: string,
): Lint<Array<any>> {
  return {
    name: `${memberLabel}-is-array`,
    description: `The ${memberLabel} member MUST be an Array${ref ? ` (${ref})` : ""}`,
    severity: Severity.Error,
    tag: "Schema",
    test(target) {
      if (!Array.isArray(target))
        return `Expected an Array, received ${typeof target}`;
    },
  };
}

/**
 * Factory function that creates a lint checking if the type field matches an expected value.
 *
 * @param type - Expected type string, used in name, description, and error messages
 * @param ref - Optional spec reference (e.g., "RFC7946 3.1")
 */
export function makeTypeLint(type: string, ref?: string): Lint<GeoJSON>;
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
): Lint<GeoJSON>;
export function makeTypeLint(
  types: string | readonly string[],
  nameOrRef?: string,
  label?: string,
  ref?: string,
): Lint<GeoJSON> {
  const typeList = typeof types === "string" ? [types] : types;
  const name =
    typeof types === "string"
      ? `type-${types.toLowerCase()}`
      : `type-${nameOrRef?.toLowerCase().replaceAll(" ", "-")}`;
  const specRef = typeof types === "string" ? nameOrRef : ref;
  const descInner = typeof types === "string" ? `"${types}"` : label;
  const errorInner = typeof types === "string" ? `type of "${types}"` : label;

  return {
    name,
    description: `Member type MUST be ${descInner}${specRef ? ` (${specRef})` : ""}`,
    severity: Severity.Error,
    tag: "Schema",
    test(target: GeoJSON) {
      if (typeof target.type !== "string") {
        // @ts-expect-error - runtime validation of potentially malformed input
        return `Expected a string type, received ${typeof target.type}`;
      }
      if (!typeList.includes(target.type)) {
        return `Expected ${errorInner}, received "${target.type}"`;
      }
    },
  };
}
