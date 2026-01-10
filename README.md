# turf-debug-viz

Real-time debug visualization tool for TurfJS development. Works with any tool that generates GeoJSON, but specifically targeted to the TurfJS environment.

Provides the ability to hook into executing node files and export GeoJSON to a simple visualizer. It can work both adding debug statements into code, or directly from a debug console. It comprises:

1. A relay server that forwards GeoJSON from the process being observed to the visualizer
2. A MapBox-driven front end, served statically by the relay server to visualize GeoJSON
3. A hook script (plus types) to inject into node processes that sends GeoJSON to the relay server and also makes the full turf package available in the global scope

It is intended for use locally in development.

Visualize GeoJSON objects in your browser as your code executes, with support for stepping through code in a debugger.

## Quick Start

```bash
# Install dependencies
npm install

# Start the relay server and open browser to http://127.0.0.1:7777
npm run start

# In another terminal, run your script with the debug hook
npx tsx --import ./debug-hook.ts your-script.ts
```

## Installation

```bash
git clone https://github.com/bratter/turf-debug-viz.git
cd turf-debug-viz
npm install
npm run build:client
```

You must have a MapBox key for using the visualizer. Sign up for one on <https://www.mapbox.com/>, then copy `config.ts.example` to `config.ts` and paste the key into the appropriate location.

## Setting Up for Use

### Start the Relay Server

First start the relay server:

```bash
# In turf-debug-viz folder
npm run start

# Custom port
TURF_DEBUG_PORT=8080 npm start

# Custom host
TURF_DEBUG_HOST=0.0.0.0 npm start
```

This will start a server on `http://localhost:7777` by default, or as appropriate with the passed env vars. It will also open a tab in the default browser.

### Use the Debug Hook

Run your NodeJS script using the `--import` flag:

```bash
# Using tsx
npx tsx --import ./debug-hook.ts your-script.ts

# Using node (requires built JS)
node --import ./debug-hook.js your-script.js

# With custom port (must match server)
TURF_DEBUG_PORT=8080 npx tsx --import ./debug-hook.ts your-script.ts

# With debugger support
npx tsx --inspect-brk --import ./debug-hook.ts your-script.ts
```

This provides two things to `your-script.ts` in the global scope:

1. `DebugViz` object to export GeoJSON to the relay server from the running script
2. `turf` object to provide full turf functionality to enable playing around without forcing a change to the system under test

As above, both can be used in code or from a debug console.

Any turf test file can be augmented like this:

```bash
# cwd is turf/packages/turf-buffer (for instance)
npx tsx --inspect-brk --import /path/to/turf-debug-viz/debug-hook.ts ./test.ts
```

### Adding Types

If playing around in a file it might be convenient to remove TypeScript errors and get intellisense. This can be done by dropping a reference path into the system under test. Like the `DebugViz` calls this should be deleted after playing around:

```typescript
/// <reference path="/path/to/turf-debug-viz/types.d.ts" />
```

Run the following in bash when turf-debug-viz is the cwd to get the string to insert:

```bash
echo "/// <reference path=\"$(realpath types.d.ts)\" />"
```

## Using DebugViz API

The hook adds global `DebugViz` functions to your Node.js process that are available both in the project and in the debug console.

The hook will automatically set up and clean up, so there is no need to call open or close methods. Just `send` away.

### `DebugViz.send(label, geojson)`

Synchronously sends GeoJSON to the visualizer. Works correctly when stepping through code in a debugger.

```typescript
import { point } from "@turf/turf";

const pt = point([0, 0]);
DebugViz.send("my-point", pt);

// Send any GeoJSON type
DebugViz.send("feature", {
  type: "Feature",
  geometry: { type: "Point", coordinates: [12, 34] },
  properties: { name: "Test" }
});
```

### `DebugViz.isConnected()`

Check connection status:

```typescript
if (DebugViz.isConnected()) {
  console.log("Connected to debug visualizer");
}
```

### `DebugViz.disconnect()`

Manually disconnect (optional - auto-disconnects on process exit):

```typescript
DebugViz.disconnect();
```

## License

MIT
