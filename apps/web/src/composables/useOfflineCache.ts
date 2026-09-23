import { ref, watch, type Ref } from "vue";
import { mapsV2, mapsV2Version, publicEndpoint } from "../data/maps-v2";

export function imageUrls(gameMapId: string): string[] {
  return [
    ...new Set(
      mapsV2
        .filter((l) => l.gameMapId === gameMapId)
        .flatMap((l) => [
          ...Object.values(l.floorImages).map((a) => a?.url),
          ...l.entrances.flatMap((e) => [e.imageUrl, e.thumbUrl]),
        ])
        .filter((s): s is string => !!s),
    ),
  ];
}
export function useOfflineCache(gameMapId: Ref<string>) {
  const phase = ref<"idle" | "running" | "done" | "error">("idle");
  const done = ref(0);
  const total = ref(0);
  const failed = ref(0);
  const error = ref("");
  const key = (id = gameMapId.value, version = mapsV2Version.value) =>
    `idv_map_offline_v3_${id}_${version}`;
  watch(
    [gameMapId, mapsV2Version],
    () => {
      if (phase.value === "running") return;
      try {
        phase.value = localStorage.getItem(key()) === "true" ? "done" : "idle";
      } catch {
        phase.value = "idle";
      }
    },
    { immediate: true },
  );
  async function warm() {
    if (phase.value === "running" || !gameMapId.value) return;
    const id = gameMapId.value;
    const savedKey = key();
    const urls = imageUrls(id);
    if (!urls.length) {
      phase.value = "error";
      error.value = "当前地图没有可下载的图片";
      return;
    }
    phase.value = "running";
    done.value = 0;
    failed.value = 0;
    total.value = urls.length;
    error.value = "";
    // First visit may precede SW activation. Persist the config explicitly as well.
    try {
      if (typeof caches !== "undefined") {
        const response = await fetch(publicEndpoint(), { cache: "no-cache" });
        if (!response.ok) throw new Error("配置下载失败");
        const config = await response.clone().json();
        if (config.schemaVersion !== 3) throw new Error("配置格式无效");
        await (
          await caches.open("maps-config-v3")
        ).put(publicEndpoint(), response);
      }
    } catch {
      phase.value = "error";
      error.value = "地图配置下载失败，请联网重试";
      return;
    }
    void navigator.storage?.persist?.().catch(() => undefined);
    const cache =
      typeof caches !== "undefined"
        ? await caches.open("map-images-r2").catch(() => null)
        : null;
    let index = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (index < urls.length) {
          const url = urls[index++]!;
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error();
            if (cache) await cache.put(url, res.clone());
            await res.arrayBuffer();
          } catch {
            failed.value++;
          } finally {
            done.value++;
          }
        }
      }),
    );
    phase.value = failed.value ? "error" : "done";
    if (failed.value) error.value = `${failed.value} 张图片下载失败，请重试`;
    try {
      if (!failed.value) localStorage.setItem(savedKey, "true");
      else localStorage.removeItem(savedKey);
    } catch {}
    if (id !== gameMapId.value || savedKey !== key()) phase.value = "idle";
  }
  async function clear() {
    if (phase.value === "running") return;
    const own = imageUrls(gameMapId.value);
    const shared = new Set(
      mapsV2
        .filter((l) => l.gameMapId !== gameMapId.value)
        .flatMap((l) => imageUrls(l.gameMapId)),
    );
    if (typeof caches !== "undefined") {
      const cache = await caches.open("map-images-r2");
      for (const url of own) if (!shared.has(url)) await cache.delete(url);
    }
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(`idv_map_offline_v3_${gameMapId.value}_`))
          localStorage.removeItem(k);
      }
    } catch {}
    phase.value = "idle";
    done.value = 0;
    total.value = 0;
    error.value = "";
  }
  return { phase, done, total, failed, error, warm, clear };
}

/** Only V1-specific caches/markers. Shared R2 media is never bulk deleted. */
export async function retireLegacyCaches() {
  try {
    localStorage.removeItem("idv_map_offline_cached_ready");
    if (typeof caches !== "undefined") {
      await caches.delete("map-images");
      if ((await caches.keys()).includes("maps-config")) {
        const cache = await caches.open("maps-config");
        for (const request of await cache.keys())
          if (new URL(request.url).pathname === "/maps.json")
            await cache.delete(request);
      }
    }
  } catch {
    /* Storage may be unavailable. */
  }
}
