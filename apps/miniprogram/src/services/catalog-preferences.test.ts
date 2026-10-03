import { expect, it } from "vitest";
import { createCatalogPreferences } from "./catalog-preferences";

const maps = [{ id: "lady-of-doom" }, { id: "second" }];
it("restores committed conditions after a new session", () => {
  let value = "";
  const preferences = createCatalogPreferences({ get: () => value, set: (_key, next) => { value = next; } });
  const conditions = { gameMapId: "second", mode: "nightmare", entrance: "upstairs" } as const;
  preferences.remember(conditions);
  expect(preferences.read(maps)).toEqual(conditions);
});
it("recovers removed maps and entrances disabled by the selected mode", () => {
  const preferences = createCatalogPreferences({ get: () => '{"gameMapId":"removed","mode":"hard","entrance":"front"}', set: () => {} });
  expect(preferences.read(maps)).toEqual({ gameMapId: "lady-of-doom", mode: "hard", entrance: "side" });
  expect(preferences.read([{ id: "new-map" }])?.gameMapId).toBe("new-map");
});
it.each(["{broken", "null", "[]", '{"mode":"unsupported","entrance":123}'])("recovers malformed preferences: %s", value => {
  const preferences = createCatalogPreferences({ get: () => value, set: () => {} });
  expect(preferences.read(maps)).toEqual({ gameMapId: "lady-of-doom", mode: "hard", entrance: "side" });
});
it("keeps navigation working with disabled storage or an empty catalog", () => {
  const preferences = createCatalogPreferences({ get: () => { throw new Error("disabled"); }, set: () => { throw new Error("disabled"); } });
  expect(preferences.read(maps)?.entrance).toBe("side");
  expect(preferences.read([])).toBeUndefined();
  expect(() => preferences.remember({ gameMapId: "second", mode: "hard", entrance: "side" })).not.toThrow();
});
