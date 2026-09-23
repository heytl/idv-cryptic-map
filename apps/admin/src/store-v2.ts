import {
  validateMapConfigV3,
  type GameMap,
  type Layout,
  type MapConfigV3,
} from "@idv-map/shared";
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
  dirty: false,
  saving: false,
});
let editRevision = 0;
export async function loadV2() {
  storeV2.loading = true;
  storeV2.fatal = "";
  try {
    const c = await fetchConfigV2();
    storeV2.version = c.version;
    storeV2.updatedAt = c.updatedAt;
    storeV2.maps = c.layouts;
    storeV2.gameMaps = c.gameMaps;
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
export async function saveV2(): Promise<string | null> {
  if (storeV2.saving) return "正在保存";
  const c: MapConfigV3 = JSON.parse(
    JSON.stringify({
      schemaVersion: 3,
      version: storeV2.version,
      updatedAt: storeV2.updatedAt,
      gameMaps: storeV2.gameMaps,
      layouts: storeV2.maps.map((l, i) => ({ ...l, sort: (i + 1) * 10 })),
    }),
  );
  const check = validateMapConfigV3(c);
  if (!check.valid) return check.errors.join("；");
  storeV2.saving = true;
  const savingRevision = editRevision;
  try {
    const next = await saveConfigV2(storeV2.version, c);
    storeV2.version = next.version;
    storeV2.updatedAt = next.updatedAt;
    storeV2.dirty = editRevision !== savingRevision;
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
