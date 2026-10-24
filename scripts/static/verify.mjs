import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { files, inventory, json, mediaReferences, sha256, verifyRelease } from './lib.mjs';

export async function verifySite(site) {
  const reports = [];
  const legacy = await json(resolve(site, 'v1/archive.json'));
  assert.deepEqual((await inventory(resolve(site, 'v1'))).filter(x => x.path !== 'archive.json'), legacy.files, 'Every original v1 file must remain byte-for-byte identical');
  const legacyConfig = await json(resolve(site, 'v1/maps.json'));
  for (const layout of legacyConfig) {
    for (const key of ['entryImg', 'floor1Img', 'floor2Img']) {
      assert(legacy.files.some(file => file.path === layout[key]), `Missing original resource: ${layout[key]}`);
    }
  }
  reports.push({ version: 'v1', layouts: legacyConfig.length, originalFiles: legacy.files.length, byteIdentical: true });
  const roots = [{ directory: site, version: 'latest' }];
  for (const entry of await readdir(site, { withFileTypes: true })) if (entry.isDirectory() && entry.name !== 'v1' && /^v[1-9]\d*(?:\.\d+){0,2}$/.test(entry.name)) roots.push({ directory: resolve(site, entry.name), version: entry.name });
  for (const { directory, version } of roots) {
    const release = await verifyRelease(directory);
    const originalBytes = await readFile(resolve(directory, 'source-maps-v4.json'));
    assert.equal(sha256(originalBytes), release.sourceConfigSha256);
    const original = JSON.parse(originalBytes), config = await json(resolve(directory, 'maps-v4.json'));
    const media = await json(resolve(directory, 'media-index.json'));
    const localized = mediaReferences(config), source = mediaReferences(original);
    assert.equal(localized.length, source.length);
    for (let i = 0; i < localized.length; i++) {
      const [item, key] = localized[i], [origin, originKey] = source[i];
      const url = new URL(origin[originKey], release.sourceUrl).href;
      const entry = media.find(asset => asset.source === url);
      assert(entry, `Image missing from capture: ${url}`);
      assert.equal(item[key], release.base + entry.path);
      item[key] = origin[originKey];
    }
    assert.deepEqual(config, original, 'All config fields, regions, ordering, remarks and entrances must be retained');
    for (const asset of media) {
      const bytes = await readFile(resolve(directory, asset.path));
      assert.equal(bytes.length, asset.bytes);
      assert.equal(sha256(bytes), asset.sha256);
    }
    const html = await readFile(resolve(directory, 'index.html'), 'utf8');
    const manifest = await json(resolve(directory, 'manifest.webmanifest'));
    for (const path of ['sw.js', 'registerSW.js']) new Script(await readFile(resolve(directory, path), 'utf8'), { filename: path });
    assert.equal(manifest.scope, release.base); assert.equal(manifest.start_url, release.base);
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      const path = match[1].split('?')[0];
      if (/^https?:/.test(path) || path === '/_vercel/insights/script.js') continue;
      assert(path.startsWith(release.base), `UI asset escapes release: ${path}`);
      await readFile(resolve(directory, path.slice(release.base.length)));
    }
    reports.push({ version, sourceSha: release.sourceSha, dataVersion: release.dataVersion, layouts: release.layouts, sourceImages: release.sourceImages, uniqueImages: release.uniqueImages, configExact: true, hashesVerified: true });
  }
  const catalog = await json(resolve(site, 'versions/index.json'));
  assert.equal(catalog.versions.length, roots.length);
  assert((await files(site)).includes('versions/index.html'));
  console.log(JSON.stringify({ verified: true, reports }, null, 2));
  return reports;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await verifySite(resolve(process.argv[2] || 'site'));
