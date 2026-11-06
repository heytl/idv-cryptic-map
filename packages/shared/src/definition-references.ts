import type { MapConfigV4 } from './map-v4';

// Include drafts and the recycle bin; purged maps only retain historical IDs.
export function definitionReferences(c: Pick<MapConfigV4, 'gameMaps' | 'layouts'>) {
  const difficulties = new Map<string, number>();
  const entranceTypes = new Map<string, number>();
  const filterOptions = new Map<string, number>();
  const floors = new Map<string, number>();
  const add = (counts: Map<string, number>, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  const purged = new Set(c.gameMaps.filter(m => m.purgedAt).map(m => m.id));
  for (const m of c.gameMaps.filter(m => !m.purgedAt))
    for (const d of m.difficulties.filter(d => !d.deletedAt)) {
      add(difficulties, d.difficultyId);
      for (const type of new Set([...d.entranceRules.allowed, ...d.entranceRules.enabled]))
        add(entranceTypes, type);
    }
  for (const l of c.layouts) {
    if (purged.has(l.gameMapId)) continue;
    add(difficulties, l.mode);
    for (const id of new Set([...Object.keys(l.floorImages), ...Object.keys(l.floorRegions?.regions ?? {})]))
      add(floors, `${l.gameMapId}/${l.mode}/${id}`);
    for (const e of l.entrances) {
      add(entranceTypes, e.type);
      if (e.filterValue !== undefined)
        add(filterOptions, `${l.gameMapId}/${l.mode}/${e.type}/${e.filterValue}`);
    }
  }
  return { difficulties, entranceTypes, filterOptions, floors };
}

/** Remove a recycled map from editing while reserving its IDs and statistics. */
export function purgeGameMap(c: Pick<MapConfigV4, 'gameMaps' | 'layouts'>, id: string, now = new Date()) {
  const map = c.gameMaps.find(m => m.id === id);
  if (!map?.deletedAt) throw new Error('请先将地图移入回收站');
  const timestamp = map.purgedAt ?? now.toISOString();
  map.purgedAt = timestamp;
  map.published = false;
  for (const d of map.difficulties) {
    d.deletedAt ??= timestamp;
    d.visible = false;
  }
  for (const l of c.layouts.filter(l => l.gameMapId === id)) {
    l.deletedAt ??= timestamp;
    l.published = false;
  }
}
