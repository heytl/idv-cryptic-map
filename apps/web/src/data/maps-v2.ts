import { hydrateConfigV6, isPublicMapConfigV5, resolvePublicMediaUrls, type PublicGameMap, type GameMode, type PublicLayoutV4 } from "@idv-map/shared/dynamic";
export { isGameMode, isEntranceType, enabledEntranceTypesV2, isEnabledEntranceV2, defaultEntranceV2, catalogFilterValuesV2, isCatalogFilterV2, catalogFilterLabelV2, entranceFilterValueV2, entranceFilterLabelV2, findEntranceV2, availableFloors, type CatalogFilterV2 } from "@idv-map/shared/dynamic";
import { reactive, ref } from "vue";

export const mapsV2 = reactive<PublicLayoutV4[]>([]);
export const mapsV2UpdatedAt = ref("");
export const mapsV2Version = ref(0);
export const gameMaps = reactive<PublicGameMap[]>([]);
export const mapsV2Error = ref("");

let loadPromise: Promise<boolean> | null = null;

export function publicEndpoint(): string {
  const base = (import.meta.env.VITE_MAP_API_BASE_URL ?? "").replace(/\/$/, "");
  // 正式 Access 策略覆盖 /api/*；使用等价的公开文件路由可让网页、main 静态站和小程序
  // 在无需后台登录的情况下读取，同时仍由 Worker 从同一份 config:v4:current 下发。
  return `${base}/maps-v6.json`;
}

export async function ensureMapsV2(): Promise<boolean> {
  if (gameMaps.length > 0) return true;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    mapsV2Error.value = "";
    try {
      const response = await fetch(publicEndpoint(), { cache: "no-cache" });
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "地图尚未准备好"
            : `HTTP ${response.status}`,
        );
      const data = resolvePublicMediaUrls(await response.json(), new URL(publicEndpoint(), window.location.href).href);
      if (!isPublicMapConfigV5(data)) throw new Error("地图协议不合法，请更新服务端与客户端");
      hydrateConfigV6(data);
      mapsV2.splice(0, mapsV2.length, ...data.layouts);
      gameMaps.splice(0, gameMaps.length, ...data.gameMaps);
      mapsV2UpdatedAt.value = data.updatedAt;
      mapsV2Version.value = data.dataVersion;
      return true;
    } catch (error) {
      mapsV2Error.value =
        error instanceof Error ? error.message : "地图加载失败";
      return false;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

export function findMapV2(
  id: number,
  mode?: GameMode,
  gameMapId?: string,
): PublicLayoutV4 | undefined {
  return mapsV2.find(
    (map) =>
      map.id === id &&
      (!mode || map.mode === mode) &&
      (!gameMapId || map.gameMapId === gameMapId),
  );
}
