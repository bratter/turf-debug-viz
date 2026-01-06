/**
  * Turf Debug Visualization.
  *
  * Creates a simple websocket relay and static site server to enable easy
  * visualization of geojson objects in turfjs during debugging.
  */

// TODO: OVeralll, I don't think that this needs to be content aware at all
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";

// TODO: Accept host and port as command line options. We will manuall parse any CLI options.
// CLI options will only be long form e.g, --host and will always have defaults to make parsing easier
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 7777);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_FILE = path.join(__dirname, "public", "index.html");

function serveIndex(res: http.ServerResponse) {
  // TODO: Replace with fs/promises
  fs.readFile(INDEX_FILE, (err, buf) => {
    if (err) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      // TODO: Don't write out internal errors, but log it to the console
      res.end(`An internal server error occured\n${err}`);
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      // TODO: This is a static site that, once development is finished, won't change that much. Is cache-control required?
      "cache-control": "no-store",
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";
  if (url === "/" || url === "/index.html") return serveIndex(res);
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);

  ws.on("message", (raw) => {
    // TODO: Only log message at a debug log level? How do we set the log level? Do we want a --debug CLI option or better to set an env var?
    // We should just log JSON
    console.log("message", raw);
    broadcastOthers(ws, raw);
  });

  // TODO: Debug logging
  ws.on("close", () => {
    clients.delete(ws);
  });

  // TODO: Error logging in console
  ws.on("error", () => {
    clients.delete(ws);
  });
});

function broadcastOthers(sender: WebSocket, raw: WebSocket.RawData) {
  for (const c of clients) {
    if (c !== sender && c.readyState === c.OPEN) c.send(raw);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`Relay listening on http://${HOST}:${PORT}`);
  console.log(`WebSocket endpoint ws://${HOST}:${PORT}/ws`);
});

