import { ENABLED_ENTRANCES, DIRECTION_LABELS, DIRECTIONS_V2, ENTRANCE_TYPES, FLOOR_ORDER, GAME_MODES, PASSAGES_V2, PASSAGE_LABELS, type DirectionV2, type EntranceType, type FloorType, type GameMode, type PassageV2, type PublicEntranceV2 } from "./map-v2";
import type { PublicLayoutV4 } from "./map-v3";

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === "string" && GAME_MODES.includes(value as GameMode);
}

export function isEntranceType(value: unknown): value is EntranceType {
  return (
    typeof value === "string" && ENTRANCE_TYPES.includes(value as EntranceType)
  );
}

export function enabledEntranceTypesV2(
  mode: GameMode,
): readonly EntranceType[] {
  return ENABLED_ENTRANCES[mode];
}

export function isEnabledEntranceV2(
  mode: GameMode,
  entrance: EntranceType,
): boolean {
  return enabledEntranceTypesV2(mode).includes(entrance);
}

export function defaultEntranceV2(mode: GameMode): EntranceType {
  return enabledEntranceTypesV2(mode)[0]!;
}

export type CatalogFilterV2 = DirectionV2 | PassageV2;

/** 正门按进门后的通道分类，其他入口继续按地图方向分类。 */
export function catalogFilterValuesV2(
  entrance: EntranceType,
): readonly CatalogFilterV2[] {
  return entrance === "front" ? PASSAGES_V2 : DIRECTIONS_V2;
}

export function isCatalogFilterV2(
  entrance: EntranceType,
  value: unknown,
): value is CatalogFilterV2 {
  return (
    typeof value === "string" &&
    catalogFilterValuesV2(entrance).includes(value as CatalogFilterV2)
  );
}

export function catalogFilterLabelV2(
  entrance: EntranceType,
  value: CatalogFilterV2,
): string {
  return entrance === "front"
    ? PASSAGE_LABELS[value as PassageV2]
    : DIRECTION_LABELS[value as DirectionV2];
}

export function entranceFilterValueV2(
  entrance: PublicEntranceV2,
): CatalogFilterV2 | undefined {
  return entrance.type === "front" ? entrance.passage : entrance.direction;
}

export function entranceFilterLabelV2(entrance: PublicEntranceV2): string {
  return entrance.type === "front"
    ? (entrance.passageLabel ?? "通道待分类")
    : entrance.directionLabel;
}

export function findEntranceV2(
  map: PublicLayoutV4,
  type: EntranceType,
): PublicEntranceV2 | undefined {
  return map.entrances.find((entrance) => entrance.type === type);
}

export function availableFloors(map: PublicLayoutV4): FloorType[] {
  return FLOOR_ORDER.filter((floor) => !!map.floorImages[floor] || (floor !== "full" && !!map.floorRegions?.regions[floor]));
}
