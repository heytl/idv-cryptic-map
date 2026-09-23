import {
  assetKeys,
  beijingDay,
  compatibleV2Config,
  dayOffset,
  toPublicMapConfigV2,
  toPublicMapConfigV3,
  validateStatsQuery,
  type StatsQuery,
} from "../packages/shared/src/index";
import {
  checkedConfig,
  exportContent,
  preserveIdentities,
  saveContent,
  ServiceError,
} from "../packages/server/src/content";
import { makeVisit } from "../packages/server/src/telemetry";
import {
  CloudflareAssets,
  CloudflareAuth,
  CloudflareContent,
  D1Statistics,
} from "./cloudflare";
import { handleR2 } from "./media";
import { runSnapshot } from "./snapshot";
import { jsonError, jsonResponse, type Env } from "./types";

const RETIRED = new Set([
  "/maps.json",
  "/api/maps",
  "/api/images",
  "/api/backups",
  "/api/preview",
  "/api/restore",
]);
const KINDS = {
  full: "layout/full",
  basement: "layout/basement",
  floor1: "layout/floor1",
  floor2: "layout/floor2",
  entrance: "entrance",
  entranceThumb: "entrance-thumb",
} as const;
const ASSET_KEY =
  /^maps\/(?:entry|entry-thumb|full|floor1|floor2|entrance|entrance-thumb|layout\/(?:full|basement|floor1|floor2))\/[^/\\]+\.webp$/;
