/**
  * Turf Debug Visualization.
  *
  * Creates a simple websocket relay and static site server to enable easy
  * visualization of geojson objects in turfjs during debugging.
  */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { WebSocketServer, type WebSocket } from "ws";

// Configuration from environment variables
const HOST = process.env.TURF_DEBUG_HOST ?? "127.0.0.1";
// TODO: Number parsing should be more rigorous
const PORT = Number(process.env.TURF_DEBUG_PORT ?? 8873);

// Simple logging utilities
const logger = {
  error: (...args: unknown[]) => console.error("[ERROR]", ...args),
  info: (...args: unknown[]) => console.log("[INFO]", ...args),
  debug: (...args: unknown[]) => {
    // Only log debug messages if NODE_DEBUG includes 'turf-debug-viz'
    if (process.env.NODE_DEBUG?.includes("turf-debug-viz")) {
      console.log("[DEBUG]", ...args);
    }
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_FILE = path.join(__dirname, "../", "public", "index.html");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

async function serveFile(filePath: string, res: http.ServerResponse) {
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "content-type": contentType,
      // Keep no-store for development convenience - files can change during development
      "cache-control": "no-store",
    });
    res.end(buf);
  } catch (err) {
    logger.error("Failed to read file:", filePath, err);
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/" || url === "/index.html") {
    return serveFile(INDEX_FILE, res);
  }

  // Serve static assets from public/assets directory
  if (url.startsWith("/assets/")) {
    const filePath = path.join(__dirname, "../", "public", url);
    return serveFile(filePath, res);
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  logger.debug("Client connected, total clients:", clients.size);

  ws.on("message", (raw) => {
    const s = raw.toString();
    logger.debug("Message received:", s);
    broadcastOthers(ws, s);
  });

  ws.on("close", () => {
    clients.delete(ws);
    logger.debug("Client disconnected, total clients:", clients.size);
  });

  ws.on("error", (err) => {
    logger.error("WebSocket error:", err);
    clients.delete(ws);
  });
});

function broadcastOthers(sender: WebSocket, raw: string) {
  for (const c of clients) {
    if (c !== sender && c.readyState === c.OPEN) c.send(raw);
  }
}

function openBrowser(url: string) {
  const command = process.platform === "win32"
    ? `start ${url}`
    : process.platform === "darwin"
      ? `open ${url}`
      : `xdg-open ${url}`;

  exec(command, (err) => {
    if (err) {
      logger.debug("Failed to open browser:", err.message);
    }
  });
}

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  logger.info(`Relay listening on ${url}`);
  logger.info(`WebSocket endpoint ws://${HOST}:${PORT}/ws`);
  openBrowser(url);
});

