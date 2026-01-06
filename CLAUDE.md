# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a debug visualization tool for TurfJS that enables real-time visualization of GeoJSON objects during development. It consists of three main components:

1. **WebSocket Relay Server** (`index.ts`) - HTTP server with WebSocket relay that broadcasts messages between clients
2. **Export Hook** (`export-hook.ts`) - Node.js import hook that adds global functions for sending GeoJSON to the relay
3. **Web Client** (`client.ts` → `public/assets/client.js`) - TypeScript browser client that displays GeoJSON in real-time

## Architecture

### Server (index.ts)

- HTTP server serving static files from `public/` and `public/assets/`
- WebSocket server at `/ws` that relays messages between all connected clients
- Listens on `127.0.0.1:7777` by default
- Configured via environment variables: `TURF_DEBUG_HOST`, `TURF_DEBUG_PORT`
- Logging via `NODE_DEBUG=turf-debug-viz` for debug messages
- Uses `fs/promises` for async file operations
- No message validation - acts as a transparent relay

### Export Hook (export-hook.ts)

- Designed to be loaded via Node's `--import` flag
- Adds `globalThis.DebugViz` namespace with three methods:
  - `DebugViz.send(label, geojson)` - sends GeoJSON to relay
  - `DebugViz.disconnect()` - closes WebSocket connection
  - `DebugViz.isConnected()` - checks connection status
- Automatically disconnects on process exit
- Connects to relay server using `TURF_DEBUG_HOST` and `TURF_DEBUG_PORT` env vars (defaults: `127.0.0.1:7777`)
- Queues messages when disconnected (max 2000 messages)
- Type-safe: only accepts GeoJSON objects (uses `@types/geojson`)
- Message structure: `{ label: string, ts: number, geojson: GeoJSON }`

### Web Client (client.ts)

- TypeScript source in project root, compiled to `public/assets/client.js`
- Separated CSS in `public/assets/style.css`
- Auto-reconnects to WebSocket on disconnect
- Features: label filtering, configurable max rows (100-3000), clear button
- Displays GeoJSON in reverse chronological order with timestamp and label
- Parse errors logged to console instead of displaying

## Configuration

Both the server and export hook use the same environment variables:

- `TURF_DEBUG_HOST` - Host address (default: `127.0.0.1`)
- `TURF_DEBUG_PORT` - Port number (default: `7777`)

```bash
# Use custom host/port
export TURF_DEBUG_HOST=0.0.0.0
export TURF_DEBUG_PORT=8080

# Or inline for single command
TURF_DEBUG_PORT=8080 npm start
```

## Development Commands

```bash
# Build the TypeScript client
npm run build:client

# Watch mode for client development
npm run watch:client

# Build client and start server
npm run dev

# Start the relay server only
npm start

# Start with custom port
TURF_DEBUG_PORT=8080 npm start

# Enable debug logging
NODE_DEBUG=turf-debug-viz npm start

# Test the export hook (requires relay server running)
npx tsx --import ./export-hook.ts test.ts

# Test with custom port (must match server)
TURF_DEBUG_PORT=8080 npx tsx --import ./export-hook.ts test.ts
```

## Usage Pattern

1. Start relay server: `npm run dev` (builds client and starts server)
2. Open browser to `http://127.0.0.1:7777`
3. Run your Node.js app with the export hook:

   ```bash
   npx tsx --import ./export-hook.ts yourApp.ts
   ```

4. In your code:

   ```typescript
   // Send GeoJSON to visualizer
   DebugViz.send("my-feature", {
     type: "Feature",
     geometry: { type: "Point", coordinates: [0, 0] },
     properties: { name: "Test" }
   });

   // Check connection status
   if (DebugViz.isConnected()) {
     console.log("Connected to debug visualizer");
   }

   // Optional: manually disconnect (auto-disconnects on process exit)
   DebugViz.disconnect();
   ```

## TypeScript Configuration

### Server-side TypeScript

- Uses ES modules (`"type": "module"` in package.json)
- Server runs directly with `tsx` (no build step)
- `tsconfig.client.json` for browser client compilation only

### Using in Other TypeScript Projects

Copy these type declarations to your project:

```typescript
import type { GeoJSON } from "geojson";

declare global {
  namespace DebugViz {
    function send(label: string, geojson: GeoJSON): void;
    function disconnect(): void;
    function isConnected(): boolean;
  }
  var DebugViz: typeof DebugViz;
}
```

See `types.d.ts` for the complete type definitions.

## Project Structure

```
├── index.ts              # Relay server
├── export-hook.ts        # Node.js import hook
├── client.ts             # Browser client (TypeScript source)
├── types.d.ts            # Reusable type definitions
├── test.ts               # Test script
├── tsconfig.client.json  # TypeScript config for browser client
├── public/
│   ├── index.html        # Main HTML (references external assets)
│   └── assets/
│       ├── style.css     # Extracted CSS
│       ├── client.js     # Compiled browser client (gitignored)
│       └── client.js.map # Source map (gitignored)
```

## Key Dependencies

- `ws` - WebSocket implementation for server and hook
- `@types/geojson` - GeoJSON type definitions
- `tsx` - TypeScript execution for server (dev dependency)
- `typescript` - TypeScript compiler for client build (dev dependency)

## Build Artifacts

The following files are auto-generated and gitignored:

- `public/assets/client.js`
- `public/assets/client.js.map`

Always run `npm run build:client` after modifying `client.ts`.
