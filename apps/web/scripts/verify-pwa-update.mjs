// Old cache-first fixture + new production build on one localhost origin.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, relative } from "node:path";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "../../..");
const newDir = resolve(root, "apps/web/dist");
// Minimal fixture of the old production policy: cached HTML + registration
// script, delayed registration, and no page-side update listener.
const legacyWorker = `self.skipWaiting();self.addEventListener('install',e=>e.waitUntil(caches.open('legacy-shell').then(c=>c.addAll(['/','/registerSW.js']))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(['/','/registerSW.js'].includes(new URL(e.request.url).pathname))e.respondWith(caches.open('legacy-shell').then(async c=>(await c.match(e.request))||fetch(e.request)));});`;
let version = "old";
let slowImage = false;
const types = { ".js": "application/javascript", ".html": "text/html", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon" };
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/slow-image") return; // Intentionally prevent window.load.
    if (version === "old" && ["/", "/sw.js", "/registerSW.js"].includes(path)) {
      res.writeHead(200,{"Content-Type":path==="/"?"text/html":"application/javascript","Cache-Control":"no-cache"});
      res.end(path==="/"?'<html data-release="old"><body>Legacy shell<script src="/registerSW.js"></script></body></html>':path==="/sw.js"?legacyWorker:"window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'));");return;
    }
    if (path === "/admin/") {
      res.setHeader("Content-Type", "text/html");res.end('<input id="draft" value=""><p>admin</p>');return;
    }
    if (/^\/(maps-v4.json|r2\/|telemetry\/)/.test(path)) {
      const r = await fetch(`http://127.0.0.1:8787${req.url}`, { method: req.method, ...(req.method === "POST" ? { body: "{}", headers: {"Content-Type":"application/json"} } : {}) });
      res.writeHead(r.status, Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
    }
    const file = resolve(newDir, `.${path === "/" ? "/index.html" : path}`);
    if (relative(newDir, file).startsWith("..")) {res.writeHead(404);res.end();return;}
    await stat(file);
    let bytes = await readFile(file);
    if (path === "/" || path === "/index.html") bytes = Buffer.from(bytes.toString().replace('<html lang="zh-CN">', `<html lang="zh-CN" data-release="${version}">`).replace('</body>', `${slowImage ? '<img src="/slow-image">' : ''}</body>`));
    res.writeHead(200, {"Content-Type":types[extname(file)] || "application/octet-stream", "Cache-Control":"no-cache"});res.end(bytes);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({channel:"chrome",headless:true});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base, {waitUntil:"domcontentloaded"});
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  assert.equal(await page.getAttribute("html", "data-release"), "old");
  const admin = await context.newPage();await admin.goto(base+"/admin/");await admin.fill("#draft", "unsaved");
  version = "new";
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(() => document.documentElement.dataset.release === "new", undefined, {timeout:30000});
  assert.equal(await admin.inputValue("#draft"), "unsaved");
  version = "next";
  await page.reload({waitUntil:"domcontentloaded"});
  assert.equal(await page.getAttribute("html", "data-release"), "next");
  // A successful activation seeded the offline HTML without deleting maps.
  await page.evaluate(async () => {
    const cache = await caches.open("map-images-r2");await cache.put("/r2/maps/full/keep.webp",new Response("keep"));
  });
  await context.setOffline(true);
  await page.reload({waitUntil:"domcontentloaded"});
  assert.equal(await page.getAttribute("html","data-release"),"next");
  assert.equal(await page.evaluate(async()=> (await(await caches.open("map-images-r2")).match("/r2/maps/full/keep.webp"))?.text()),"keep");
  await context.close();
  // First installation checks updates before slow resources finish loading.
  slowImage = true;
  const fresh = await browser.newContext();const freshPage = await fresh.newPage();
  await freshPage.goto(base,{waitUntil:"domcontentloaded"});
  await freshPage.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, {timeout:15000});
  assert.notEqual(await freshPage.evaluate(()=>document.readyState),"complete");
  await fresh.close();
  console.log("PASS: legacy upgrade, online HTML refresh, admin drafts, offline shell/maps, registration before slow images finish");
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
