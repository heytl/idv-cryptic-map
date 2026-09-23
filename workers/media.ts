import { jsonError, type Env } from "./types";
export async function handleR2(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return jsonError(405, "method_not_allowed");
  if (!env.MEDIA) return jsonError(503, "storage_not_configured");
  const key = decodeURIComponent(
    new URL(request.url).pathname.replace(/^\/r2\//, ""),
  );
  // 只允许读图片目录，backups/ 等不对外
  if (!key.startsWith("maps/")) return jsonError(404, "not_found");
  const obj = await env.MEDIA.get(key);
  if (!obj) return jsonError(404, "not_found");
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "image/webp",
      "Cache-Control":
        obj.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      ETag: obj.httpEtag,
    },
  });
}
