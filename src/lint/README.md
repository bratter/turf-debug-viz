# GeoJSON Linter

A comprehensive, tree-structured GeoJSON linter. Produces a JSON-ready lint report for any GeoJSON object. Prioritizes correctness and completeness over performance.

## Design

### Lints

A `Lint<T>` is a configuration object pairing metadata (name, description, severity, tag) with a `test` function. The test receives a target value and returns `undefined` on success or an error message string on failure. Lints should test one thing or a small group of conceptually related things.

Static `Lint` objects are preferred. When parameterization is needed (e.g., checking a specific type or array member), use factory functions (`makeTypeLint`, `makeArrayLint`).

### Groups

Group functions (e.g., `lintFeatureCollection`) walk a section of the GeoJSON structure. They use a `ResultGroupBuilder` (created via `resultGroup()`) to run lints and assemble results. The builder provides:

- `check(lint, target)` -- run a lint, push the result, return whether it passed
- `checkAll(lintOrFn, items)` -- run a lint or group function against every array element
- `add(...)` -- push pre-built results or child groups
- `build()` -- finalize into a `LintResultGroup`

### Results

Output is a tree of `LintResultGroup` and `LintResult` nodes. Groups carry a `path` (position in the GeoJSON structure), aggregate `passed`, and worst `severity`. Individual results carry `passed`, `severity`, and an optional error `message`. Path lives on groups only -- individual results inherit position from their parent group.

### Severity

`Severity` is a numeric enum (`Info = 0`, `Warn = 1`, `Error = 2`). Lints declare their severity; results copy it. Groups aggregate to the worst severity among failures. Both results and groups also carry a `passed` boolean for simple filtering.

### Error handling

The builder's `check` wraps test execution in try-catch. If a test throws, the result is marked as failed with the error message. This is important because the linter accepts potentially malformed input and makes no type assumptions from the entry point downward.

## References

- https://github.com/placemark/check-geojson/
- https://github.com/chrieke/geojson-validator is python but informative

## To Do

- If we do this on a string with momoa could give positions, do this by
  replacing path with a context that optionally has the source references
- If want to extract into own repo, use git subtree split
