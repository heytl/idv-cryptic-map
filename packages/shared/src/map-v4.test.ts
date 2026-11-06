import { describe, expect, it } from 'vitest';
import { fixtureV4 } from '../test/fixtures';
import { migrateV3ToV4, normalizeMapConfigV4, validateMapConfigV4, toPublicMapConfigV6, isPublicMapConfigV6, projectLegacyConfig, hydrateConfigV6, availableFloors, resolveFloorSource, entranceFilterFor } from './map-v4';
import { isPublicMapConfigV4, isPublicMapConfigV5, resolvePublicMediaUrls } from './map-client';
import { isContentAssetKey, isContentAssetForRole, CONTENT_IMAGE_URL_PATTERN } from './media-paths.mjs';
import { toPublicMapConfigV5, type MapConfigV3 } from './map-v3';
import snapshot from '../../../apps/web/src/data/maps-v3.snapshot.json';
describe('dynamic map boundary', () => {
  it('preserves legacy numeric IDs and entrance instance IDs without applying route-ID constraints', () => {
    const legacy=structuredClone(snapshot) as MapConfigV3;
    legacy.layouts[0].id=0;
    legacy.layouts[0].entrances[0].id='historical:entry/one';
    const c=migrateV3ToV4(legacy);
    expect(validateMapConfigV4(c).valid).toBe(true);
    expect(c.layouts[0].entrances[0].id).toBe('historical:entry/one');
    expect(isPublicMapConfigV6(toPublicMapConfigV6(c,'https://media.test'))).toBe(true);
  });
  it('migrates without changing the source, identities, media or legacy public content', () => {
    const original = structuredClone(snapshot), c = migrateV3ToV4(original as MapConfigV3);
    expect(original).toEqual(snapshot);
    expect(c.layouts.map(l => l.id)).toEqual(snapshot.layouts.map(l => l.id));
    expect(c.layouts.map(l => l.floorImages)).toEqual(snapshot.layouts.map(l => l.floorImages));
    expect(c.layouts.every(l => l.modeLocked)).toBe(true);
    expect(validateMapConfigV4(c)).toEqual({ valid: true, errors: [] });
    expect(normalizeMapConfigV4(c)).toEqual(c);
    const legacy = projectLegacyConfig(c, 'https://media.test', 5);
    expect(isPublicMapConfigV5(legacy)).toBe(true);
    expect(legacy.layouts).toEqual(toPublicMapConfigV5(snapshot as MapConfigV3, 'https://media.test').layouts);
    expect(isPublicMapConfigV4(projectLegacyConfig(c, 'https://media.test', 4))).toBe(true);
  });
  it('supports arbitrary difficulties, four basement floors, custom entries and partial sources', () => {
    const c = fixtureV4();
    c.difficulties.push({ id: 'abyss', name: '深渊', sort: 30 });
    c.entranceTypes.push({ id: 'shaft', name: '竖井', sort: 40 });
    const m = c.gameMaps[0];
    m.difficulties.push({
      difficultyId: 'abyss', sort: 30, visible: true, floors: [1, 2, 3, 4].map(i => ({ id: `b${i}`, name: `负${i}楼`, sort: i, visible: true })), entranceRules: { allowed: ['shaft'], enabled: ['shaft'] }, entranceFilters: { shaft: { filterLabel: '入口颜色', filterOptions: [{ id: 'blue', name: '蓝色', sort: 10 }] } }
    });
    const l = structuredClone(c.layouts[0]);
    Object.assign(l, {
      id: 9000, mode: 'abyss', modeLocked: false, published: true, floorImages: { full: l.floorImages.full }, entrances: [{ id: 'entry-shaft', type: 'shaft', filterValue: 'blue', image: l.entrances[0].image }]
    });
    l.floorRegions = {
      sourceKey: l.floorImages.full!.key, imageWidth: 100, imageHeight: 100, regions: { b2: { x: 0, y: 0, width: 50, height: 50 } }
    };
    c.layouts.push(l);
    expect(validateMapConfigV4(c).valid).toBe(true);
    const raw = toPublicMapConfigV6(c, '/r2');
    const resolved = resolvePublicMediaUrls(raw, 'https://map.test/maps-v6.json');
    expect(isPublicMapConfigV6(resolved)).toBe(true);
    const client = hydrateConfigV6(resolved as typeof raw), item = client.layouts.find(i => i.id === 9000)!;
    expect(availableFloors(item)).toEqual(['full', 'b2']);
    expect(resolveFloorSource(item, 'b2')?.url).toBe(item.floorImages.full!.url);
    expect(item.entrances[0].filterLabel).toBe('蓝色');
    expect(projectLegacyConfig(c, 'https://media.test', 5).layouts.some(i => i.id === 9000)).toBe(false);
  });
  it('projects current classification values and honors V4 entrance restrictions', () => {
    const c = fixtureV4(), l = c.layouts.find(l => l.mode === 'nightmare' && l.published)!;
    l.entrances.find(e => e.type === 'front')!.filterValue = 'triple';
    const old = projectLegacyConfig(c, 'https://media.test', 5).layouts.find(i => i.id === l.id)!;
    expect(old.entrances.find(e => e.type === 'front')).toMatchObject({ direction: 'south', passage: 'triple' });
    delete l.entrances.find(e => e.type === 'front')!.filterValue;
    expect(projectLegacyConfig(c, 'https://media.test', 5).layouts.find(i => i.id === l.id)!.entrances.find(e => e.type === 'front')!.passage).toBeUndefined();
    c.gameMaps[0].difficulties.find(d => d.difficultyId === 'hard')!.floors.push({ id: 'b4', name: '负四楼', sort: 100, visible: true });
    const hard = c.layouts.find(l => l.mode === 'hard' && l.published)!;
    expect(projectLegacyConfig(c, 'https://media.test', 5).layouts.some(i => i.id === hard.id)).toBe(true);
    hard.floorImages.b4 = hard.floorImages.full;
    expect(projectLegacyConfig(c, 'https://media.test', 5).layouts.some(i => i.id === hard.id)).toBe(false);
  });
  it('rejects dangling floor references, mismatched regions and unsafe media keys', () => {
    const c = fixtureV4();
    c.layouts[0].floorImages.unknown = c.layouts[0].floorImages.full;
    expect(validateMapConfigV4(c).valid).toBe(false);
    expect(isContentAssetKey(`maps/layout/floor/${'a'.repeat(64)}.webp`)).toBe(true);
    expect(isContentAssetForRole('maps/entrance/test.webp','floor')).toBe(false);
    expect(CONTENT_IMAGE_URL_PATTERN.test(`https://media.test/maps/layout/floor/${'a'.repeat(64)}.webp`)).toBe(true);
    for (const key of ['maps/layout/floor/short.webp', 'maps/layout/floor/../x.webp', 'maps/private/x.webp', 'maps/full/%2e%2e.webp'])
      expect(isContentAssetKey(key)).toBe(false);
    const raw = toPublicMapConfigV6(fixtureV4(), 'https://media.test');
    raw.layouts[0].entrances[0].filterValue = 'unknown';
    expect(isPublicMapConfigV6(raw)).toBe(false);
  });
  it('does not expose unused dictionaries or accept source-less draft regions', () => {
    const c=fixtureV4();c.difficulties.push({id:'future',name:'未公开',sort:100});
    expect(toPublicMapConfigV6(c,'https://media.test').dictionaries.modes.some(d=>d.id==='future')).toBe(false);
    const l=c.layouts[0];l.published=false;delete l.floorImages.full;
    l.floorRegions={sourceKey:undefined as any,imageWidth:100,imageHeight:100,regions:{floor1:{x:0,y:0,width:50,height:50}}};
    expect(validateMapConfigV4(c).valid).toBe(false);
  });
  it('accepts unused deletion records but removes them from public classification choices', () => {
    const c = fixtureV4(), deletedAt = '2026-11-05T12:00:00.000Z';
    c.difficulties.push({ id: 'unused', name: '未使用难度', sort: 100, archived: true, deletedAt });
    c.entranceTypes.push({ id: 'unused', name: '未使用入口', sort: 100, deletedAt });
    c.gameMaps[0].difficulties[0].entranceFilters!.side.filterOptions.push({ id: 'unused', name: '未使用分类', sort: 100, deletedAt });
    c.gameMaps[0].difficulties[0].floors.push({ id: 'unused', name: '未使用楼层', sort: 100, visible: false, deletedAt });
    expect(validateMapConfigV4(c)).toEqual({ valid: true, errors: [] });
    const publicConfig = toPublicMapConfigV6(c, 'https://media.test');
    expect(isPublicMapConfigV6(publicConfig)).toBe(true);
    expect(JSON.stringify(publicConfig)).not.toContain('unused');
  });
  it('blocks deletion of referenced definitions, including drafts, retired instances and cropped floors', () => {
    const deletedAt = '2026-11-05T12:00:00.000Z';
    const mode = fixtureV4();
    mode.difficulties[0].deletedAt = deletedAt;
    expect(validateMapConfigV4(mode).errors.join()).toContain('难度');
    const entry = fixtureV4();
    entry.entranceTypes[0].deletedAt = deletedAt;
    expect(validateMapConfigV4(entry).errors.join()).toContain('入口');
    const option = fixtureV4(), l = option.layouts[0], e = l.entrances[0];
    const def = entranceFilterFor(option.gameMaps.find(m => m.id === l.gameMapId), l.mode, e.type)!;
    e.filterValue = def.filterOptions[0].id;
    e.deletedAt = deletedAt;
    l.deletedAt = deletedAt;
    def.filterOptions[0].deletedAt = deletedAt;
    expect(validateMapConfigV4(option).errors.join()).toContain('分类');
    for (const source of ['image', 'region']) {
      const c = fixtureV4(), l = c.layouts[0];
      const d = c.gameMaps.find(m => m.id === l.gameMapId)!.difficulties.find(d => d.difficultyId === l.mode)!;
      d.floors.push({ id: 'cropped', name: '自定义楼层', sort: 100, visible: false, deletedAt });
      l.published = false;
      if (source === 'image') l.floorImages.cropped = { key: `maps/layout/floor/${'a'.repeat(64)}.webp` };
      else l.floorRegions = { sourceKey: l.floorImages.full!.key, imageWidth: 100, imageHeight: 100, regions: { cropped: { x: 0, y: 0, width: 50, height: 50 } } };
      expect(validateMapConfigV4(c).errors.join()).toContain('图片或区域引用');
    }
  });
});
