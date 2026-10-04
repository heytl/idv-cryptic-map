import { isPublicMapConfigV4, type PublicMapConfigV4 } from "@idv-map/shared";

/** Inject transport; no uni/window dependency, also testable without the WeChat runtime. */
export function createContentClient(request: () => Promise<unknown>, onLoaded?: (data: PublicMapConfigV4) => void) {
  let current: PublicMapConfigV4 | undefined;
  let pending: Promise<PublicMapConfigV4> | undefined;
  return {
    load(refresh = false): Promise<PublicMapConfigV4> {
      if (pending) return pending;
      if (current && !refresh) return Promise.resolve(current);
      pending = request().then(data => {
        if (!isPublicMapConfigV4(data)) throw new Error("地图数据格式不兼容，请更新小程序后重试");
        current = data;
        onLoaded?.(data);
        return data;
      }).finally(() => { pending = undefined; });
      return pending;
    },
  };
}
