# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Do Not Edit

- **`vendor/`** - Vendored CSS from external libraries (Pico CSS theme, theme switcher). Do not modify these files.
- **`public/assets/`** - Build artifacts copied/compiled from source. Never edit files here directly; they are overwritten by the build. Edit the sources instead.

## Project Overview

This is a debug visualization tool for TurfJS that enables real-time visualization of GeoJSON objects during development. It consists of three main components:

1. **WebSocket Relay Server** (`src/index.ts`) - HTTP server with WebSocket relay that broadcasts messages between clients
2. **Debug Hook** (`src/debug-hook.ts`) - Node.js import hook that adds global `DebugViz` and `turf` namespaces
3. **Web Client** (`src/client/`) - TypeScript browser client with Mapbox GL map, sidebar list, and view/diff modes

## Architecture

### Server (`src/index.ts`)

- HTTP server serving static files from `public/` and `public/assets/`
- WebSocket server at `/ws` that relays messages between all connected clients
- Listens on `127.0.0.1:8873` by default
- Configured via environment variables: `TURF_DEBUG_HOST`, `TURF_DEBUG_PORT`
- Logging via `NODE_DEBUG=turf-debug-viz` for debug messages
- Opens the browser automatically on start
- No message validation - acts as a transparent relay

### Debug Hook (`src/debug-hook.ts`)

- Designed to be loaded via Node's `--import` flag
- Adds `globalThis.DebugViz` namespace with four methods:
  - `DebugViz.send(geojson, label?)` - sends GeoJSON to relay
  - `DebugViz.diff(geojsonFrom, geojsonTo, label?)` - sends a diff pair to relay
  - `DebugViz.disconnect()` - closes WebSocket connection
  - `DebugViz.isConnected()` - checks connection status
- Adds `globalThis.turf` - the full `@turf/turf` library for use in debugging
- **Intentionally synchronous** - uses `deasync` so calls work correctly when stepping through code in a debugger
- Lazily connects on first use; WebSocket is `unref`'d so it won't prevent process exit
- Connects to relay server using `TURF_DEBUG_HOST` and `TURF_DEBUG_PORT` env vars (defaults: `127.0.0.1:8873`)

### Message Protocol

Messages are JSON over WebSocket. Two kinds, discriminated by `kind`:

- **`SendMessage`**: `{ kind: "send", geojson: GeoJSON, label?: string, ts: number }`
- **`DiffMessage`**: `{ kind: "diff", from: GeoJSON, to: GeoJSON, label?: string, ts: number }`

See `types.d.ts` for full type definitions including `ViewRow` and `DiffEntry` (client-side state types).

### Web Client (`src/client/`)

The client is a multi-file TypeScript application bundled with esbuild.

**Entry point**: `src/client/index.ts` - WebSocket connection, message routing, keyboard shortcuts, panel/sidebar toggling.

**State management** (event-driven, extends `EventTarget` with typed `change` events):
- `view.ts` - `ViewState` class managing `ViewRow[]` for view mode (add, delete, expand, hide)
- `diff.ts` - `DiffState` class managing `DiffEntry[]` for diff mode (add, delete, set active)

**UI modules**:
- `mode-menu.ts` - `Mode` enum (`VIEW`, `DIFF`), mode switching via `modechange` custom event, shared map controls (autofit, show vertices, zoom to fit)
- `list.ts` - Sidebar list renderer using d3 keyed joins, mode-aware (renders ViewRows or DiffEntries)
- `map.ts` - `MapView` class wrapping Mapbox GL JS with GeoJSON source/layer management, popups, theme switching
- `map-controller.ts` - `MapController` that listens to ViewState, DiffState, and mode events to coordinate map updates
- `helpers.ts` - Color palettes (TokyoNight), HTML generation utilities

