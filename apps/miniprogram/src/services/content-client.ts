import { hydrateConfigV6, isPublicMapConfigV5, type PublicMapConfigV5 } from "@idv-map/shared/dynamic";

/** Inject transport; no uni/window dependency, also testable without the WeChat runtime. */
export function createContentClient(request: () => Promise<unknown>, onLoaded?: (data: PublicMapConfigV5) => void) {
  let current: PublicMapConfigV5 | undefined;
  let pending: Promise<PublicMapConfigV5> | undefined;
  return {
    load(refresh = false): Promise<PublicMapConfigV5> {
      if (pending) return pending;
      if (current && !refresh) return Promise.resolve(current);
      pending = request().then(data => {
        if (!isPublicMapConfigV5(data)) throw new Error("地图数据格式不兼容，请更新服务端或小程序后重试");
        current = hydrateConfigV6(data);
        onLoaded?.(data);
        return data;
      }).finally(() => { pending = undefined; });
      return pending;
    },
  };
}
