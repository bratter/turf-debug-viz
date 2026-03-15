# turf-debug-viz

Real-time GeoJSON debug visualization for TurfJS development. Visualize GeoJSON objects in your browser as your code executes, including when stepping through code in a debugger.

It comprises three parts:

1. A relay server that forwards GeoJSON from the process being observed to the visualizer
2. A Mapbox-driven front end, served statically by the relay server, for visualizing GeoJSON
3. A Node.js import hook that injects `DebugViz` and `turf` globals into running processes

It is intended for local use during development.

**The package is an alpha, while it generally works, there are lots of pending improvements!**

## Installation

```bash
git clone https://github.com/bratter/turf-debug-viz.git
cd turf-debug-viz
pnpm install
pnpm run build
```

You must have a Mapbox token to use the visualizer. Sign up at <https://www.mapbox.com/>, then copy `src/config.ts.example` to `src/config.ts` and paste your token in.

## Quick Start

```bash
# Start the relay server — opens browser to http://127.0.0.1:8873
pnpm start

# In another terminal, run your script with the debug hook as an import
# Replace the debug hook path with the correct path for your build
npx tsx --import ./src/debug-hook.ts your-script.ts
```

## Starting the Relay Server

```bash
# Default — serves on http://127.0.0.1:8873
pnpm start

# Custom port
TURF_DEBUG_PORT=8080 pnpm start

# Custom host
TURF_DEBUG_HOST=0.0.0.0 pnpm start

# Enable debug logging
NODE_DEBUG=turf-debug-viz pnpm start
```

The browser opens automatically on start.

## Using the Debug Hook

Run your Node.js script with the `--import` flag pointing at the debug hook:

```bash
# Using tsx
npx tsx --import ./src/debug-hook.ts your-script.ts

# Using node (requires built JS)
node --import ./src/debug-hook.js your-script.js

# With custom port (must match server)
TURF_DEBUG_PORT=8080 npx tsx --import ./src/debug-hook.ts your-script.ts

# With debugger attached
npx tsx --inspect-brk --import ./src/debug-hook.ts your-script.ts
```

The hook adds two globals to your script's process:

- **`DebugViz`** — sends GeoJSON to the relay server
- **`turf`** — the full `@turf/turf` library, so you can manipulate geometry without modifying the file under test

Both are available in code and in a debug console.

To use against a turf package test, for example:

```bash
# cwd is turf/packages/turf-buffer
npx tsx --inspect-brk --import /path/to/turf-debug-viz/src/debug-hook.ts ./test.ts
```

## Adding Types

To get TypeScript type checking and IntelliSense for `DebugViz` and `turf`, add a reference path to the file you're debugging:

```typescript
/// <reference path="/path/to/turf-debug-viz/types.d.ts" />
```

Run the first one from the `turf-debug-viz` directory to generate the correct string, run the second from anywhere:

```bash
echo "/// <reference path=\"$(realpath types.d.ts)\" />"

# Replace ~ as appropriate to some folder above this package
echo "/// <reference path=\"$(find ~ -path '*/turf-debug-viz/types.d.ts')\" />"
```

Remove the reference when you're done debugging.

## DebugViz API

The hook adds a global `DebugViz` object. All methods are synchronous — they block until the message is sent, so they work reliably when stepping through code in a debugger. The connection is lazily established on first use and automatically cleaned up on process exit.

### `DebugViz.send(geojson, label?)`

Send a GeoJSON object to the visualizer.

```typescript
DebugViz.send(myFeature);
DebugViz.send(myFeature, "before-buffer");

// Any GeoJSON type works
DebugViz.send({
  type: "Feature",
  geometry: { type: "Point", coordinates: [12, 34] },
  properties: { name: "Test" },
});
```

### `DebugViz.diff(from, to, label?)`

Send two GeoJSON objects to the visualizer as a diff pair. They appear side by side in the diff view.

```typescript
const before = turf.buffer(pt, 10);
const after = turf.buffer(pt, 20);
DebugViz.diff(before, after, "buffer-comparison");
```

### `DebugViz.isConnected()`

Check whether the hook is currently connected to the relay server.

```typescript
if (DebugViz.isConnected()) {
  console.log("Connected to debug visualizer");
}
```

### `DebugViz.disconnect()`

Manually close the connection. Not required — the WebSocket is unref'd and won't prevent process exit.

```typescript
DebugViz.disconnect();
```

## License

MIT

## Disclaimer

This package is not developed or maintained by Turfjs or its maintainers, but is specifically built for the purpose of Turfjs development.
