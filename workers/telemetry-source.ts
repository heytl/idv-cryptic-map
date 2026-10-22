import type { Env } from "./types";

/** Classify transport headers, never a client-supplied event field. */
export function telemetryClient(request: Request, env: Env): "web" | "wechat" | null {
  if (!env.TELEMETRY_ORIGIN || new URL(request.url).origin !== env.TELEMETRY_ORIGIN) return null;
  const origin = request.headers.get("Origin");
  if (origin === env.TELEMETRY_ORIGIN) return "web";
  // Native wx.request has no browser Origin. A foreign browser Origin must
  // never be accepted through the native-client path.
  if (origin || !/^wx[0-9a-f]{16}$/i.test(env.TELEMETRY_WECHAT_APP_ID || "")) return null;
  try {
    const referer = new URL(request.headers.get("Referer") || "");
    return referer.origin === "https://servicewechat.com" &&
      referer.pathname.startsWith(`/${env.TELEMETRY_WECHAT_APP_ID}/`)
      ? "wechat" : null;
  } catch { return null; }
}
