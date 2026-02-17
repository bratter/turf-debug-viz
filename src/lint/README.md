# GeoJSON Linter

A comprehensive, tree-structured GeoJSON linter. Produces a JSON-ready lint report for any GeoJSON object. Prioritizes correctness and completeness over performance.

## Design

### Context

`LintContext` is threaded through the entire lint tree. It has three fields:

- `settings` -- immutable user-provided settings (`LintSettings`) for the lint run (e.g., tag filtering)
- `state` -- shared mutable `Record<symbol, unknown>` for cross-check coordination (e.g., position dimensionality)
- `scope` -- per-scope options (`ScopeOptions`) that cascade to children via `withScope()`

Use `createContext()` to create a fresh context. Use `withScope(ctx, overrides)` to create a child scope -- state is shared by reference, scope is shallow-copied so overrides don't leak upward.

### Lints

A `Lint<T>` is a configuration object pairing metadata (name, description, severity, tag) with a `test` function. The test receives a target value and returns `undefined` on success or an error message string on failure. Lints should test one thing or a small group of conceptually related things.

Static `Lint` objects are preferred. When parameterization is needed (e.g., checking a specific type or array member), use factory functions (`makeTypeLint`, `makeArrayLint`).

### Groups

Group functions follow the `GroupFn` signature: `(target, ctx, path) => LintResultGroup | undefined`. They create a `ResultGroupBuilder` via `resultGroup()`, run lints, and return the built group. The builder provides:

- `check(lint, target, segment?)` -- run a lint, push the result, return whether it passed. When a segment is provided (string or number), accesses `target[segment]` and appends the segment to the path.
- `test(lint, target, segment?)` -- same as check but returns the boolean without pushing any result. Used for control flow decisions (e.g., null geometry guard).
- `group(fn, target, segment?)` -- call a group function and add the returned group as a nested child. Same value/path resolution as check.
- `checkAll(name, lintOrFn, items, options?)` -- run a lint or group function against every array element, wrapping results in a named sub-group. Supports `collapse` (see below) and `segment` options.
- `add(...)` -- push pre-built results or child groups (undefined values are silently ignored)
- `build()` -- finalize into a `LintResultGroup`

### Results

Output is a tree of `LintResultGroup` and `LintResult` nodes. Groups carry a `path` (position in the GeoJSON structure), aggregate `passed`, and worst `severity`. Individual results carry their own `path`, `passed`, `severity`, and an optional error `message`.

### Severity

`Severity` is a numeric enum (`Info = 0`, `Warn = 1`, `Error = 2`). Lints declare their severity; results copy it. Groups aggregate to the worst severity among failures. Both results and groups also carry a `passed` boolean for simple filtering.

### Collapse

Collapse reduces noise from bulk array checks (primarily position arrays). It is activated per-`checkAll` via the `collapse` option and cascades to all nested `checkAll` descendants through `scope.collapse`. Once set, collapse cannot be backed out — all nesting below the collapse point is flattened.

When collapse is active on a `checkAll`:
- **All pass**: The entire subtree is replaced with a single summary `LintResult` (e.g., "All 100 positions valid").
- **Some fail**: The subtree is flattened and only failing leaf results are kept. The group preserves its original `total` so consumers can derive "3 of 100 failed".

The user setting `collapsePositions` (default `true`) controls whether position-level functions (e.g., `lintLineString`, `lintLinearRing`) activate collapse on their positions `checkAll`. Structural arrays (features, geometries, lines, rings, polygons) do not collapse.

### Filtering

Three post-processing utilities operate on the result tree:

- `filterLintResult(group, predicate)` -- recursively filters leaf results by predicate, prunes empty groups, and recomputes aggregates bottom-up. Useful for tag filtering and severity thresholds.
- `trimLintResult(group, predicate)` -- same recursive pruning as filter, but preserves the original group aggregates (passed, severity, total, children). Useful for hiding passing results while keeping original counts.
- `flattenLintResult(group)` -- collects all leaf `LintResult` nodes into a single flat group. The primary way results are presented to consumers.

### Error handling

The builder's `check` wraps test execution in try-catch. If a test throws, the result is marked as failed with the error message. This is important because the linter accepts potentially malformed input and makes no type assumptions from the entry point downward.

## References

- https://github.com/placemark/check-geojson/
- https://github.com/chrieke/geojson-validator is python but informative

## To Do

- If we do this on a string with momoa could give positions, do this by
  replacing path with a context that optionally has the source references
- If want to extract into own repo, use git subtree split
- Work on consistency and simplicity in lint helper and lint group naming
- Add geometry correctness lints (ring closure, winding order, self-intersection, etc.)
