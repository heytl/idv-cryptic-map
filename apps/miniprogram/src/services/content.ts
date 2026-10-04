import { createContentClient } from "./content-client";
import { requestErrorMessage } from "./request-errors";
import { floorPreviewCache } from "./floor-preview-storage";
import { floorPreviewSources } from "./floor-preview-cache";

export const apiOrigin = import.meta.env.VITE_MAP_API_BASE_URL.replace(/\/$/, "");
export const content = createContentClient(() => new Promise((resolve, reject) => {
  uni.request({
    url: `${apiOrigin}/maps-v4.json`, method: "GET", timeout: 15000,
    success: response => {
      if (response.statusCode === 200) resolve(response.data);
      else reject(new Error(`地图加载失败（${response.statusCode}），请稍后重试`));
    },
    fail: cause => {
      console.error("[content] request failed", apiOrigin, cause.errMsg);
      reject(new Error(requestErrorMessage(cause.errMsg)));
    },
  });
}), data => { void floorPreviewCache.reconcile(floorPreviewSources(data)); });
