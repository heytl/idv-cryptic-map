import { afterEach, describe, expect, it, vi } from "vitest";
import { preferredCatalogPath, rememberCatalog } from "./catalogPreferences";

afterEach(() => vi.unstubAllGlobals());
describe("catalog device preferences", () => {
  const maps = [{ id: "lady-of-doom" }, { id: "second" }];
  it("remembers map, mode and entrance", () => {
    let stored = "";
    vi.stubGlobal("localStorage", { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
    rememberCatalog("second", "nightmare", "upstairs");
    expect(preferredCatalogPath(maps)).toBe("/maps/second/nightmare/upstairs");
  });
  it("normalizes removed maps and disabled entrances", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ gameMapId: "removed", mode: "hard", entrance: "front" }) });
    expect(preferredCatalogPath(maps)).toBe("/maps/lady-of-doom/hard/side");
  });
  it("works with unavailable storage and no published maps", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("disabled"); }, setItem: () => { throw new Error("disabled"); } });
    expect(() => rememberCatalog("second", "hard", "side")).not.toThrow();
    expect(preferredCatalogPath(maps)).toBe("/maps/lady-of-doom/hard/side");
    expect(preferredCatalogPath([])).toBeUndefined();
  });
});
