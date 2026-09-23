import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import snapshot from "./maps-v3.snapshot.json";
describe("current handbook font subset", () => {
  it("covers map names, layout names and remarks in the current baseline", () => {
    const chars = new Set(
      readFileSync(
        new URL("../assets/fonts/subset-chars.txt", import.meta.url),
        "utf8",
      ),
    );
    const text =
      snapshot.gameMaps.map((m) => m.name).join("") +
      snapshot.layouts.map((l) => l.displayName + l.remarks).join("");
    const missing = [...new Set(text.replace(/\s/g, ""))].filter(
      (c) => !chars.has(c),
    );
    expect(
      missing,
      "Regenerate fonts with scripts/subset-fonts.mjs when adding baseline text",
    ).toEqual([]);
  });
});
