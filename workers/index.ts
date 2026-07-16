// ==========================================================================
// 主 Worker：静态资源 + 数据下发 + 后台管理 API
//
// - GET /maps.json：从 KV 读配置下发（published 过滤、sort 排序、ETag/304）；
//   KV 未绑定或无数据时回退静态资源里的构建期快照 —— 这也是整套后台的
//   回滚路径：摘掉 KV 数据即退回纯静态站，前台不受影响
// - /api/*：后台管理 API（Access 鉴权，见 auth.ts / api.ts）
// - /r2/*：R2 同源出图（img 子域绑定前的过渡路径）
// - Cron：每日配置快照回写 git（snapshot.ts，未配 secrets 时跳过）
// - 其余路径按 wrangler.jsonc 的 assets 配置直接走静态资源（不进本代码）
// ==========================================================================
import { handleApi, handleR2 } from './api';
import { requireAuth } from './auth';
import { runSnapshot } from './snapshot';
import { CONFIG_KEY, jsonError, type Env, type StoredConfig } from './types';

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/maps.json') return handleMapsJson(request, env);
    if (pathname.startsWith('/r2/')) return handleR2(request, env);
    if (pathname.startsWith('/api/')) {
      const denied = await requireAuth(request, env);
      return denied ?? handleApi(request, env);
    }
    // run_worker_first 未覆盖的路径不会到这里；兜底转静态资源
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env): Promise<void> {
    await runSnapshot(env);
  },
} satisfies ExportedHandler<Env>;

async function handleMapsJson(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonError(405, 'method_not_allowed');
  }

  const config = env.CONFIG ? await env.CONFIG.get<StoredConfig>(CONFIG_KEY, 'json') : null;
  if (!config) {
    // KV 未接管：回退 dist 里的构建期静态快照（内容与打包进 JS 的兜底数据一致）
    return env.ASSETS.fetch(request);
  }

  const etag = `"v${config.version}"`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    // 刷新必回源验证；版本未变时 304 零传输
    'Cache-Control': 'no-cache, must-revalidate',
    ETag: etag,
  };
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  const body = {
    version: config.version,
    updatedAt: config.updatedAt,
    maps: config.maps
      .filter((m) => m.published !== false && !m.deletedAt)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      // 后台专用字段不下发
      .map(({ sort: _sort, published: _published, deletedAt: _deletedAt, sourceKey: _sourceKey, ...pub }) => pub),
  };
  return new Response(JSON.stringify(body), { headers });
}
