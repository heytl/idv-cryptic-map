import { beforeEach, describe, it, expect } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { toPublicMapConfigV3, type MapConfigV3 } from "@idv-map/shared";
import snapshot from "./data/maps-v3.snapshot.json";
import { gameMaps, mapsV2 } from "./data/maps-v2";
import { normalizeV2Route, routes } from "./routes";
function router() {
  const r = createRouter({ history: createMemoryHistory(), routes });
  r.beforeEach(normalizeV2Route);
  return r;
}
beforeEach(() => {
  const c = toPublicMapConfigV3(snapshot as MapConfigV3, "https://media.test");
  gameMaps.splice(0, gameMaps.length, ...c.gameMaps, {
    id: "second",
    name: "第二地图",
    published: true,
    sort: 2,
  });
  mapsV2.splice(0, mapsV2.length, ...c.layouts);
});
describe("multi-map routes", () => {
  it.each(["/", "/v1", "/v1/map/name/1", "/legacy", "/dir/北", "/map/旧名称"])(
    "%s retires to the default catalog",
    async (path) => {
      const r = router();
      await r.push(path);
      expect(r.currentRoute.value.path).toBe("/maps/lady-of-doom/hard/side");
    },
  );
  it("preserves formal V2 links and floor", async () => {
    const l = mapsV2.find((l) => l.mode === "nightmare")!;
    const r = router();
    await r.push(`/nightmare/front/map/${l.id}/basement`);
    expect(r.currentRoute.value.path).toBe(
      `/maps/lady-of-doom/nightmare/front/layout/${l.id}/basement`,
    );
  });
  it("normalizes disabled entrances and invalid filters", async () => {
    const r = router();
    await r.push("/hard/front/triple");
    expect(r.currentRoute.value.path).toBe("/maps/lady-of-doom/hard/side");
  });
  it("does not resolve another map layout with the same name", async () => {
    const l = mapsV2.find((l) => l.mode === "hard")!;
    const r = router();
    await r.push(`/maps/second/hard/side/layout/${l.id}`);
    expect(r.currentRoute.value.path).toBe("/maps/second/hard/side");
  });
  it("checks parameter changes on the same route record", async () => {
    const r = router();
    await r.push("/maps/lady-of-doom/hard/side/left");
    await r.push("/maps/unknown/hard/side/left");
    expect(r.currentRoute.value.path).toBe("/maps/lady-of-doom/hard/side");
  });
});
