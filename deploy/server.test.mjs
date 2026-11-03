import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

test('server authentication, SQLite migrations, media, backups, conflicts and restart persistence', async () => {
  const data = mkdtempSync(join(tmpdir(), 'idv-docker-'));
  const base = 'http://localhost:18767';
  const key = 'integration-test-random-key-with-32-characters';
  const auth = { Authorization: `Bearer ${key}` };
  let child;
  const start = async (loginKey = key) => {
    child = spawn(process.execPath, ['deploy/server.mjs'], { env: { ...process.env, DATA_DIR: data, PORT: '18767', ADMIN_KEY: loginKey }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    assert.equal((await fetch(base + '/admin/', { redirect: 'manual' })).status, 303);
    assert.match(await (await fetch(base + '/admin/')).text(), /登录工作台/);
    const login = body => fetch(base + '/auth/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await login({ key: 'wrong' })).status, 401);
    assert.equal((await fetch(base + '/api/admin/stats')).headers.get('WWW-Authenticate'), null);
    assert.equal((await fetch(base + '/auth/login', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })).status, 403);
    const signedIn = await login({ key });
    assert.equal(signedIn.status, 200);
    const setCookie = signedIn.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
    const Cookie = setCookie.split(';')[0];
    const formLogin = (password, remember = false) => fetch(base + '/auth/login', { method: 'POST', redirect: 'manual', headers: { Origin: base }, body: new URLSearchParams({ username: 'admin', password, ...(remember ? { remember: 'on' } : {}) }) });
    const rejectedForm = await formLogin('incorrect', true);
    assert.equal(rejectedForm.status, 401);
    const rejectedHtml = await rejectedForm.text();
    assert.match(rejectedHtml, /密钥不正确/);
    assert.doesNotMatch(rejectedHtml, /value="incorrect"/);
    assert.match(rejectedHtml, /type="checkbox" checked/);
    const ordinaryForm = await formLogin(key);
    assert.equal(ordinaryForm.status, 303); assert.equal(ordinaryForm.headers.get('location'), '/admin/');
    assert.match(ordinaryForm.headers.get('set-cookie'), /Max-Age=28800/);
    const rememberedForm = await formLogin(key, true);
    assert.equal(rememberedForm.status, 303);
    assert.match(rememberedForm.headers.get('set-cookie'), /Max-Age=2592000/);
    const RememberCookie = rememberedForm.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + '/api/admin/stats', { headers: { Authorization: 'Basic '+Buffer.from('admin:'+key).toString('base64') } })).status, 401);
    assert.equal((await fetch(base + '/api/admin/stats', { headers: { Cookie } })).status, 200);
    assert.equal((await fetch(base + '/api/admin/v3/maps', { method: 'PUT', headers: { Cookie, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await call('/healthz')).status, 200);
    const httpsLogin = await call('/auth/login', { method: 'POST', headers: { Host: 'maps.example', Origin: 'https://maps.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    assert.equal(httpsLogin.status, 200);
    assert.match(httpsLogin.headers.get('set-cookie'), /; Secure/);
    assert.match(httpsLogin.headers.get('set-cookie'), /Max-Age=28800/);
    assert.equal(httpsLogin.headers.get('set-cookie').includes(key), false);
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
      const modernResponse = await call('/maps-v5.json', { headers });
      assert.equal((await modernResponse.json()).schemaVersion, 5);
      assert.match(modernResponse.headers.get('ETag'), /maps-v5-.*-relative/);
    }
    assert.equal((await fetch(base + '/r2/' + asset.key)).status, 200);
    assert.equal((await fetch(base + '/r2/backups-v3/snapshot-v0.json')).status, 404);
    assert.equal((await call('/api/admin/v3/maps', { method: 'PUT', headers: { Origin: 'https://evil.example' } })).status, 403);
    await stop(); await start();
    assert.equal((await fetch(base + '/auth/session', { headers: { Cookie: RememberCookie } })).status, 200);
    assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers: { Cookie: RememberCookie, Origin: base } })).status, 200);
    assert.equal((await fetch(base + '/auth/session', { headers: { Cookie: RememberCookie } })).status, 401);
    assert.equal((await fetch(base + '/auth/session', { headers: { Cookie } })).status, 200);
    assert.equal((await (await call('/api/admin/v3/maps')).json()).version, 1);
    assert.equal((await fetch(base + '/r2/' + asset.key)).status, 200);
    assert.equal((await call('/api/admin/stats/export')).status, 200);
    assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers: { Cookie, Origin: base } })).status, 200);
    assert.equal((await fetch(base + '/auth/session', { headers: { Cookie } })).status, 401);
    const expiredLogin = await login({ key });
    const expiredCookie = expiredLogin.headers.get('set-cookie').split(';')[0];
    const db = new DatabaseSync(join(data, 'app.sqlite'));
    const row = db.prepare('SELECT token_hash FROM admin_sessions').get();
    assert.ok(row); assert.notEqual(row.token_hash, expiredCookie.split('=')[1]);
    db.exec('UPDATE admin_sessions SET expires=0'); db.close();
    assert.equal((await fetch(base + '/auth/session', { headers: { Cookie: expiredCookie } })).status, 401);
    const beforeRotation = await login({ key });
    const rotationCookie = beforeRotation.headers.get('set-cookie').split(';')[0];
    const rotationRemember = (await formLogin(key, true)).headers.get('set-cookie').split(';')[0];
    await stop(); await start('a-different-key-that-is-longer-than-32-characters');
    assert.equal((await fetch(base + '/auth/session', { headers: { Cookie: rotationCookie } })).status, 401);
    assert.equal((await fetch(base + '/auth/session', { headers: { Cookie: rotationRemember } })).status, 401);
    await stop(); await start();
    for (let i = 0; i < 10; i++) assert.equal((await login({ key: 'wrong' })).status, 401);
    const limited = await login({ key });
    assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  } finally { if (child && child.exitCode === null) await stop(); rmSync(data, { recursive: true, force: true }); }
});

