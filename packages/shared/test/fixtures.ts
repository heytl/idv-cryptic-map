import snapshot from '../../../apps/web/src/data/maps-v3.snapshot.json';
import { normalizeMapConfigV4, toPublicMapConfigV6, hydrateConfigV6, legacyDefinitions, type PublicGameMapV6 } from '../src/map-v4';
export const fixtureV4 = () => normalizeMapConfigV4(structuredClone(snapshot));
export const fixtureV6 = (base = 'https://media.test') => hydrateConfigV6(toPublicMapConfigV6(fixtureV4(), base));
export function catalogMap(id: string, enabled: Record<string, string[]> = { hard: ['side'], nightmare: ['front', 'upstairs'] }): PublicGameMapV6 {
  return {
    id, name: id, sort: 10, published: true, difficulties: Object.entries(enabled).map(([difficultyId, enabledEntrances], i) => ({ difficultyId, enabledEntrances, sort: i * 10, floors: [], entranceFilters: Object.fromEntries(legacyDefinitions().entranceTypes.map(e => [e.id, { filterLabel: e.filterLabel, filterOptions: e.filterOptions }])) }))
  };
}
