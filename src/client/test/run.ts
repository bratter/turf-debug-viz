/// <reference path="../../../types.d.ts" />
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { GeoJSON } from "geojson";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

function load(name: string): GeoJSON {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

const allFiles = new Set(
  readdirSync(fixturesDir).filter((f) => f.endsWith(".geojson")),
);

// Discover diff pairs: *-a.geojson with a matching *-b.geojson
const diffSuites: Record<string, () => void> = {};
for (const file of allFiles) {
  if (!file.endsWith("-a.geojson")) continue;
  const base = file.slice(0, -"-a.geojson".length);
  const bFile = `${base}-b.geojson`;
  if (allFiles.has(bFile)) {
    diffSuites[`diff:${base}`] = () =>
      DebugViz.diff(load(file), load(bFile), `diff:${base}`);
  }
}

// Valid fixtures: non-invalid, non-b files (includes -a files, singletons like geometry-collection)
const validFiles = [...allFiles].filter(
  (f) => !f.startsWith("invalid-") && !f.endsWith("-b.geojson"),
);
const invalidFiles = [...allFiles].filter((f) => f.startsWith("invalid-"));

const suites: Record<string, () => void> = {
  ...diffSuites,
  "diff:cross-type": () => {
    DebugViz.diff(
      load("point-a.geojson"),
      load("polygon-a.geojson"),
      "diff:cross-type — Point→Polygon",
    );
    DebugViz.diff(
      load("polygon-a.geojson"),
      load("multipolygon-a.geojson"),
      "diff:cross-type — Polygon→MultiPolygon",
    );
    DebugViz.diff(
      load("feature-a.geojson"),
      load("feature-polygon.geojson"),
      "diff:cross-type — Feature(Point)→Feature(Polygon)",
    );
  },
  "lint:valid": () => {
    for (const file of validFiles) {
      DebugViz.send(load(file), `lint:valid — ${file.replace(".geojson", "")}`);
    }
  },
  "lint:invalid": () => {
    for (const file of invalidFiles) {
      DebugViz.send(
        load(file),
        `lint:invalid — ${file.slice("invalid-".length).replace(".geojson", "")}`,
      );
    }
  },
};

const groups: Record<string, string[]> = {
  diff: Object.keys(suites).filter((k) => k.startsWith("diff:")),
  lint: ["lint:valid", "lint:invalid"],
};

const args = process.argv.slice(2);
const toRun =
  args.length === 0
    ? Object.keys(suites)
    : args.flatMap((a) => groups[a] ?? [a]);

for (const name of toRun) {
  const suite = suites[name];
  if (!suite) {
    console.error(
      `Unknown suite: ${name}. Available: ${Object.keys(suites).join(", ")}`,
    );
    process.exit(1);
  }
  console.log(`→ ${name}`);
  suite();
}
