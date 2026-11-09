import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

// Data origin is explicit: production API by default, frozen Git only by request.
export async function loadSource({ root, scratch, git, hash }) {
  const frozen = process.env.MINITOOL_SNAPSHOT_REF;
  const publisherSha = git('rev-parse', frozen || 'main').toString().trim();
  const publisher = git('show', `${publisherSha}:scripts/static/lib.mjs`);
  await mkdir(scratch, { recursive: true });
  await writeFile(resolve(scratch, 'static-lib.mjs'), publisher);
  const { extractGitArchive, mediaReferences } = await import(pathToFileURL(resolve(scratch, 'static-lib.mjs')).href);
  if (frozen) {
    const release = JSON.parse(git('show', `${publisherSha}:site/release.json`));
    if (release.schemaVersion !== 6) throw Error('Expected a public V6 snapshot');
    const archive = resolve(scratch, 'snapshot.tar');
    await writeFile(archive, git('archive', publisherSha, 'site/maps-v6.json', 'site/media'));
    const captured = resolve(scratch, publisherSha);
    await mkdir(captured, { recursive: true }); await extractGitArchive(archive, captured);
    const configPath = resolve(captured, 'site/maps-v6.json');
    const configBytes = await readFile(configPath), config = JSON.parse(configBytes);
    if (config.layouts.length !== release.layouts || config.gameMaps.length !== release.gameMaps || config.dataVersion !== release.dataVersion) throw Error('Snapshot metadata mismatch');
    return { config, configBytes, configPath, mediaRoot: resolve(captured, 'site'), mediaReferences, publisher,
      snapshotSha: publisherSha, source: { kind: 'git-snapshot', ref: frozen, snapshotSha: publisherSha, capturedAt: release.capturedAt } };
  }

  const project = await readFile(resolve(root, 'packages/shared/src/project-info.ts'), 'utf8');
  const website = project.match(/website:\s*"([^"]+)"/)?.[1];
  if (!website) throw Error('Cannot resolve the project production website');
  const productionUrl = new URL('maps-v6.json', website).href;
  const endpoint = new URL(process.env.MINITOOL_SOURCE_URL || productionUrl);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/maps-v6.json') throw Error('Use a public HTTPS V6 endpoint without credentials');
  const preparedCapture = process.env.MINITOOL_CAPTURE_DIR;
  const captured = preparedCapture ? resolve(preparedCapture) : resolve(scratch, 'captures/live');
  await mkdir(captured, { recursive: true });
  let reused = 0, downloaded = 0;
  if (!preparedCapture) {
  const cached = new Map();
  // Existing content-addressed media can be reused only after its hash is checked.
  try {
    const index = JSON.parse(git('show', `${publisherSha}:site/media-index.json`));
    for (const item of index) cached.set(item.source, { ...item, root: resolve(scratch, publisherSha, 'site') });
  } catch { /* The current publisher need not have a previous capture. */ }
  try {
    const previous = JSON.parse(await readFile(resolve(captured, 'capture.json'), 'utf8'));
    for (const item of previous.mediaIndex) cached.set(item.source, { ...item, root: captured });
  } catch { /* First capture. */ }
  const fetchDownload = async (url, options) => {
    const href = new URL(url, endpoint).href;
    const item = cached.get(href);
    if (item && /^media\/[a-f0-9]{64}\.webp$/.test(item.path) && /\/(?:[a-f0-9]{8}|[a-f0-9]{64})\.webp$/.test(new URL(href).pathname)) {
      try {
        const bytes = await readFile(resolve(item.root, item.path));
        const name = new URL(href).pathname.split('/').at(-1).slice(0,-5);
        if (hash(bytes) === item.sha256 && item.sha256.startsWith(name)) {
          reused++; return new Response(bytes, { headers: { 'Content-Type': 'image/webp' } });
        }
      } catch { /* A missing or corrupt cache is fetched again. */ }
    }
    if (href !== endpoint.href) downloaded++;
    return fetch(href, { ...options, cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  };
  // Keep the existing publisher's bounded concurrency, WebP checks and before/after
  // config consistency gate; inject only the immutable-media cache transport.
  let captureCode = git('show', `${publisherSha}:scripts/static/capture.mjs`).toString('utf8');
  const signature = 'export async function capture(endpoint, destination) {';
  const call = 'await fetch(url, { signal: AbortSignal.timeout(30000) })';
  if (captureCode.split(signature).length !== 2 || captureCode.split(call).length !== 2) throw Error('Review publisher capture adapter after source change');
  captureCode = captureCode.replace(signature, 'export async function capture(endpoint, destination, fetchDownload = fetch) {').replace(call, 'await fetchDownload(url, { signal: AbortSignal.timeout(30000) })').replace("from './lib.mjs'", "from './static-lib.mjs'");
  await writeFile(resolve(scratch, 'static-capture.mjs'), captureCode);
  const { capture } = await import(pathToFileURL(resolve(scratch, 'static-capture.mjs')).href + '?t=' + Date.now());
  await capture(endpoint, captured, fetchDownload);
  }
  const captureInfo = JSON.parse(await readFile(resolve(captured, 'capture.json'), 'utf8'));
  if (captureInfo.sourceUrl !== endpoint.href) throw Error('Prepared capture origin mismatch');
  if (preparedCapture && (Date.now() - Date.parse(captureInfo.capturedAt) > 60 * 60 * 1000 || !Number.isFinite(Date.parse(captureInfo.capturedAt)))) throw Error('Prepared capture is stale');
  const configPath = resolve(captured, 'source.json');
  const configBytes = await readFile(configPath), config = JSON.parse(configBytes);
  if (hash(configBytes) !== captureInfo.configSha256) throw Error('Capture metadata hash mismatch');
  const byUrl = new Map(captureInfo.mediaIndex.map(item => [item.source, item]));
  for (const [item, key] of mediaReferences(config)) {
    const media = byUrl.get(new URL(item[key], endpoint).href);
    if (!media || !/^media\/[a-f0-9]{64}\.webp$/.test(media.path)) throw Error('Missing captured media');
    item[key] = '/' + media.path;
  }
  const source = { kind: endpoint.href === productionUrl ? 'production-public-api' : 'custom-public-api',
    url: endpoint.href, capturedAt: captureInfo.capturedAt, configSha256: captureInfo.configSha256,
    configPath: relative(root, configPath).replaceAll('\\','/'), publisherSha, reusedImages: reused, downloadedImages: downloaded };
  return { config, configBytes, configPath, mediaRoot: captured, mediaReferences, publisher, snapshotSha: null, source };
}
