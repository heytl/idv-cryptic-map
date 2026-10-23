import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

test('server authentication, SQLite migrations, media, backups, conflicts and restart persistence', async () => {
  const data = mkdtempSync(join(tmpdir(), 'idv-docker-'));
  const base = 'http://localhost:18767';
  const auth = { Authorization: `Basic ${Buffer.from('admin:integration-test-password').toString('base64')}` };
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['deploy/server.mjs'], { env: { ...process.env, DATA_DIR: data, PORT: '18767', ADMIN_PASSWORD: 'integration-test-password' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited before startup'); })]);
  };
  const stop = async () => { child.kill(); await once(child, 'exit'); };
  const call = async (path, options = {}) => {
    if (!options.headers?.Host) return fetch(base + path, { ...options, headers: { ...auth, ...options.headers } });
    // fetch reserves Host; use HTTP directly to emulate a proxy preserving it.
    const prepared = new Request(base + path, { ...options, headers: { ...auth, ...options.headers } });
    const body = options.body ? Buffer.from(await prepared.arrayBuffer()) : undefined;
    return new Promise((resolve, reject) => {
      const req = httpRequest(base + path, { method: prepared.method, headers: Object.fromEntries(prepared.headers) }, res => {
        const chunks = []; res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
      });
      req.on('error', reject); req.end(body);
    });
  };
  try {
    await start();
    assert.equal((await fetch(base + '/api/admin/v3/maps')).status, 401);
    assert.equal((await fetch(base + '/admin/')).status, 401);
    assert.equal((await call('/healthz')).status, 200);
    assert.equal((await call('/api/admin/stats')).status, 200);
    const config = await (await call('/api/admin/v3/maps')).json();
    const save = () => call('/api/admin/v3/maps', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, baseVersion: 0 }) });
    assert.equal((await save()).status, 200);
    assert.equal((await save()).status, 409);
    assert.equal((await (await call('/api/admin/v3/backups')).json()).backups.length, 1);
    const form = new FormData(); form.set('kind', 'full'); form.set('file', new Blob(['RIFF0000WEBPtest'], { type: 'image/webp' }), 'test.webp');
    const uploaded = await call('/api/admin/v3/images', { method: 'POST', body: form });
    assert.equal(uploaded.status, 200);
    const { asset, url } = await uploaded.json();
    assert.equal(url, '/r2/' + asset.key);
    for (const domain of ['first.example', 'second.example']) {
      const headers = { Host: domain, Origin: `https://${domain}` };
      const form = new FormData(); form.set('kind', 'full'); form.set('file', new Blob(['RIFF0000WEBPtest']), 'test.webp');
      const r = await call('/api/admin/v3/images', { method: 'POST', headers, body: form });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).url, '/r2/' + asset.key);
      assert.equal((await call('/telemetry/events', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
      assert.equal((await call('/telemetry/events', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
      const publicResponse = await call('/maps-v4.json', { headers });
      assert.match(publicResponse.headers.get('ETag'), /-relative/);
    }
    assert.equal((await fetch(base + '/r2/' + asset.key)).status, 200);
    assert.equal((await fetch(base + '/r2/backups-v3/snapshot-v0.json')).status, 404);
    assert.equal((await call('/api/admin/v3/maps', { method: 'PUT', headers: { Origin: 'https://evil.example' } })).status, 403);
    await stop(); await start();
    assert.equal((await (await call('/api/admin/v3/maps')).json()).version, 1);
    assert.equal((await fetch(base + '/r2/' + asset.key)).status, 200);
    assert.equal((await call('/api/admin/stats/export')).status, 200);
  } finally { if (child && child.exitCode === null) await stop(); rmSync(data, { recursive: true, force: true }); }
});
