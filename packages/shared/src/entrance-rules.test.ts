import { describe, expect, it } from "vitest";
import snapshot from "../../../apps/web/src/data/maps-v3.snapshot.json";
import { allowedEntranceTypes, availableModes, configuredEntranceTypes, defaultEntrance, enabledEntranceTypes, legacyEntranceRules } from "./entrance-rules";
import { assetKeys, entranceAvailabilityIssues, layoutPublicationIssues, normalizeEntranceRules, toPublicMapConfigV4, toPublicMapConfigV5, validateMapConfigV3, type MapConfigV3 } from "./map-v3";
import { isPublicMapConfigV5, resolvePublicMediaUrls } from "./map-client";

function fixture() {
  const c = normalizeEntranceRules(structuredClone(snapshot) as MapConfigV3);
  const layout = c.layouts.find(l => l.mode === "hard" && l.published && !l.deletedAt)!;
  layout.entrances = layout.entrances.filter(e => e.type === "side");
  c.layouts = [layout];
  c.gameMaps = c.gameMaps.filter(m => m.id === layout.gameMapId);
  c.gameMaps[0]!.entranceRules!.nightmare.enabled = [];
  c.gameMaps[0]!.modeVisibility!.nightmare = false;
  return c;
}

describe("map and mode entrance configuration", () => {
  it("hides a difficulty without changing its configured entries, layout flags or media", () => {
    const c = normalizeEntranceRules(structuredClone(snapshot) as MapConfigV3);
    const map = c.gameMaps[0]!;
    const rules = structuredClone(map.entranceRules), layouts = structuredClone(c.layouts);
    map.modeVisibility!.hard = false;
    expect(configuredEntranceTypes(map, "hard")).toEqual(["side"]);
    expect(enabledEntranceTypes(map, "hard")).toEqual([]);
    expect(availableModes(map)).toEqual(["nightmare"]);
    const published = toPublicMapConfigV5(c, "https://media.test");
    expect(published.gameMaps[0]!.enabledEntrances.hard).toEqual([]);
    expect(published.layouts.some(l => l.mode === "hard")).toBe(false);
    expect(JSON.stringify(published)).not.toContain("modeVisibility");
    expect(toPublicMapConfigV4(c, "https://media.test").layouts.some(l => l.mode === "hard")).toBe(false);
    expect(layoutPublicationIssues(c.layouts.find(l => l.mode === "hard")!, map)).toEqual([]);
    map.modeVisibility!.hard = true;
    expect(enabledEntranceTypes(map, "hard")).toEqual(["side"]);
    expect(map.entranceRules).toEqual(rules);
    expect(c.layouts).toEqual(layouts);
  });
  it("migrates V1 closures and preserves explicit false during repeated normalization", () => {
    const c = structuredClone(snapshot) as MapConfigV3;
    c.entranceRulesVersion = 1;
    for (const map of c.gameMaps) map.entranceRules = legacyEntranceRules();
    c.gameMaps[0]!.entranceRules!.hard.enabled = [];
    let next = normalizeEntranceRules(c);
    expect(next.entranceRulesVersion).toBe(2);
    expect(next.gameMaps[0]!.modeVisibility).toEqual({ hard: false, nightmare: true });
    next.gameMaps[0]!.entranceRules!.hard.enabled = ["side", "front"];
    next = normalizeEntranceRules(next);
    expect(next.gameMaps[0]!.modeVisibility!.hard).toBe(false);
    expect(next.gameMaps[0]!.entranceRules!.hard.enabled).toEqual(["side", "front"]);
    expect(normalizeEntranceRules(next)).toEqual(next);
  });
  it("rejects missing, malformed and empty visible mode settings in V2", () => {
    for (const change of [
      (c: MapConfigV3) => { delete c.gameMaps[0]!.modeVisibility; },
      (c: MapConfigV3) => { c.gameMaps[0]!.modeVisibility = { hard: true } as any; },
      (c: MapConfigV3) => { c.gameMaps[0]!.modeVisibility!.hard = "false" as any; },
      (c: MapConfigV3) => { c.gameMaps[0]!.entranceRules!.hard.enabled = []; },
    ]) { const c = fixture(); change(c); expect(validateMapConfigV3(c).valid).toBe(false); }
  });
  it("checks complete inventory when restoring a hidden mode", () => {
    const before = fixture(); before.gameMaps[0]!.modeVisibility!.hard = false;
    const next = structuredClone(before); next.gameMaps[0]!.modeVisibility!.hard = true;
    next.layouts[0]!.published = false;
    expect(entranceAvailabilityIssues(next, before).join()).toContain("侧门");
    next.layouts[0]!.published = true;
    expect(entranceAvailabilityIssues(next, before)).toEqual([]);
    next.gameMaps[0]!.modeVisibility!.hard = false;
    expect(toPublicMapConfigV5(next, "https://media.test").gameMaps).toEqual([]);
    expect(configuredEntranceTypes(next.gameMaps[0], "hard")).toEqual(["side"]);
  });
  it("migrates the real legacy snapshot without changing IDs, media, metadata or input", () => {
    const original = structuredClone(snapshot) as MapConfigV3;
    const c = normalizeEntranceRules(original);
    expect(c.layouts).toEqual(original.layouts);
    expect(assetKeys(c)).toEqual(assetKeys(original));
    expect(c.version).toBe(original.version);
    expect(c.updatedAt).toBe(original.updatedAt);
    expect(original.gameMaps[0]!.entranceRules).toBeUndefined();
    expect(c.gameMaps[0]!.entranceRules).toEqual(legacyEntranceRules());
    expect(normalizeEntranceRules(c)).toEqual(c);
    expect(validateMapConfigV3(c)).toEqual({ valid: true, errors: [] });
    const before = toPublicMapConfigV4(original, "https://media.test");
    const after = toPublicMapConfigV5(c, "https://media.test");
    expect(after.layouts).toEqual(before.layouts);
  });

  it("retains old draft references outside historical required types", () => {
    const c = structuredClone(snapshot) as MapConfigV3;
    const layout = c.layouts.find(l => l.mode === "nightmare")!;
    layout.published = false;
    layout.entrances = [{ id: "legacy-side", type: "side" }];
    const migrated = normalizeEntranceRules(c);
    expect(validateMapConfigV3(migrated).valid).toBe(true);
    expect(allowedEntranceTypes(migrated.gameMaps[0], "nightmare")).toContain("side");
    expect(enabledEntranceTypes(migrated.gameMaps[0], "nightmare")).not.toContain("side");
    expect(migrated.layouts).toEqual(c.layouts);
  });

  it("keeps maps isolated and preserves explicit closures and display order", () => {
    const first = { entranceRules: legacyEntranceRules() }, second = { entranceRules: legacyEntranceRules() };
    second.entranceRules.hard.enabled = ["upstairs", "front"];
    second.entranceRules.nightmare.enabled = [];
    expect(enabledEntranceTypes(first, "hard")).toEqual(["side"]);
    expect(defaultEntrance(second, "hard")).toBe("upstairs");
    expect(availableModes(second)).toEqual(["hard"]);
    expect(defaultEntrance(second, "nightmare")).toBeUndefined();
    expect(availableModes(undefined)).toEqual([]);
    const c = fixture(); c.gameMaps[0]!.entranceRules!.hard.enabled = []; c.gameMaps[0]!.modeVisibility!.hard = false;
    expect(normalizeEntranceRules(c).gameMaps[0]!.entranceRules!.hard.enabled).toEqual([]);
    expect(toPublicMapConfigV5(c, "https://media.test").gameMaps).toEqual([]);
    expect(toPublicMapConfigV5(c, "https://media.test").layouts).toEqual([]);
  });

  it("allows incremental recording without leaking unfinished or disabled entrances", () => {
    const c = fixture(), map = c.gameMaps[0]!, layout = c.layouts[0]!;
    layout.entrances.push({ id: `${layout.id}-front`, type: "front", direction: "south" });
    expect(layoutPublicationIssues(layout, map)).toEqual([]);
    expect(validateMapConfigV3(c).valid).toBe(true);
    let publicConfig = toPublicMapConfigV5(c, "https://media.test");
    expect(publicConfig.layouts[0]!.entrances.map(e => e.type)).toEqual(["side"]);
    map.entranceRules!.hard.enabled.push("front");
    expect(entranceAvailabilityIssues(c, fixture()).join()).toContain("正门");
    layout.entrances[1]!.image = layout.entrances[0]!.image;
    expect(entranceAvailabilityIssues(c, fixture())).toEqual([]);
    publicConfig = toPublicMapConfigV5(c, "https://media.test");
    expect(publicConfig.layouts[0]!.entrances.map(e => e.type)).toEqual(["side", "front"]);
    expect(JSON.stringify(publicConfig)).not.toContain('"allowed"');
    expect(JSON.stringify(publicConfig)).not.toContain('"key"');
    expect(toPublicMapConfigV4(c, "https://media.test").layouts[0]!.entrances.map(e => e.type)).toEqual(["side"]);
    map.entranceRules!.hard.enabled = ["front"];
    expect(toPublicMapConfigV4(c, "https://media.test").layouts).toEqual([]);
  });

  it("orders public layout entrances by map defaults without changing stored records", () => {
    const c = normalizeEntranceRules(structuredClone(snapshot) as MapConfigV3);
    c.gameMaps[0]!.entranceRules!.nightmare.enabled = ["upstairs", "front"];
    const originalLayouts = structuredClone(c.layouts);
    for (const published of [toPublicMapConfigV4(c, "https://media.test"), toPublicMapConfigV5(c, "https://media.test")]) {
      const layout = published.layouts.find(l => l.mode === "nightmare" && l.entrances.length === 2)!;
      expect(layout.entrances.map(e => e.type)).toEqual(["upstairs", "front"]);
      expect(layout.entrances[0]!.type).toBe("upstairs");
    }
    expect(c.layouts).toEqual(originalLayouts);
    c.gameMaps[0]!.entranceRules!.nightmare.enabled = ["front", "upstairs"];
    expect(toPublicMapConfigV5(c, "https://media.test").layouts.find(l => l.mode === "nightmare" && l.entrances.length === 2)!.entrances.map(e => e.type))
      .toEqual(["front", "upstairs"]);
  });

  it("rejects malformed lists, missing mode rules and removal of referenced types", () => {
    for (const change of [
      (c: MapConfigV3) => { c.gameMaps[0]!.entranceRules!.hard.enabled = ["front"]; c.gameMaps[0]!.entranceRules!.hard.allowed = ["side"]; },
      (c: MapConfigV3) => { c.gameMaps[0]!.entranceRules!.hard.enabled = ["side", "side"]; },
      (c: MapConfigV3) => { c.gameMaps[0]!.entranceRules!.hard.allowed = []; c.gameMaps[0]!.entranceRules!.hard.enabled = []; },
      (c: MapConfigV3) => { delete (c.gameMaps[0]!.entranceRules as Partial<ReturnType<typeof legacyEntranceRules>>).nightmare; },
    ]) { const c = fixture(); change(c); expect(validateMapConfigV3(c).valid).toBe(false); }
  });

  it("prevents removing the last published reference unless the entrance is closed", () => {
    const before = fixture(), next = structuredClone(before);
    next.layouts[0]!.published = false;
    expect(entranceAvailabilityIssues(next, before).join()).toContain("侧门");
    next.gameMaps[0]!.entranceRules!.hard.enabled = [];
    expect(entranceAvailabilityIssues(next, before)).toEqual([]);
  });

  it("validates V5 relative media and rejects disabled types and missing rules", () => {
    const publicConfig = resolvePublicMediaUrls(toPublicMapConfigV5(fixture(), "/r2"), "https://example.test/maps-v5.json");
    expect(isPublicMapConfigV5(publicConfig)).toBe(true);
    if (!isPublicMapConfigV5(publicConfig)) throw new Error("Invalid fixture");
    publicConfig.gameMaps[0]!.enabledEntrances.hard = ["front"];
    expect(isPublicMapConfigV5(publicConfig)).toBe(false);
    expect(isPublicMapConfigV5({ ...publicConfig, schemaVersion: 4 })).toBe(false);
  });
});
