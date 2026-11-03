import { afterEach, expect, it, vi } from 'vitest';
import { ref, effectScope } from 'vue';
import { mapsV2, mapsV2Version } from '../data/maps-v2';
import { useOfflineCache } from './useOfflineCache';
import { toPublicMapConfigV5, type MapConfigV3 } from '@idv-map/shared';
import snapshot from '../data/maps-v3.snapshot.json';
afterEach(() => { vi.unstubAllGlobals(); mapsV2.splice(0); });
it('clears current and historical completion markers without clearing another map', async () => {
  const config = toPublicMapConfigV5(snapshot as MapConfigV3, 'https://test');
  mapsV2.splice(0, mapsV2.length, ...config.layouts);
  mapsV2Version.value = config.dataVersion;
  const id = config.gameMaps[0]!.id;
  const stored = new Map([
    [`idv_map_offline_v5_${id}_${config.dataVersion}`, 'true'],
    [`idv_map_offline_v4_${id}_${config.dataVersion}`, 'true'],
    ['idv_map_offline_v5_other_1', 'true'],
  ]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key), removeItem: (key: string) => stored.delete(key),
    get length() { return stored.size; }, key: (index: number) => [...stored.keys()][index],
  });
  vi.stubGlobal('caches', { open: async () => ({ delete: async () => true }) });
  const scope = effectScope();
  try {
    const state = scope.run(() => useOfflineCache(ref(id)))!;
    expect(state.phase.value).toBe('done');
    await state.clear();
    expect(state.phase.value).toBe('idle');
    expect([...stored.keys()]).toEqual(['idv_map_offline_v5_other_1']);
    expect(scope.run(() => useOfflineCache(ref(id)))!.phase.value).toBe('idle');
  } finally { scope.stop(); }
});
it('does not mark a mixed-version offline package complete when content changes during download', async () => {
  const config = toPublicMapConfigV5(snapshot as MapConfigV3, 'https://test');
  mapsV2.splice(0, mapsV2.length, ...config.layouts);
  mapsV2Version.value = config.dataVersion;
  const open = vi.fn();
  const setItem = vi.fn();
  vi.stubGlobal('caches', { open });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem });
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ...config, dataVersion: config.dataVersion + 1 })));
  vi.stubGlobal('fetch', fetch);
  const scope = effectScope();
  try {
    const state = scope.run(() => useOfflineCache(ref(config.gameMaps[0]!.id)))!;
    await state.warm();
    expect(state.phase.value).toBe('error');
    expect(state.error.value).toContain('刷新');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  } finally { scope.stop(); }
});
