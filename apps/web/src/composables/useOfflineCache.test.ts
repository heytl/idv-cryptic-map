import { afterEach, expect, it, vi } from 'vitest';
import { ref, effectScope } from 'vue';
import { mapsV2, mapsV2Version } from '../data/maps-v2';
import { useOfflineCache } from './useOfflineCache';
import { toPublicMapConfigV4, type MapConfigV3 } from '@idv-map/shared';
import snapshot from '../data/maps-v3.snapshot.json';
afterEach(() => { vi.unstubAllGlobals(); mapsV2.splice(0); });
it('does not mark a mixed-version offline package complete when content changes during download', async () => {
  const config = toPublicMapConfigV4(snapshot as MapConfigV3, 'https://test');
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
