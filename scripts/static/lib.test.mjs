import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { extractGitArchive, inside } from './lib.mjs';
test('Git archive extraction retains Chinese paths and exact binary bytes on Windows', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'idv-static-'));
  const name = 'site/public/entry/北-1沙发门.webp';
  const bytes = Buffer.from([0, 255, 13, 10, 128]);
  const header = Buffer.alloc(512);
  header.write(name); header.write('0000644', 100); header.write(bytes.length.toString(8).padStart(11, '0'), 124); header.write('0', 156);
  const tar = resolve(root, 'test.tar');
  await writeFile(tar, Buffer.concat([header, bytes, Buffer.alloc(512 - bytes.length), Buffer.alloc(1024)]));
  await extractGitArchive(tar, resolve(root, 'out'));
  assert.deepEqual(await readFile(resolve(root, 'out', name)), bytes);
});
test('Archive and preview paths cannot escape the selected directory', () => {
  const root = resolve(tmpdir(), 'idv-static-root');
  assert.throws(() => inside(root, '../secrets'));
  assert.throws(() => inside(root, '.'));
  assert.equal(inside(root, 'v3/maps-v4.json'), resolve(root, 'v3/maps-v4.json'));
});
