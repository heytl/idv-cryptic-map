import { createHash } from 'node:crypto';
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = async path => JSON.parse(await readFile(path, 'utf8'));
export async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    const path = [prefix, entry.name].filter(Boolean).join('/');
    if (entry.isSymbolicLink()) throw Error(`Unexpected symlink: ${path}`);
    if (entry.isDirectory()) result.push(...await files(root, path));
    else result.push(path);
  }
  return result.sort();
}
export function inside(root, path) {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith('..' + sep) || resolve(target) === resolve(root)) throw Error(`Invalid file path: ${path}`);
  return target;
}
export async function write(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}
// Decode Git's UTF-8 tar names ourselves: Windows' system tar can corrupt Chinese filenames.
export async function extractGitArchive(tarPath, destination) {
  const tar = await readFile(tarPath);
  let pax = {};
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const field = (start, end) => header.subarray(start, end).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(field(124, 136).trim(), 8) || 0;
    const type = field(156, 157);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    if (type === 'x' || type === 'g') {
      for (let pos = 0; pos < body.length;) {
        const space = body.indexOf(32, pos), length = Number(body.subarray(pos, space).toString());
        if (!length || pos + length > body.length) throw Error('Invalid Git tar metadata');
        const record = body.subarray(space + 1, pos + length - 1).toString('utf8');
        const equal = record.indexOf('=');
        if (type === 'x') pax[record.slice(0, equal)] = record.slice(equal + 1);
        pos += length;
      }
    } else {
      const name = pax.path || [field(345, 500), field(0, 100)].filter(Boolean).join('/');
      if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw Error('Invalid Git archive path');
      if (type === '5') await mkdir(inside(destination, name), { recursive: true });
      else if (type === '0' || type === '') await write(inside(destination, name), body);
      else throw Error(`Unsupported Git archive entry type: ${type}`);
      pax = {};
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
}
export async function inventory(root) {
  return Promise.all((await files(root)).map(async path => {
    const bytes = await readFile(resolve(root, path));
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  }));
}
export function mediaReferences(config) {
  const refs = [];
  for (const layout of config.layouts) {
    for (const asset of Object.values(layout.floorImages)) refs.push([asset, 'url']);
    if (layout.floorRegions) refs.push([layout.floorRegions, 'sourceUrl']);
    for (const entrance of layout.entrances) refs.push([entrance, 'imageUrl'], [entrance, 'thumbUrl']);
  }
  if (refs.some(([item, key]) => typeof item[key] !== 'string' || !item[key])) throw Error('Missing map image URL');
  return refs;
}
export async function verifyRelease(root) {
  const release = await json(resolve(root, 'release.json'));
  const expected = await json(resolve(root, 'integrity.json'));
  const actual = await inventory(root);
  const own = actual.filter(x => !['release.json', 'integrity.json'].includes(x.path) && !/^(?:v[1-9]\d*(?:\.\d+){0,2}|versions)\//.test(x.path));
  if (JSON.stringify(own) !== JSON.stringify(expected)) throw Error(`File integrity mismatch: ${root}`);
  if (release.integritySha256 !== sha256(await readFile(resolve(root, 'integrity.json')))) throw Error('Inventory hash mismatch');
  const config = await json(resolve(root, 'maps-v4.json'));
  if (config.layouts.length !== release.layouts || config.gameMaps.length !== release.gameMaps || config.dataVersion !== release.dataVersion) throw Error('Config counts/version mismatch');
  const paths = new Set(expected.map(x => x.path));
  for (const [item, key] of mediaReferences(config)) {
    const url = item[key];
    if (!url.startsWith(release.base + 'media/') || !paths.has(url.slice(release.base.length))) throw Error(`Map escapes snapshot: ${url}`);
  }
  for (const path of ['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']) if (!(await stat(resolve(root, path))).size) throw Error(`Missing UI: ${path}`);
  return release;
}
