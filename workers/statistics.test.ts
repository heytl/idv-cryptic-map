import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { D1Statistics } from "./cloudflare";
import {
  beijingDay,
  validateStatsQuery,
  type VisitEvent,
} from "../packages/shared/src/index";
let db: DatabaseSync;
let stats: D1Statistics;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("./migrations/0001_statistics.sql", import.meta.url),
      "utf8",
    ),
  );
  function prepare(sql: string) {
    let values: unknown[] = [];
    return {
      bind(...args: unknown[]) {
        values = args;
        return this;
      },
      async all() {
        return { results: db.prepare(sql).all(...(values as any[])) };
      },
      async run() {
        return db.prepare(sql).run(...(values as any[]));
      },
      execute() {
        return /^(SELECT)/i.test(sql)
          ? { results: db.prepare(sql).all(...(values as any[])) }
          : { results: [], ...db.prepare(sql).run(...(values as any[])) };
      },
    };
  }
  stats = new D1Statistics({
    prepare,
    batch: async (stmts: ReturnType<typeof prepare>[]) => {
      db.exec("BEGIN");
      try {
        const result = stmts.map((s) => s.execute());
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  } as any);
});
afterEach(() => db.close());
function event(
  id: string,
  time: string,
  map = "lady-of-doom",
  layoutId = 1,
): VisitEvent {
  return {
    eventId: id,
    layoutId,
    entranceId: `${layoutId}-side`,
    entranceType: "side",
    gameMapId: map,
    mode: "hard",
    receivedAt: time,
  };
}
describe("D1 statistics with real SQLite", () => {
  it("deduplicates and groups at Beijing midnight with correct denominators", async () => {
    const a = event("a", "2026-09-21T15:59:59.000Z");
    await stats.record(a);
    await stats.record(a);
    await stats.record(event("b", "2026-09-21T16:00:00.000Z"));
    await stats.record(event("c", "2026-09-21T16:00:01.000Z", "second", 2));
    const report = await stats.report({ from: "2026-09-21", to: "2026-09-22" });
    expect(report.total).toBe(3);
    expect(report.daily.map((r) => r.count)).toEqual([1, 2]);
    expect(report.gameMaps.find((r) => r.key === "second")?.share).toBeCloseTo(
      1 / 3,
    );
    expect(report.entrances).toEqual([{ key: "side", count: 3, share: 1 }]);
    const filtered = await stats.report({
      from: "2026-09-22",
      to: "2026-09-22",
      gameMapId: "second",
      mode: "hard",
    });
    expect(filtered.total).toBe(1);
    expect(filtered.layouts).toEqual([{ key: "2", count: 1, share: 1 }]);
  });
  it("exports independently, prunes visits and retains collection start", async () => {
    await stats.record(event("a", "2026-06-01T00:00:00.000Z"));
    await stats.record(event("b", "2026-09-22T00:00:00.000Z"));
    expect(
      await stats.export({ from: "2026-09-22", to: "2026-09-22" }),
    ).toHaveLength(1);
    await stats.prune("2026-06-24T16:00:00.000Z");
    const r = await stats.report({ from: "2026-09-21", to: "2026-09-22" });
    expect(r.total).toBe(1);
    expect(r.startedAt).toBe("2026-06-01T00:00:00.000Z");
  });
  it("fills zero dates and empty distributions", async () => {
    const r = await stats.report({ from: "2026-09-21", to: "2026-09-22" });
    expect(r.total).toBe(0);
    expect(r.daily.map((d) => d.count)).toEqual([0, 0]);
    expect(r.gameMaps).toEqual([]);
  });
  it("bounds queries to 90 calendar days", () => {
    const now = new Date("2026-09-22T16:00:00Z");
    expect(beijingDay(now)).toBe("2026-09-23");
    expect(
      validateStatsQuery({ from: "2026-06-26", to: "2026-09-23" }, now),
    ).toBe(true);
    expect(
      validateStatsQuery({ from: "2026-06-25", to: "2026-09-23" }, now),
    ).toBe(false);
    expect(
      validateStatsQuery({ from: "2026-09-31", to: "2026-09-31" }, now),
    ).toBe(false);
  });
});
