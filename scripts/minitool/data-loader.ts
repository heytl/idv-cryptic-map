import { hydrateConfigV6, type PublicGameMap, type GameMode, type PublicLayoutV4 } from '@idv-map/shared/dynamic';
export { isGameMode, isEntranceType, enabledEntranceTypesV2, isEnabledEntranceV2, defaultEntranceV2, catalogFilterValuesV2, isCatalogFilterV2, catalogFilterLabelV2, entranceFilterValueV2, entranceFilterLabelV2, findEntranceV2, availableFloors, type CatalogFilterV2 } from '@idv-map/shared/dynamic';
import { reactive, ref } from 'vue';
import snapshot from 'virtual:minitool-snapshot';
const config = hydrateConfigV6(snapshot);
export const mapsV2 = reactive<PublicLayoutV4[]>(config.layouts);
export const mapsV2UpdatedAt = ref(config.updatedAt);
export const mapsV2Version = ref(config.dataVersion);
export const gameMaps = reactive<PublicGameMap[]>(config.gameMaps);
export const mapsV2Error = ref('');
export async function ensureMapsV2() { return true; }
export function findMapV2(id: number, mode?: GameMode, gameMapId?: string) {
  return mapsV2.find(map => map.id === id && (!mode || map.mode === mode) && (!gameMapId || map.gameMapId === gameMapId));
}
