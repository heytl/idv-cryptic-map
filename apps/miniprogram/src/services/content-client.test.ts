import { expect, it, vi } from "vitest";
import { createContentClient } from "./content-client";
import { toPublicMapConfigV4, type MapConfigV3 } from "@idv-map/shared";
import snapshot from "../../../web/src/data/maps-v3.snapshot.json";

const data = () => toPublicMapConfigV4(snapshot as MapConfigV3, "https://example.com");
it("shares an in-flight request and can retry after network failure", async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(data());
  const client = createContentClient(request);
  const first = client.load();
  expect(client.load()).toBe(first);
  await expect(first).rejects.toThrow("offline");
  await expect(client.load()).resolves.toMatchObject({ schemaVersion: 4 });
  await client.load();
  expect(request).toHaveBeenCalledTimes(2);
});
it("does not replace valid session data with a malformed refresh", async () => {
  const initial = data();
  const request = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce({ schemaVersion: 3 });
  const client = createContentClient(request);
  expect(await client.load()).toBe(initial);
  await expect(client.load(true)).rejects.toThrow("地图数据格式不兼容");
  expect(await client.load()).toBe(initial);
});