async function bytes(request: Request, max: number): Promise<Uint8Array> {
  if (Number(request.headers.get("Content-Length")) > max)
    throw new ServiceError(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ServiceError(413, "body_too_large");
    }
    chunks.push(r.value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
async function body(request: Request, max = 2 * 1024 * 1024): Promise<any> {
  try {
    return JSON.parse(new TextDecoder().decode(await bytes(request, max)));
  } catch (e) {
    if (e instanceof ServiceError) throw e;
    throw new ServiceError(400, "bad_json");
  }
}
async function hash(buffer: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function webp(buffer: ArrayBuffer) {
  const b = new Uint8Array(buffer);
  return (
    b.length >= 12 &&
    new TextDecoder().decode(b.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(b.slice(8, 12)) === "WEBP"
  );
}
function statsQuery(url: URL): StatsQuery {
  const today = beijingDay();
  const q = {
    from: url.searchParams.get("from") || dayOffset(today, -6),
    to: url.searchParams.get("to") || today,
    gameMapId: url.searchParams.get("gameMapId") || undefined,
    mode: url.searchParams.get("mode") || undefined,
  };
  if (!validateStatsQuery(q))
    throw new ServiceError(400, "invalid_date_range", "日期需在最近 90 天内");
  return q;
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const repo = new CloudflareContent(env);
  const storage = new CloudflareAssets(env, url.origin);
  if (RETIRED.has(path) || path.startsWith("/api/admin/v2/"))
    return jsonError(410, "retired", "请使用当前正式版本");
  if (path.startsWith("/r2/")) return handleR2(request, env);
  if (path.startsWith("/_vercel/")) return new Response(null, { status: 404 });
  if (
    ["/maps-v3.json", "/maps-v2.json", "/api/public/v2/maps"].includes(path)
  ) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "If-None-Match",
      "Access-Control-Expose-Headers": "ETag",
      "Cache-Control": "no-cache, must-revalidate",
    };
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (!["GET", "HEAD"].includes(request.method))
      return jsonError(405, "method_not_allowed");
    const config = await repo.read();
    const v3 = path === "/maps-v3.json";
    const etag = `"maps-v${v3 ? 3 : 2}-${config.version}"`;
    const responseHeaders = { ...headers, ETag: etag };
    if (request.headers.get("If-None-Match") === etag)
      return new Response(null, { status: 304, headers: responseHeaders });
    const base = new URL(env.IMG_BASE_URL || "/r2", url.origin).href;
    const output = v3
      ? toPublicMapConfigV3(config, base)
      : toPublicMapConfigV2(compatibleV2Config(config), base);
    return request.method === "HEAD"
      ? new Response(null, { headers: responseHeaders })
      : jsonResponse(output, 200, responseHeaders);
  }
  if (path === "/telemetry/events") {
    if (request.method !== "POST") return jsonError(405, "method_not_allowed");
    if (
      !env.TELEMETRY_ORIGIN ||
      url.origin !== env.TELEMETRY_ORIGIN ||
      request.headers.get("Origin") !== env.TELEMETRY_ORIGIN
    )
      return jsonError(403, "origin_not_allowed");
    if (!env.STATS || !env.TELEMETRY_LIMITER)
      return jsonError(503, "statistics_not_configured");
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      return jsonError(415, "json_required");
    const limited = await env.TELEMETRY_LIMITER.limit({
      key: request.headers.get("CF-Connecting-IP") || "unknown",
    });
    if (!limited.success) return jsonError(429, "rate_limited");
    const event = makeVisit(await body(request, 2048), await repo.read());
    await new D1Statistics(env.STATS).record(event);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (path.startsWith("/api/")) {
    if (!(await new CloudflareAuth(env).authenticate(request)))
      return jsonError(401, "unauthorized");
    if (path === "/api/admin/v3/maps") {
      if (request.method === "GET")
        return jsonResponse(await repo.read(), 200, {
          "Cache-Control": "no-store",
        });
      if (request.method === "PUT") {
        const b = await body(request);
        return jsonResponse(
          await saveContent(repo, storage, b.config, b.baseVersion),
        );
      }
      return jsonError(405, "method_not_allowed");
    }
    if (path === "/api/admin/v3/images" && request.method === "POST") {
      const raw = await bytes(request, 20 * 1024 * 1024);
      const form = await new Response(raw.buffer as ArrayBuffer, {
        headers: { "Content-Type": request.headers.get("Content-Type") || "" },
      }).formData();
      const kind = String(form.get("kind")) as keyof typeof KINDS;
      const file = form.get("file");
      if (!Object.hasOwn(KINDS, kind) || !(file instanceof File))
        return jsonError(400, "invalid_image");
      const buffer = await file.arrayBuffer();
      if (!webp(buffer)) return jsonError(400, "invalid_webp");
      const key = `maps/${KINDS[kind]}/${await hash(buffer)}.webp`;
      await storage.put(key, buffer, "image/webp");
      return jsonResponse({ asset: { key }, url: storage.url(key) });
    }
    if (path === "/api/admin/v3/export" && request.method === "GET")
      return jsonResponse(await exportContent(repo, storage), 200, {
        "Cache-Control": "no-store",
      });
    if (path === "/api/admin/v3/assets") {
      const key = url.searchParams.get("key") || "";
      if (!ASSET_KEY.test(key) || key.includes(".."))
        return jsonError(400, "invalid_asset_key");
      if (request.method === "GET") {
        const a = await storage.get(key);
        return a
          ? new Response(a.bytes, {
              headers: {
                "Content-Type": a.contentType,
                "Cache-Control": "no-store",
              },
            })
          : jsonError(404, "not_found");
      }
      if (request.method === "PUT") {
        const buffer = (await bytes(request, 20 * 1024 * 1024))
          .buffer as ArrayBuffer;
        if (!webp(buffer)) return jsonError(400, "invalid_webp");
        const digest = await hash(buffer);
        if (request.headers.get("X-Content-SHA256") !== digest)
          return jsonError(400, "checksum_mismatch");
        const existing = await storage.get(key);
        if (existing && (await hash(existing.bytes)) !== digest)
          return jsonError(409, "immutable_asset_conflict");
        if (!existing) await storage.put(key, buffer, "image/webp");
        return jsonResponse({ key, sha256: digest });
      }
    }
    if (path === "/api/admin/v3/import" && request.method === "POST") {
      const b = await body(request);
      const manifest = b.manifest;
      if (
        manifest?.format !== "idv-content" ||
        manifest.formatVersion !== 1 ||
        !Array.isArray(manifest.assets)
      )
        return jsonError(400, "invalid_manifest");
      const config = checkedConfig(manifest.config);
      const keys = assetKeys(config);
      const supplied = manifest.assets
        .map((a: { key: string }) => a.key)
        .sort();
      if (JSON.stringify(keys) !== JSON.stringify(supplied))
        return jsonError(400, "asset_manifest_mismatch");
      for (const asset of manifest.assets) {
        const existing = await storage.get(asset.key);
        if (
          !existing ||
          typeof asset.sha256 !== "string" ||
          (await hash(existing.bytes)) !== asset.sha256
        )
          return jsonError(400, "asset_checksum_mismatch");
      }
      return jsonResponse(
        await saveContent(
          repo,
          storage,
          preserveIdentities(config, await repo.read()),
          b.baseVersion,
        ),
      );
    }
    if (path === "/api/admin/v3/backups" && request.method === "GET")
      return jsonResponse({ backups: await repo.backups() });
    if (path === "/api/admin/v3/restore" && request.method === "POST") {
      const b = await body(request);
      const backup = await repo.readBackup(String(b.key));
      if (!backup) return jsonError(404, "backup_not_found");
      return jsonResponse(
        await saveContent(
          repo,
          storage,
          preserveIdentities(backup, await repo.read()),
          b.baseVersion,
        ),
      );
    }
    if (
      ["/api/admin/stats", "/api/admin/stats/export"].includes(path) &&
      request.method === "GET"
    ) {
      if (!env.STATS)
        return jsonError(
          503,
          "statistics_not_configured",
          "统计数据库尚未配置",
        );
      const stats = new D1Statistics(env.STATS);
      const q = statsQuery(url);
      if (path.endsWith("/export"))
        return jsonResponse(
          {
            format: "idv-visits",
            formatVersion: 1,
            query: q,
            events: await stats.export(q),
          },
          200,
          { "Cache-Control": "no-store" },
        );
      const report = await stats.report(q);
      const c = await repo.read();
      for (const r of report.gameMaps)
        r.label = c.gameMaps.find((m) => m.id === r.key)?.name || r.key;
      for (const r of report.layouts) {
        const layout = c.layouts.find((l) => String(l.id) === r.key);
        r.label = layout
          ? `${c.gameMaps.find((m) => m.id === layout.gameMapId)?.name || layout.gameMapId} · ${layout.displayName}`
          : r.key;
      }
      return jsonResponse(report, 200, { "Cache-Control": "no-store" });
    }
    return jsonError(404, "not_found");
  }
  return env.ASSETS.fetch(request);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      if (e instanceof ServiceError)
        return jsonError(e.status, e.code, e.message);
      console.error("request_failed", e);
      return jsonError(500, "internal_error");
    }
  },
  async scheduled(_event: ScheduledController, env: Env) {
    await runSnapshot(env);
  },
} satisfies ExportedHandler<Env>;
