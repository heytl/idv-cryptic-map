import { describe, expect, it } from 'vitest';
import { fixtureV4 } from '../test/fixtures';
import legacyV4 from '../../../apps/web/src/data/maps-v4.snapshot.json';
import { definitionReferences } from './definition-references';
import { catalogFilterLabelV4, catalogFilterTitle, catalogFilterValuesV4, entranceFilterFor, hydrateConfigV6, isCatalogFilterV4, isPublicMapConfigV6, legacyDefinitions, normalizeMapConfigV4, toPublicMapConfigV6, validateMapConfigV4 } from './map-v4';

describe('map-owned entrance classifications', () => {
  it('migrates legacy V4 without mutating the source or sharing options between maps and difficulties', () => {
    const source = structuredClone(legacyV4), before = structuredClone(source);
    const c = normalizeMapConfigV4(source);
    expect(source).toEqual(before);
    expect(c.entranceTypes.every(e => !('filterOptions' in e) && !('filterLabel' in e))).toBe(true);
    expect(validateMapConfigV4(c).valid).toBe(true);
    const [first, second] = c.gameMaps[0].difficulties;
    expect(first.entranceFilters!.side).toEqual(second.entranceFilters!.side);
    first.entranceFilters!.side.filterOptions[0].name = '独立分类';
    expect(second.entranceFilters!.side.filterOptions[0].name).not.toBe('独立分类');
    expect(normalizeMapConfigV4(c)).toBe(c);
  });

  it('uses the same entrance and value IDs independently across maps and difficulties', () => {
    const c = fixtureV4(), map = c.gameMaps[0], source = c.layouts.find(l => l.published && !l.deletedAt && l.entrances.some(e => e.type === 'side'))!;
    const second = structuredClone(map);
    second.id = 'second';
    const filter = entranceFilterFor(second, source.mode, 'side')!;
    filter.filterLabel = '颜色';
    filter.filterOptions.forEach(o => o.name = `颜色${o.id}`);
    c.gameMaps.push(second);
    const layout = structuredClone(source);
    layout.id = 99999; layout.gameMapId = second.id;
    layout.entrances.forEach(e => e.id = `second-${e.id}`);
    c.layouts.push(layout);
    expect(validateMapConfigV4(c).valid).toBe(true);
    const wire = toPublicMapConfigV6(c, 'https://media.test');
    expect(isPublicMapConfigV6(wire)).toBe(true);
    const own = wire.gameMaps.find(m => m.id === map.id)!, other = wire.gameMaps.find(m => m.id === second.id)!;
    const value = layout.entrances.find(e => e.type === 'side')!.filterValue!;
    expect(catalogFilterTitle('side', own, source.mode)).toBe('方向');
    expect(catalogFilterTitle('side', other, source.mode)).toBe('颜色');
    expect(catalogFilterLabelV4('side', value, other, source.mode)).toBe(`颜色${value}`);
    expect(wire.layouts.find(l => l.id === layout.id)!.entrances.find(e => e.type === 'side')!.filterLabel).toBe(`颜色${value}`);
    filter.filterOptions.find(o => o.id === value)!.archived = true;
    expect(isCatalogFilterV4('side', value, toPublicMapConfigV6(c, 'https://media.test').gameMaps.find(m => m.id === second.id), source.mode)).toBe(false);
    expect(catalogFilterValuesV4('side', own, source.mode)).toContain(value);
  });

  it('allows unclassified entries and rejects values outside the current map difficulty', () => {
    const c = fixtureV4(), l = c.layouts[0], map = c.gameMaps.find(m => m.id === l.gameMapId)!;
    const filter = entranceFilterFor(map, l.mode, l.entrances[0].type)!;
    filter.filterOptions = [];
    expect(validateMapConfigV4(c).valid).toBe(false);
    for (const layout of c.layouts.filter(v => v.gameMapId === l.gameMapId && v.mode === l.mode))
      for (const e of layout.entrances.filter(e => e.type === l.entrances[0].type)) delete e.filterValue;
    filter.filterLabel = '';
    expect(validateMapConfigV4(c).valid).toBe(true);
    expect(isPublicMapConfigV6(toPublicMapConfigV6(c, 'https://media.test'))).toBe(true);
  });

  it('counts option references within the map and difficulty, including retired instances', () => {
    const c = fixtureV4(), l = c.layouts[0], e = l.entrances[0];
    e.deletedAt = '2026-11-06T00:00:00.000Z';
    const counts = definitionReferences(c).filterOptions;
    expect(counts.has(`${l.gameMapId}/${l.mode}/${e.type}/${e.filterValue}`)).toBe(true);
    expect(counts.has(`other/${l.mode}/${e.type}/${e.filterValue}`)).toBe(false);
    expect(counts.has(`${e.type}/${e.filterValue}`)).toBe(false);
  });

  it('reads existing V6 dictionaries into map-scoped classifications and validates wire labels', () => {
    const wire = toPublicMapConfigV6(fixtureV4(), 'https://media.test');
    wire.dictionaries.entrances = legacyDefinitions().entranceTypes;
    wire.gameMaps.forEach(m => m.difficulties.forEach(d => delete d.entranceFilters));
    expect(isPublicMapConfigV6(wire)).toBe(true);
    hydrateConfigV6(wire);
    expect(wire.dictionaries.entrances.every(e => !('filterOptions' in e))).toBe(true);
    expect(catalogFilterTitle('side', wire.gameMaps[0], 'hard')).toBe('方向');
    wire.layouts[0].entrances[0].filterLabel = '错误分类';
    expect(isPublicMapConfigV6(wire)).toBe(false);
  });
});
