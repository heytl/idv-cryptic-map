// A dependency-free capture phase can run separately from an offline UI build.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mediaReferences, sha256, write } from './lib.mjs';
export async function capture(endpoint, destination) {
  async function download(url, image = false) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        if (image && !/^image\//.test(response.headers.get('content-type') || '')) throw Error('Expected image');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) throw Error('Empty response');
        return bytes;
      } catch (error) { if (attempt === 2) throw Error(`Cannot capture ${url}: ${error.message}`); }
    }
  }
  const originalBytes = await download(endpoint), original = JSON.parse(originalBytes);
  if (original.schemaVersion !== 4 || !Array.isArray(original.layouts)) throw Error('Expected public V4 config');
  const capturedAt = new Date().toISOString();
  const urls = [...new Set(mediaReferences(original).map(([item, key]) => new URL(item[key], endpoint).href))];
  const mediaIndex = []; let index = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (index < urls.length) {
      const url = urls[index++], bytes = await download(url, true);
      if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw Error(`Invalid WebP: ${url}`);
      const hash = sha256(bytes), path = `media/${hash}.webp`;
      await write(resolve(destination, path), bytes);
      mediaIndex.push({ source: url, path, sha256: hash, bytes: bytes.length });
      if (mediaIndex.length % 40 === 0) console.log(`Captured ${mediaIndex.length}/${urls.length} images`);
    }
  }));
  if (sha256(await download(endpoint)) !== sha256(originalBytes)) throw Error('Config changed during capture; discard this capture and retry');
  mediaIndex.sort((a, b) => a.source.localeCompare(b.source));
  await write(resolve(destination, 'source.json'), originalBytes);
  await write(resolve(destination, 'capture.json'), JSON.stringify({ sourceUrl: endpoint.href, capturedAt, configSha256: sha256(originalBytes), mediaIndex }, null, 2));
  console.log(`Complete capture: ${original.layouts.length} layouts, ${urls.length} source images`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const endpoint = new URL(process.argv[2]);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('Use a public HTTPS endpoint');
  await capture(endpoint, resolve(process.argv[3]));
}
