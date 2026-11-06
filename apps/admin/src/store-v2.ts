import {
  validateMapConfigV3,
  normalizeEntranceRules,
  entranceAvailabilityIssues,
  type Definition,
  type EntranceDefinition,
  type GameMap,
  type Layout,
  type MapConfigV3,
} from "@idv-map/shared/dynamic";
import { computed, reactive } from "vue";
import { fetchConfigV2, saveConfigV2 } from "./api-v2";
export const storeV2 = reactive({
  loaded: false,
  loading: false,
  fatal: "",
  version: 0,
  updatedAt: "",
  maps: [] as Layout[],
  gameMaps: [] as GameMap[],
  difficulties: [] as Definition[],
  entranceTypes: [] as EntranceDefinition[],
  dirty: false,
  saving: false,
});
let editRevision = 0;
let loadedConfig: MapConfigV3 | undefined;
export async function loadV2() {
  storeV2.loading = true;
  storeV2.fatal = "";
  try {
    const c = normalizeEntranceRules(await fetchConfigV2());
    loadedConfig = JSON.parse(JSON.stringify(c));
    storeV2.version = c.version;
    storeV2.updatedAt = c.updatedAt;
    storeV2.maps = c.layouts;
    storeV2.gameMaps = c.gameMaps;
    storeV2.difficulties = c.difficulties;
    storeV2.entranceTypes = c.entranceTypes;
    storeV2.dirty = false;
    storeV2.loaded = true;
  } catch (e) {
    storeV2.fatal = e instanceof Error ? e.message : "无法读取内容";
  } finally {
    storeV2.loading = false;
  }
}
export function markDirtyV2() {
  editRevision++;
  storeV2.dirty = true;
}
function currentConfigV2(): MapConfigV3 {
  return {
    schemaVersion: 4,
    version: storeV2.version,
    updatedAt: storeV2.updatedAt,
    gameMaps: storeV2.gameMaps,
    layouts: storeV2.maps,
    difficulties: storeV2.difficulties,
    entranceTypes: storeV2.entranceTypes,
  };
}
export function saveV2(): Promise<string | null> {
  return persistV2(JSON.parse(JSON.stringify(currentConfigV2())));
}
/** Persist one operation against the saved baseline, leaving other drafts local. */
export async function saveImmediateV2(change: (config: MapConfigV3) => void): Promise<string | null> {
  if (storeV2.saving) return "正在保存，请稍后重试";
  if (!loadedConfig) return "请先读取配置";
  const candidate: MapConfigV3 = JSON.parse(JSON.stringify(loadedConfig));
  try {
    change(candidate);
  } catch (e) {
    return e instanceof Error ? e.message : "无法修改配置";
  }
  return persistV2(candidate, change);
}
async function persistV2(c: MapConfigV3, apply?: (config: MapConfigV3) => void): Promise<string | null> {
  if (storeV2.saving) return "正在保存，请稍后重试";
  const check = validateMapConfigV3(c);
  if (!check.valid) return check.errors.join("；");
  const readiness = loadedConfig ? entranceAvailabilityIssues(c, loadedConfig) : [];
  if (readiness.length) return readiness.join("；");
  storeV2.saving = true;
  const savingRevision = editRevision;
  try {
    const next = await saveConfigV2(storeV2.version, c);
    // Apply only after success. Reuse the live arrays so open editors and
    // changes made while the request was in flight keep their references.
    if (apply) {
      const live = currentConfigV2();
      apply(live);
      storeV2.gameMaps = live.gameMaps;
      storeV2.maps = live.layouts;
      storeV2.difficulties = live.difficulties;
      storeV2.entranceTypes = live.entranceTypes;
    }
    storeV2.version = next.version;
    storeV2.updatedAt = next.updatedAt;
    loadedConfig = JSON.parse(JSON.stringify(next));
    for (const layout of storeV2.maps) if (next.layouts.find(l => l.id === layout.id)?.modeLocked) layout.modeLocked = true;
    const content = (config: MapConfigV3) => JSON.stringify([config.gameMaps, config.layouts, config.difficulties, config.entranceTypes]);
    storeV2.dirty = apply ? content(currentConfigV2()) !== content(next) : editRevision !== savingRevision;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "保存失败";
  } finally {
    storeV2.saving = false;
  }
}
export const activeMapsV2 = computed(() =>
  storeV2.maps.filter((l) => !l.deletedAt),
);
export function nextIdV2() {
  return Math.max(0, ...storeV2.maps.map((l) => l.id)) + 1;
}
