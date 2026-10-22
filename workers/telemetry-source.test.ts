import { describe, expect, it } from "vitest";
import { telemetryClient } from "./telemetry-source";
import type { Env } from "./types";
const origin = "https://primary.test";
const appId = "wx91d04186846e3897";
const env = { TELEMETRY_ORIGIN: origin, TELEMETRY_WECHAT_APP_ID: appId } as Env;
const request = (headers: Record<string, string> = {}, base = origin) =>
  new Request(`${base}/telemetry/events`, { method: "POST", headers });
describe("telemetry source isolation", () => {
  it("allows same-origin Web and the configured native WeChat app", () => {
    expect(telemetryClient(request({ Origin: origin }), env)).toBe("web");
    expect(telemetryClient(request({ Referer: `https://servicewechat.com/${appId}/1/page-frame.html` }), env)).toBe("wechat");
  });
  it("rejects mirrors, foreign browsers, unrelated apps and malformed headers", () => {
    const invalid: Record<string, string>[] = [{}, { Origin: "https://mirror.test" },
      { Referer: `https://servicewechat.com.evil.test/${appId}/1/page-frame.html` },
      { Referer: "https://servicewechat.com/wx0000000000000000/1/page-frame.html" },
      { Referer: `https://servicewechat.com/${appId}extra/1/page-frame.html` },
      { Referer: "invalid" },
      { Origin: "https://mirror.test", Referer: `https://servicewechat.com/${appId}/1/page-frame.html` }];
    for (const headers of invalid) expect(telemetryClient(request(headers), env)).toBeNull();
    expect(telemetryClient(request({ Origin: origin }, "https://preview.test"), env)).toBeNull();
    expect(telemetryClient(request({ Origin: origin }), { ...env, TELEMETRY_ORIGIN: "" })).toBeNull();
    expect(telemetryClient(request({ Referer: `https://servicewechat.com/${appId}/1/page-frame.html` }), { ...env, TELEMETRY_WECHAT_APP_ID: "" })).toBeNull();
  });
});