**Key behaviors**:
- Two modes: VIEW (individual GeoJSON items) and DIFF (side-by-side comparison pairs)
- Diff messages create two ViewRows plus a DiffEntry; deleting a ViewRow cascades to remove associated diffs
- Sidebar list renders in reverse chronological order with controls for visibility, expand, zoom, delete
- UI state (sidebar visibility, panel mode, autofit) persisted in localStorage
- Keyboard shortcuts: `w` = view mode, `d` = diff mode, `v` = cycle panels, `s` = toggle sidebar
- Auto-reconnects to WebSocket on disconnect

## Coding Style

- Use `d3-selection` or vanilla DOM APIs for DOM manipulation. No other UI frameworks.
- Prefer simple, direct code. Avoid premature abstraction - three similar lines are better than a helper used once.
- State classes use `EventTarget` with typed `CustomEvent` for change notifications; consumers subscribe to `change` events.
- CSS uses Pico CSS framework (dashboard-blue theme) with custom overrides in `src/client/style.css`.

## Configuration

Both the server and debug hook use the same environment variables:

- `TURF_DEBUG_HOST` - Host address (default: `127.0.0.1`)
- `TURF_DEBUG_PORT` - Port number (default: `8873`)

## Development Commands

```bash
# Full build (client + assets)
npm run build

# Build the TypeScript client only
npm run build:client

# Watch mode (client, assets, and server with hot reload)
npm run watch

# Start the relay server only (no build)
npm start

# Enable debug logging
NODE_DEBUG=turf-debug-viz npm start

# Test the debug hook (requires relay server running)
npx tsx --import ./src/debug-hook.ts test.ts

# Format code
npm run format
```

## Usage Pattern

1. Start relay server: `npm run watch` (builds and watches everything)
2. Browser opens automatically to `http://127.0.0.1:8873`
3. Run your Node.js app with the debug hook:

   ```bash
   npx tsx --import ./src/debug-hook.ts yourApp.ts
   ```

4. In your code:

   ```typescript
   // Send GeoJSON to visualizer
   DebugViz.send(myFeature, "my-label");

   // Diff two GeoJSON objects
   DebugViz.diff(before, after, "my-diff");

   // turf is available globally
   const buffered = turf.buffer(myFeature, 10);
   ```

## Project Structure

```
├── src/
│   ├── index.ts              # Relay server
│   ├── debug-hook.ts         # Node.js import hook
│   ├── config.ts             # Mapbox token (gitignored)
│   └── client/
│       ├── index.ts          # Client entry point
│       ├── view.ts           # ViewState class
│       ├── diff.ts           # DiffState class
│       ├── list.ts           # Sidebar list renderer (d3)
│       ├── map.ts            # MapView (Mapbox GL wrapper)
│       ├── map-controller.ts # State-to-map coordinator
│       ├── mode-menu.ts      # Mode switching and shared controls
│       ├── helpers.ts        # Color palettes, utilities
│       └── style.css         # Custom CSS overrides
├── vendor/                   # Vendored CSS (do not edit)
│   ├── dashboard-blue.css
│   └── theme-switcher-pico.css
├── public/
│   ├── index.html            # Main HTML page
│   └── assets/               # Build artifacts (gitignored, do not edit)
├── types.d.ts                # Shared type definitions
├── test.ts                   # Test script
├── tsconfig.client.json      # TypeScript config for client bundle
└── package.json
```

## Key Dependencies

- `ws` - WebSocket implementation for server and hook
- `d3-selection` - DOM manipulation in the client
- `deasync` - Synchronous blocking for the debug hook
- `@turf/turf` - TurfJS library (exposed globally via hook, bundled for client)
- `mapbox-gl` - Map rendering (loaded via CDN, types via `@types/mapbox-gl`)
- `esbuild` - Client bundling
- `concurrently` / `cpx2` - Build orchestration and asset copying

## Build

The client is bundled with esbuild from `src/client/index.ts` to `public/assets/client.js`. The build also copies `src/client/style.css`, `vendor/*`, and `@turf/turf/turf.min.js` into `public/assets/`. All of `public/assets/` is gitignored.

Always run `npm run build` (or use `npm run watch`) after modifying client source files.
