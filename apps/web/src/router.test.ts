import { beforeEach, describe, it, expect } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { fixtureV6, catalogMap } from "../../../packages/shared/test/fixtures";
import { gameMaps, mapsV2 } from "./data/maps-v2";
import { normalizeV2Route, routes } from "./routes";
function router() {
  const r = createRouter({ history: createMemoryHistory(), routes });
  r.beforeEach(normalizeV2Route);
  return r;
}
beforeEach(() => {
  const c = fixtureV6();
  gameMaps.splice(0, gameMaps.length, ...c.gameMaps, catalogMap("second"));
  mapsV2.splice(0, mapsV2.length, ...c.layouts);
});
describe("multi-map routes", () => {
  it("uses map-specific defaults and drops obsolete filters", async () => {
    gameMaps.find(m => m.id === "second")!.difficulties = catalogMap("second", {hard:["upstairs","front"],nightmare:[]}).difficulties;
    const r = router();
    await r.push("/maps/second/nightmare/side/left");
    expect(r.currentRoute.value.path).toBe("/maps/second/hard/upstairs");
    await r.push("/maps/second/hard/front/triple");
    expect(r.currentRoute.value.path).toBe("/maps/second/hard/front/triple");
  });
  it("leaves fully closed maps without redirect loops", async () => {
    gameMaps.find(m => m.id === "second")!.difficulties = [];
    const r = router();
    await r.push("/maps/second/hard/side");
    expect(r.currentRoute.value.path).toBe("/maps/lady-of-doom/hard/side");
  });
  it.each(["/about", "/changelog"])(
    "%s opens independently of map data",
    async (path) => {
      gameMaps.splice(0);
      mapsV2.splice(0);
      const r = router();
      await r.push(path);
      expect(r.currentRoute.value.path).toBe(path);
    },
  );
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
