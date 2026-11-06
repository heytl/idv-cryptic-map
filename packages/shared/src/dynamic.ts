/** Active applications use this boundary; index.ts retains frozen legacy APIs. */
export * from './index';
export { type DifficultyId as GameMode, type EntranceTypeId as EntranceType, type FloorId as FloorType, type FloorId as RegionFloor, type MapConfigV4 as MapConfigV3, type GameMapV4 as GameMap, type LayoutV4 as Layout, type EntranceV4 as EntranceV2, type PublicMapConfigV6 as PublicMapConfigV5, type PublicMapConfigV6 as PublicMapConfigV4, type PublicGameMapV6 as PublicGameMap, type PublicLayoutV6 as PublicLayout, type PublicLayoutV6 as PublicLayoutV4, type PublicEntranceV6 as PublicEntranceV2, CLIENT_MODE_LABELS as MODE_LABELS, CLIENT_ENTRANCE_LABELS as ENTRANCE_LABELS, normalizeMapConfigV4 as normalizeEntranceRules, validateMapConfigV4 as validateMapConfigV3, availableModes, enabledEntranceTypes, configuredEntranceTypes, allowedEntranceTypes, defaultEntrance, completeEntrance, layoutPublicationIssues, entranceAvailabilityIssues, availableFloors, resolveFloorSource, floorLabel, difficultyFor, catalogFilterTitle, catalogFilterValuesV4 as catalogFilterValuesV2, catalogFilterLabelV4 as catalogFilterLabelV2, isCatalogFilterV4 as isCatalogFilterV2, isPublicMapConfigV6 as isPublicMapConfigV5, } from './map-v4';
export type CatalogFilterV2 = string;
export const isGameMode = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
export const isEntranceType = isGameMode;
export const findEntranceV2 = (layout: import('./map-v4').PublicLayoutV6, type: string) => layout.entrances.find(e => e.type === type);
export const entranceFilterValueV2 = (e: import('./map-v4').PublicEntranceV6) => e.filterValue;
export const entranceFilterLabelV2 = (e: import('./map-v4').PublicEntranceV6) => e.filterLabel ?? '';
