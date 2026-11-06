import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { changelog } from "./changelog";
describe("current handbook font subset", () => {
  it("covers static document-backed changelog content", () => {
    const chars = new Set(
      readFileSync(
        new URL("../assets/fonts/subset-chars.txt", import.meta.url),
        "utf8",
      ),
    );
    const text =
      changelog
        .map(
          (entry) =>
            entry.version +
            entry.status +
            entry.title +
            entry.blocks
              .map((block) =>
                block.type === "list" ? block.items.join("") : block.text,
              )
              .join(""),
        )
        .join("");
    const missing = [...new Set(text.replace(/\s/g, ""))].filter(
      (c) => !chars.has(c),
    );
    expect(
      missing,
      "Regenerate fonts with scripts/subset-fonts.mjs when adding baseline text",
    ).toEqual([]);
  });
});
