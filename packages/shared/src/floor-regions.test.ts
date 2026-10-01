import { describe, expect, it } from 'vitest';
import { assetKeys, migrateV2ToV3, toPublicMapConfigV4, validateMapConfigV3, type MapConfigV2, type PixelRect } from './index';
import snapshot from '../../../apps/web/src/data/maps-v2.snapshot.json';
function fixture() {
  const config = migrateV2ToV3(structuredClone(snapshot) as MapConfigV2);
  const layout = config.layouts.find(l => l.mode === 'hard' && l.published)!;
  const oldKey = layout.floorImages.floor1!.key;
  delete layout.floorImages.floor1;
  layout.floorRegions = { sourceKey: layout.floorImages.full!.key, imageWidth: 1000, imageHeight: 1600, regions: { floor1: { x: 20, y: 50, width: 960, height: 700 } } };
  return { config, layout, oldKey };
}
describe('floor regions', () => {
  it('publishes mixed legacy/region floors and never exposes storage keys', () => {
    const { config, layout, oldKey } = fixture();
    expect(validateMapConfigV3(config)).toEqual({ valid: true, errors: [] });
    const publicConfig = toPublicMapConfigV4(config, 'https://media.test');
    expect(publicConfig.schemaVersion).toBe(4);
    const item = publicConfig.layouts.find(l => l.id === layout.id)!;
    expect(item.floorRegions?.sourceUrl).toBe(item.floorImages.full?.url);
    expect(item.floorImages.floor1).toBeUndefined();
    expect(item.floorImages.floor2).toBeDefined();
    expect(JSON.stringify(publicConfig)).not.toContain('sourceKey');
    expect(assetKeys(config)).not.toContain(oldKey);
  });
  it.each([
    { x: -1, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 10 },
    { x: 0.5, y: 0, width: 10, height: 10 }, { x: 999, y: 0, width: 2, height: 10 },
    { x: 0, y: 1599, width: 10, height: 2 }, { x: 0, y: 0, width: NaN, height: 10 },
    null,
  ])('rejects malformed or out-of-bounds rectangle %j', rect => {
    const { config, layout } = fixture();
    layout.floorRegions!.regions.floor1 = rect as PixelRect;
    expect(validateMapConfigV3(config).valid).toBe(false);
  });
  it('rejects stale source, duplicate floor and invalid dimensions even in drafts', () => {
    for (const change of [
      (l: ReturnType<typeof fixture>['layout']) => { l.floorRegions!.sourceKey = 'maps/layout/full/other.webp'; },
      (l: ReturnType<typeof fixture>['layout']) => { l.floorImages.floor1 = { key: 'maps/layout/floor1/old.webp' }; },
      (l: ReturnType<typeof fixture>['layout']) => { l.floorRegions!.imageWidth = 0; },
    ]) { const { config, layout } = fixture(); layout.published = false; change(layout); expect(validateMapConfigV3(config).valid).toBe(false); }
  });
  it('checks missing required floors and excludes basement from hard mode', () => {
    const { config, layout } = fixture();
    delete layout.floorImages.floor2;
    expect(validateMapConfigV3(config).errors.join()).toContain('二楼');
    layout.published = false;
    expect(validateMapConfigV3(config).valid).toBe(true);
    layout.published = true;
    layout.floorRegions!.regions.basement = { x: 0, y: 0, width: 100, height: 100 };
    expect(validateMapConfigV3(config).errors.join()).toContain('地下室');
  });
});
