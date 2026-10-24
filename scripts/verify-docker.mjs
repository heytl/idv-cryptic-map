// Run against the actual image on each native CI architecture. No registry credentials needed.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const image = process.argv[2] || 'idv-map:test';
const name = `idv-verify-${randomBytes(6).toString('hex')}`;
const volume = `${name}-data`;
const key = randomBytes(32).toString('hex');
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 }).trim();
let base;
async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch {}
    await delay(1000);
  }
  throw new Error('Container did not become ready');
}
try {
  docker('volume', 'create', volume);
  docker('run', '-d', '--name', name, '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true', '--mount', `type=volume,src=${volume},dst=/data`,
    '-p', '127.0.0.1::8080', '-e', `ADMIN_KEY=${key}`, image);
  const port = JSON.parse(docker('inspect', name))[0].NetworkSettings.Ports['8080/tcp'][0].HostPort;
  base = `http://127.0.0.1:${port}`;
  await ready();
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/maps-v4.json`)).status, 200);
  assert.equal((await fetch(`${base}/api/admin/v3/maps`)).status, 401);
  assert.equal((await fetch(`${base}/admin/`, { redirect: 'manual' })).status, 303);
  assert.equal((await fetch(`${base}/admin/login`)).status, 200);
  for (const path of ['/api/admin/v3/maps', '/api/admin/stats']) {
    assert.equal((await fetch(base + path, { headers: { Authorization: `Bearer ${key}` } })).status, 200);
  }
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { Origin: base }, redirect: 'manual',
    body: new URLSearchParams({ username: 'admin', password: key, remember: 'on' }),
  });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  const headers = { Cookie: cookie.split(';')[0] };
  assert.equal((await fetch(`${base}/api/admin/v3/maps`, { headers })).status, 200);
  // Sessions are stored in SQLite: this proves the database survives container replacement.
  docker('rm', '-f', name);
  docker('run', '-d', '--name', name, '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true', '--mount', `type=volume,src=${volume},dst=/data`,
    '-p', `127.0.0.1:${port}:8080`, '-e', `ADMIN_KEY=${key}`, image);
  await ready();
  assert.equal((await fetch(`${base}/auth/session`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/auth/logout`, { method: 'POST', headers: { ...headers, Origin: base } })).status, 200);
  assert.equal((await fetch(`${base}/auth/session`, { headers })).status, 401);
  console.log('Docker health, Bearer authentication, form login and SQLite persistence passed');
} catch (error) {
  try { console.error(docker('logs', name)); } catch {}
  throw error;
} finally {
  try { docker('rm', '-f', name); } catch {}
  try { docker('volume', 'rm', volume); } catch {}
}