test('upgrade a populated V4 SQLite database without changing content until an explicit V5 save', async () => {
  const data = mkdtempSync(join(tmpdir(), 'idv-upgrade-'));
  const base = 'http://localhost:18768';
  const key = randomBytes(32).toString('hex');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const legacy = JSON.parse(readFileSync('apps/web/src/data/maps-v3.snapshot.json', 'utf8'));
  const baseline = JSON.stringify(legacy);
  const media = readFileSync('scripts/fixtures/layout.webp');
  const keys = new Set();
  const collect = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.key === 'string') keys.add(value.key);
    Object.values(value).forEach(collect);
  };
  collect(legacy);
  const seed = new DatabaseSync(join(data, 'app.sqlite'));
  seed.exec('CREATE TABLE kv (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE objects (key TEXT PRIMARY KEY,bytes BLOB NOT NULL,metadata TEXT NOT NULL,uploaded TEXT NOT NULL); CREATE TABLE migrations (name TEXT PRIMARY KEY)');
  for (const name of ['0001_statistics.sql', '0002_visit_client.sql']) {
    seed.exec(readFileSync(`workers/migrations/${name}`, 'utf8'));
    seed.prepare('INSERT INTO migrations VALUES (?)').run(name);
  }
  seed.prepare('INSERT INTO kv VALUES (?,?)').run('config:v3:current', baseline);
  for (const asset of keys) seed.prepare('INSERT INTO objects VALUES (?,?,?,?)').run(asset, media, '{"contentType":"image/webp"}', legacy.updatedAt);
  seed.prepare('INSERT INTO visits VALUES (?,?,?,?,?,?,?,?,?)').run('upgrade-baseline', 1, '1-side', 'side', legacy.gameMaps[0].id, 'hard', legacy.updatedAt, legacy.updatedAt.slice(0, 10), 'web');
  seed.close();
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['deploy/server.mjs'], { env: { ...process.env, DATA_DIR: data, PORT: '18768', ADMIN_KEY: key }, stdio: ['ignore', 'pipe', 'pipe'] });
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Upgrade server exited before startup'); })]);
  };
  const stop = async () => { child.kill(); await once(child, 'exit'); };
  const get = async path => {
    const response = await fetch(base + path, { headers });
    assert.equal(response.status, 200, path);
    return response.json();
  };
  try {
    await start();
    const v4 = await get('/maps-v4.json');
    const v5 = await get('/maps-v5.json');
    assert.equal(v4.schemaVersion, 4);
    assert.equal(v5.schemaVersion, 5);
    assert.equal(v5.dataVersion, legacy.version);
    assert.deepEqual(v5.layouts.map(l => l.id), v4.layouts.map(l => l.id));
    assert.ok(v5.layouts.length > 0);
    const config = await get('/api/admin/v3/maps');
    assert.equal(config.entranceRulesVersion, 2);
    assert.deepEqual(config.layouts, legacy.layouts);
    const disk = new DatabaseSync(join(data, 'app.sqlite'), { readOnly: true });
    try {
      assert.equal(disk.prepare('SELECT value FROM kv WHERE key=?').get('config:v3:current').value, baseline);
      assert.equal(disk.prepare('SELECT count(*) AS n FROM migrations').get().n, 2);
    } finally { disk.close(); }
    const stale = await fetch(base + '/api/admin/v3/maps', { method: 'PUT', headers, body: JSON.stringify({ config: legacy, baseVersion: legacy.version }) });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error, 'admin_upgrade_required');
    assert.equal((await get('/api/admin/v3/maps')).version, legacy.version);
    config.gameMaps[0].modeVisibility.hard = false;
    const saved = await fetch(base + '/api/admin/v3/maps', { method: 'PUT', headers, body: JSON.stringify({ config, baseVersion: legacy.version }) });
    assert.equal(saved.status, 200, await saved.text());
    await stop();
    await start();
    const persisted = await get('/api/admin/v3/maps');
    assert.equal(persisted.version, legacy.version + 1);
    assert.equal(persisted.gameMaps[0].modeVisibility.hard, false);
    assert.deepEqual(persisted.layouts, legacy.layouts);
    for (const endpoint of ['/maps-v4.json', '/maps-v5.json']) {
      const visible = await get(endpoint);
      assert.ok(visible.layouts.length > 0);
      assert.ok(visible.layouts.every(l => l.mode !== 'hard'));
    }
    assert.ok((await get('/api/admin/v3/backups')).backups.some(b => b.key === `backups-v3/snapshot-v${legacy.version}.json`));
    assert.equal((await fetch(base + '/r2/' + [...keys][0])).status, 200);
    const diskAfter = new DatabaseSync(join(data, 'app.sqlite'), { readOnly: true });
    try { assert.equal(diskAfter.prepare('SELECT count(*) AS n FROM visits WHERE event_id=?').get('upgrade-baseline').n, 1); }
    finally { diskAfter.close(); }
  } finally {
    if (child && child.exitCode === null) await stop();
    rmSync(data, { recursive: true, force: true });
  }
});
