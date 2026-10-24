// Plain static host for local acceptance; no upstream APIs or image proxies.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { inside } from './lib.mjs';
const root = resolve(process.argv[2] || 'site');
const port = Number(process.env.STATIC_PREVIEW_PORT || 8795);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Match Vercel cleanUrls, including the redirect encountered during PWA precaching.
    if (pathname.endsWith('/index.html')) {
      res.writeHead(308, { Location: pathname.slice(0, -'index.html'.length) }); res.end(); return;
    }
    let file = inside(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(308, { Location: pathname + '/' }); res.end(); return; }
      file = resolve(file, 'index.html');
    }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Static preview: http://127.0.0.1:${port}/`));
