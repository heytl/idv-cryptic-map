// Isolated verification only: real Worker handlers, in-memory KV/R2 and SQLite.
// All referenced media use a local sample WebP, never production downloads.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dirname, "..");
const { default: worker } = await import(
  pathToFileURL(resolve(root, ".tmp/worker-build/index.js"))
);
const port = Number(process.env.TEST_PORT || 8787);
const origin = `http://127.0.0.1:${port}`;
const config = JSON.parse(
  readFileSync(
    resolve(root, "apps/web/src/data/maps-v3.snapshot.json"),
    "utf8",
  ),
);
// Add a second map to verify duplicate names and isolated routing/cache downloads.
const l = structuredClone(
  config.layouts.find((l) => l.mode === "hard" && l.published && !l.deletedAt),
);
config.gameMaps.push({
  id: "second",
  name: "测试地图",
  published: true,
  sort: 20,
});
l.id = 999;
l.gameMapId = "second";
l.entrances.forEach((e) => (e.id = `999-${e.type}`));
config.layouts.push(l);
const kv = new Map(
  process.env.TEST_EMPTY === "1"
    ? []
    : [["config:v3:current", JSON.stringify(config)]],
);
const sample = readFileSync(resolve(root, "scripts/fixtures/layout.webp"));
const objects = new Map();
if (process.env.TEST_EMPTY !== "1")
  for (const item of config.layouts)
    for (const a of [
      ...Object.values(item.floorImages),
      ...item.entrances.flatMap((e) => [e.image, e.thumb]),
    ])
      if (a) objects.set(a.key, { bytes: sample, type: "image/webp" });
const db = new DatabaseSync(":memory:");
db.exec(
  readFileSync(resolve(root, "workers/migrations/0001_statistics.sql"), "utf8"),
);
function prepare(sql) {
  let values = [];
  return {
    bind(...v) {
      values = v;
      return this;
    },
    async all() {
      return { results: db.prepare(sql).all(...values) };
    },
    async run() {
      return db.prepare(sql).run(...values);
    },
    execute() {
      return /^SELECT/i.test(sql)
        ? { results: db.prepare(sql).all(...values) }
        : { results: [], ...db.prepare(sql).run(...values) };
    },
  };
}
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webp": "image/webp",
};
const env = {
  DEV_DISABLE_AUTH: "1",
  TELEMETRY_ORIGIN: origin,
  IMG_BASE_URL: "/r2",
  TELEMETRY_LIMITER: { limit: async () => ({ success: true }) },
  CONFIG: {
    get: async (k, type) => {
      const v = kv.get(k);
      return v ? (type === "json" ? JSON.parse(v) : v) : null;
    },
    put: async (k, v) => kv.set(k, v),
  },
  MEDIA: {
    head: async (k) => (objects.has(k) ? { key: k } : null),
    put: async (k, value, options) =>
      objects.set(k, {
        bytes: Buffer.from(value),
        type: options?.httpMetadata?.contentType || "image/webp",
      }),
    get: async (k) => {
      const a = objects.get(k);
      return a
        ? {
            body: new Blob([a.bytes]).stream(),
            httpMetadata: { contentType: a.type },
            httpEtag: '"fixture"',
            arrayBuffer: async () => Uint8Array.from(a.bytes).buffer,
            json: async () => JSON.parse(a.bytes.toString()),
          }
        : null;
    },
    list: async ({ prefix }) => ({
      objects: [...objects.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((key) => ({ key, uploaded: new Date() })),
      truncated: false,
    }),
  },
  STATS: {
    prepare,
    batch: async (stmts) => {
      db.exec("BEGIN");
      try {
        const results = stmts.map((s) => s.execute());
        db.exec("COMMIT");
        return results;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  },
  ASSETS: {
    fetch: async (req) => {
      const path = decodeURIComponent(new URL(req.url).pathname);
      const dist = resolve(root, "apps/web/dist");
      let file = resolve(dist, `.${path}`);
      if (relative(dist, file).startsWith(".."))
        return new Response(null, { status: 404 });
      if (path.endsWith("/")) file = resolve(file, "index.html");
      if (!existsSync(file)) return new Response(null, { status: 404 });
      return new Response(readFileSync(file), {
        headers: {
          "Content-Type": mime[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-cache",
        },
      });
    },
  },
};
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request(new URL(req.url, origin), {
      method: req.method,
      headers: req.headers,
      ...(!["GET", "HEAD"].includes(req.method)
        ? { body: Buffer.concat(chunks) }
        : {}),
    });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end("fixture error");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Verification server ${origin}`),
);
process.on("SIGTERM", () => {
  server.close();
  db.close();
});
