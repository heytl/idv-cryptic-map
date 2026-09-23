// Local UI + read-only public demo content. Never forwards admin or telemetry writes.
// DEMO_CONFIG_URL may point to a public V2 or V3 JSON endpoint.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "apps/web/dist");
const endpoint = new URL(process.env.DEMO_CONFIG_URL || "https://idv-map.321666.xyz/maps-v2.json");
if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
  throw new Error("DEMO_CONFIG_URL must be a public HTTP(S) URL without credentials");
}
const port = Number(process.env.DEMO_PREVIEW_PORT || 8791);
const media = new Map();
let cached;
let loadedAt = 0;
let loading;
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript",
  ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

async function upstream(url) {
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { Accept: "application/json, image/*;q=0.9, */*;q=0.5" } });
      break;
    } catch (error) {
      const transient = error.name === "TimeoutError" || ["ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"].includes(error.cause?.code);
      if (attempt || !transient) throw error;
    }
  }
  if (!response.ok) throw new Error(`Demo returned HTTP ${response.status}`);
  return response;
}
function imageUrl(value) {
  if (typeof value !== "string" || !value) throw new Error("Invalid image URL in demo config");
  const url = new URL(value, endpoint);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid image protocol");
  const hash = createHash("sha256").update(url.href).digest("hex").slice(0, 16);
  // Preserve the original image path so existing PWA image caching rules still apply.
  const local = `/_demo-media/${hash}${url.pathname}`;
  media.set(local, url.href);
  return local;
}
async function loadConfig() {
  if (cached && Date.now() - loadedAt < 30000) return cached;
  if (loading) return loading;
  loading = (async () => {
    const source = await (await upstream(endpoint)).json();
    let config;
    if (source.schemaVersion === 3 && Array.isArray(source.layouts) && Array.isArray(source.gameMaps)) {
      config = structuredClone(source);
    } else if (source.schemaVersion === 2 && Array.isArray(source.maps)) {
      const { maps, ...rest } = source;
      config = {
        ...rest, schemaVersion: 3,
        gameMaps: [{ id: "lady-of-doom", name: "厄运之女", sort: 10, published: true }],
        layouts: maps.map(({ layout, ...item }) => ({ ...item, gameMapId: "lady-of-doom", floorImages: layout })),
      };
    } else throw new Error("Demo endpoint must return public V2 or V3 JSON");
    for (const layout of config.layouts) {
      for (const asset of Object.values(layout.floorImages)) asset.url = imageUrl(asset.url);
      for (const entrance of layout.entrances) {
        entrance.imageUrl = imageUrl(entrance.imageUrl);
        entrance.thumbUrl = imageUrl(entrance.thumbUrl);
      }
    }
    cached = config;
    loadedAt = Date.now();
    console.log(`Loaded demo: ${config.layouts.length} layouts, ${config.gameMaps.length} maps, data version ${config.dataVersion}`);
    return config;
  })();
  try { return await loading; } finally { loading = undefined; }
}

await stat(resolve(dist, "index.html"));
createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/telemetry/events" && req.method === "POST") {
    req.resume(); res.writeHead(204); res.end(); return;
  }
  if (!["GET", "HEAD"].includes(req.method)) { req.resume(); res.writeHead(405); res.end(); return; }
  if (path.startsWith("/api/") || path.startsWith("/admin")) { res.writeHead(404); res.end(); return; }
  try {
    if (path === "/maps-v3.json") {
      const config = await loadConfig();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(config));
      return;
    }
    if (path.startsWith("/_demo-media/")) {
      if (!media.has(path)) await loadConfig();
      const url = media.get(path);
      if (!url) { res.writeHead(404); res.end(); return; }
      const response = await upstream(url);
      const type = response.headers.get("content-type") || "";
      if (!type.startsWith("image/")) throw new Error("Demo returned non-image content");
      const bytes = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", type);
      res.end(req.method === "HEAD" ? undefined : bytes);
      return;
    }
    const file = resolve(dist, `.${decodeURIComponent(path === "/" ? "/index.html" : path)}`);
    if (relative(dist, file).startsWith("..")) { res.writeHead(404); res.end(); return; }
    let bytes;
    try { bytes = await readFile(file); } catch { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch (error) {
    const reason = `${error.message}${error.cause?.code ? ` (${error.cause.code})` : ""}`;
    console.error(`Demo read failed: ${reason}`);
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "线上 demo 读取失败", reason }));
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Local UI: http://127.0.0.1:${port}/#/maps`);
  console.log(`Read-only demo: ${endpoint.href}`);
  console.log("Telemetry is discarded locally; admin routes are disabled.");
});
