import { afterEach, expect, it, vi } from 'vitest';
import { toPublicMapConfigV4, type MapConfigV3 } from '@idv-map/shared';
import snapshot from './maps-v3.snapshot.json';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(['https://first.example', 'https://second.example'])('loads Docker relative media through the real client boundary at %s', async origin => {
  vi.resetModules();
  vi.stubEnv('VITE_MAP_API_BASE_URL', '');
  vi.stubGlobal('window', { location: { href: origin + '/#/maps' } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(toPublicMapConfigV4(snapshot as MapConfigV3, '/r2')))));
  const client = await import('./maps-v2');
  expect(await client.ensureMapsV2()).toBe(true);
  expect(client.mapsV2Error.value).toBe('');
  expect(client.mapsV2.length).toBeGreaterThan(0);
  expect(client.mapsV2[0].floorImages.full!.url).toMatch(new RegExp('^' + origin + '/r2/'));
});
