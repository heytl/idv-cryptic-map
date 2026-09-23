export interface Env {
  ASSETS: Fetcher;
  /** Phase 2.0 资源开通后绑定；未绑定时读路径自动回退静态快照 */
  CONFIG?: KVNamespace;
  /** 图片/原图/备份对象存储 */
  MEDIA?: R2Bucket;
  STATS?: D1Database;
  TELEMETRY_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
  TELEMETRY_ORIGIN?: string;

  // ---- vars（wrangler.jsonc / dashboard 配置）----
  /** 图片对外 URL 前缀：img 子域绑定前为 "/r2"（同 Worker 出图），绑定后改为 https://img.<domain> */
  IMG_BASE_URL?: string;
  /** Cloudflare Access 团队域，如 https://xxx.cloudflareaccess.com；与 AUD 同时配置后鉴权生效 */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access 应用的 Audience 标签 */
  ACCESS_AUD?: string;
  /** 仅 env.dev 使用：跳过鉴权做本地开发 */
  DEV_DISABLE_AUTH?: string;

  // ---- secrets（wrangler secret put，Cron 快照回写用；未配置则跳过）----
  GITHUB_TOKEN?: string;
  /** owner/repo，如 heytl/idv-cryptic-map */
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function jsonError(
  status: number,
  error: string,
  detail?: string,
): Response {
  return jsonResponse({ error, ...(detail ? { detail } : {}) }, status);
}
