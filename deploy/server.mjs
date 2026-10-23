import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { timingSafeEqual, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import worker from '../dist/worker.mjs';

const username = process.env.ADMIN_USER || 'admin';
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 16) throw new Error('ADMIN_PASSWORD must contain at least 16 characters');
const data = resolve(process.env.DATA_DIR || './data');
mkdirSync(data, { recursive: true });
const db = new DatabaseSync(resolve(data, 'app.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS objects (key TEXT PRIMARY KEY,bytes BLOB NOT NULL,metadata TEXT NOT NULL,uploaded TEXT NOT NULL); CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
for (const name of readdirSync(new URL('../workers/migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort()) {
  if (db.prepare('SELECT name FROM migrations WHERE name=?').get(name)) continue;
  db.exec('BEGIN IMMEDIATE');
  try { db.exec(readFileSync(new URL(`../workers/migrations/${name}`, import.meta.url), 'utf8')); db.prepare('INSERT INTO migrations VALUES (?)').run(name); db.exec('COMMIT'); }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function statement(sql, args = []) {
  return {
    bind: (...values) => statement(sql, values),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ results: [], meta: db.prepare(sql).run(...args) }),
    execute: () => ({ results: db.prepare(sql).all(...args) }),
  };
}
function object(key) {
  const row = db.prepare('SELECT * FROM objects WHERE key=?').get(key);
  if (!row) return null;
  const bytes = new Uint8Array(row.bytes);
  return { key, body: bytes, size: bytes.length, uploaded: new Date(row.uploaded), httpMetadata: JSON.parse(row.metadata), httpEtag: `"${createHash('sha256').update(bytes).digest('hex')}"`, arrayBuffer: async () => bytes.buffer, json: async () => JSON.parse(new TextDecoder().decode(bytes)) };
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const env = {
  DEV_DISABLE_AUTH: '1', // Only reached after the server's own Basic authentication gate.
  RELATIVE_MEDIA_URLS: '1',
  TELEMETRY_WECHAT_APP_ID: process.env.TELEMETRY_WECHAT_APP_ID,
  CONFIG: {
    get: async (key, type) => { const value = db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value ?? null; return value && type === 'json' ? JSON.parse(value) : value; },
    put: async (key, value) => { db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(key, value); },
  },
  MEDIA: {
    get: async key => object(key), head: async key => object(key),
    put: async (key, value, options = {}) => {
      const bytes = typeof value === 'string' ? Buffer.from(value) : new Uint8Array(value);
      db.prepare('INSERT OR REPLACE INTO objects VALUES (?,?,?,?)').run(key, bytes, JSON.stringify(options.httpMetadata || {}), new Date().toISOString());
    },
    list: async ({ prefix = '', cursor = '' }) => {
      const rows = db.prepare('SELECT key,uploaded FROM objects WHERE substr(key,1,?)=? AND key>? ORDER BY key LIMIT 1001').all(prefix.length, prefix, cursor);
      const objects = rows.slice(0, 1000).map(row => ({ ...row, uploaded: new Date(row.uploaded) }));
      return { objects, truncated: rows.length > 1000, cursor: objects.at(-1)?.key };
    },
  },
  STATS: { prepare: statement, batch: async statements => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = statements.map(s => s.execute()); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } },
  TELEMETRY_LIMITER: { limit: async ({ key }) => {
    const now = Date.now();
    for (const [ip, value] of limits) if (now - value.start >= 60000) limits.delete(ip);
    let bucket = limits.get(key);
    if (!bucket) { bucket = { start: now, count: 0 }; limits.set(key, bucket); }
    return { success: ++bucket.count <= 60 };
  } },
  ASSETS: { fetch: async request => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const root = resolve('apps/web/dist');
    let file = resolve(root, `.${path === '/' ? '/index.html' : path === '/admin/' ? '/admin/index.html' : path}`);
    if (!file.startsWith(root + sep)) return new Response(null, { status: 404 });
    try {
      if (!statSync(file).isFile()) return new Response(null, { status: 404 });
      return new Response(request.method === 'HEAD' ? null : readFileSync(file), { headers: { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': path.startsWith('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache' } });
    } catch { return new Response(null, { status: 404 }); }
  } },
};
const limits = new Map();
// Serialize requests so read/check/backup/save cannot interleave across editors.
let queue = Promise.resolve();
const expected = createHash('sha256').update(`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`).digest();
const server = createServer((req, res) => {
  const run = async () => {
    // The reverse proxy must preserve Host. Do not trust forwarded headers.
    const incomingOrigin = req.headers.origin;
    const host = req.headers.host;
    if (!host || /[/\\\s@?#]/.test(host)) { res.writeHead(400); res.end(); return; }
    let browserOrigin;
    try { browserOrigin = incomingOrigin ? new URL(incomingOrigin) : null; } catch {}
    const sameHost = browserOrigin && ['http:', 'https:'].includes(browserOrigin.protocol) && browserOrigin.host === host;
    const origin = sameHost ? browserOrigin.origin : `http://${host}`;
    const url = new URL(req.url, origin);
    const admin = url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/');
    if (admin && !timingSafeEqual(expected, createHash('sha256').update(req.headers.authorization || '').digest())) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Map administration", charset="UTF-8"', 'Cache-Control': 'no-store' }); res.end(); return;
    }
    if (admin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && ((incomingOrigin && !sameHost) || req.headers['sec-fetch-site'] === 'cross-site')) { res.writeHead(403); res.end(); return; }
    if (url.pathname === '/healthz') { db.prepare('SELECT 1').get(); res.writeHead(200); res.end('ok'); return; }
    if (url.pathname === '/admin') { res.writeHead(308, { Location: '/admin/' }); res.end(); return; }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    headers.set('CF-Connecting-IP', req.socket.remoteAddress || 'unknown');
    const request = new Request(url, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
    const response = await worker.fetch(request, { ...env, TELEMETRY_ORIGIN: origin });
    res.writeHead(response.status, { ...Object.fromEntries(response.headers), 'X-Content-Type-Options': 'nosniff', ...(admin ? { 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } : {}) });
    if (req.method === 'HEAD' || !response.body) res.end(); else res.end(Buffer.from(await response.arrayBuffer()));
  };
  queue = queue.then(run).catch(error => { console.error('request_failed', error); if (!res.headersSent) res.writeHead(500); res.end(); });
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('Server listening with same-origin media (domain independent)'));
const maintenance = setInterval(() => { queue = queue.then(() => worker.scheduled({}, env)).catch(console.error); }, 86400000);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(maintenance); server.close(() => { db.close(); process.exit(0); }); });
