import { describe, it, expect, vi } from "vitest";
import worker from "./index";
import { migrateV2ToV3, type MapConfigV2 } from "../packages/shared/src/index";
import snapshot from "../apps/web/src/data/maps-v2.snapshot.json";
import type { Env } from "./types";
const config = migrateV2ToV3(snapshot as MapConfigV2);
const env = () =>
  ({
    ASSETS: { fetch: vi.fn(async () => new Response("html")) },
    CONFIG: { get: async () => config },
    TELEMETRY_ORIGIN: "https://primary.test",
    TELEMETRY_LIMITER: { limit: async () => ({ success: true }) },
  }) as unknown as Env;
describe("HTTP boundaries", () => {
  it.each(["/maps.json", "/api/maps", "/api/restore", "/api/admin/v2/maps"])(
    "%s is retired without SPA fallback",
    async (path) => {
      expect(
        (await worker.fetch(new Request(`https://primary.test${path}`), env()))
          .status,
      ).toBe(410);
    },
  );
  it("publishes V3 and conditional V2 compatibility", async () => {
    const e = env();
    const r = await worker.fetch(
      new Request("https://primary.test/maps-v3.json"),
      e,
    );
    expect(((await r.json()) as any).layouts).toHaveLength(
      config.layouts.filter((l) => l.published && !l.deletedAt).length,
    );
    const v2 = await worker.fetch(
      new Request("https://primary.test/maps-v2.json"),
      e,
    );
    expect(((await v2.json()) as any).schemaVersion).toBe(2);
    expect(
      (
        await worker.fetch(
          new Request("https://primary.test/maps-v2.json", {
            headers: { "If-None-Match": v2.headers.get("ETag")! },
          }),
          e,
        )
      ).status,
    ).toBe(304);
  });
  it("requires admin authentication", async () => {
    expect(
      (
        await worker.fetch(
          new Request("https://primary.test/api/admin/stats"),
          env(),
        )
      ).status,
    ).toBe(401);
  });
  it("rejects mirrors and isolates stats failures from content", async () => {
    const e = env();
    expect(
      (
        await worker.fetch(
          new Request("https://mirror.test/telemetry/events", {
            method: "POST",
            headers: { Origin: "https://mirror.test" },
          }),
          e,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          new Request("https://primary.test/telemetry/events", {
            method: "POST",
            headers: { Origin: "https://primary.test" },
          }),
          e,
        )
      ).status,
    ).toBe(503);
    expect(
      (await worker.fetch(new Request("https://primary.test/maps-v3.json"), e))
        .status,
    ).toBe(200);
  });
  it("limits oversized and invalid events before insertion", async () => {
    const e = env();
    e.STATS = {} as D1Database;
    const headers = {
      Origin: "https://primary.test",
      "Content-Type": "application/json",
    };
    expect(
      (
        await worker.fetch(
          new Request("https://primary.test/telemetry/events", {
            method: "POST",
            headers,
            body: " ".repeat(3000),
          }),
          e,
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await worker.fetch(
          new Request("https://primary.test/telemetry/events", {
            method: "POST",
            headers,
            body: "{}",
          }),
          e,
        )
      ).status,
    ).toBe(400);
  });
});
