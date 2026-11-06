import { expect, it, vi } from 'vitest';
import { CloudflareContent, CONFIG_V4_KEY } from './cloudflare';
import worker from './index';
import snapshot from '../apps/web/src/data/maps-v3.snapshot.json';
import type { Env } from './types';
it('reads legacy content without writes, archives the raw baseline and reads both backup prefixes', async () => {
  const raw = JSON.stringify(snapshot), kv = new Map([['config:v3:current', raw]]), objects = new Map<string, string>();
  objects.set('backups-v3/snapshot-v1.json', raw);
  const put = vi.fn(async (key: string, value: string) => {
    kv.set(key, value);
  });
  const env = {
    CONFIG: {
      get: async (key: string, kind?: string) => {
        const s = kv.get(key);
        return s && kind === 'json' ? JSON.parse(s) : s ?? null;
      }, put
    }, MEDIA: {
      head: async (key: string) => objects.has(key) ? {} : null,
      put: async (key: string, value: string) => {
        objects.set(key, value);
      },
      get: async (key: string) => objects.has(key) ? { json: async () => JSON.parse(objects.get(key)!) } : null,
      list: async ({ prefix }: {
        prefix: string;
      }) => ({ objects: [...objects.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key, uploaded: new Date('2026-11-05') })), truncated: false }),
    }
  } as unknown as Env;
  const repo = new CloudflareContent(env), c = await repo.read();
  expect(c.schemaVersion).toBe(4);
  expect(put).not.toHaveBeenCalled();
  expect(kv.has(CONFIG_V4_KEY)).toBe(false);
  await repo.backup(c);
  await repo.save({ ...c, version: c.version + 1 }, c.version);
  expect(objects.get('backups-v4/v3-baseline.json')).toBe(raw);
  expect(kv.get('config:v3:current')).toBe(raw);
  expect((await repo.backups()).map(b => b.key)).toEqual(expect.arrayContaining(['backups-v3/snapshot-v1.json', 'backups-v4/v3-baseline.json']));
  expect((await repo.readBackup('backups-v3/snapshot-v1.json'))?.schemaVersion).toBe(4);
  await expect(repo.readBackup('backups-v4/../private.json')).rejects.toMatchObject({ status: 400 });
  const response = await worker.fetch(new Request('https://test.example/api/admin/v3/maps', { method: 'PUT' }), { ...env, DEV_DISABLE_AUTH: '1' });
  expect(response.status).toBe(409);
  expect((await response.json() as any).error).toBe('admin_upgrade_required');
});
