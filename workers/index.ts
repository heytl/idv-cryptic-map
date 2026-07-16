// ==========================================================================
// 主 Worker：静态资源 + /maps.json 读路径（Phase 2.1）
//
// - GET /maps.json：从 KV 读配置下发（published 过滤、sort 排序、ETag/304）；
//   KV 未绑定或无数据时回退静态资源里的构建期快照 —— 这也是整套后台的
//   回滚路径：摘掉 KV 数据即退回纯静态站，前台不受影响
// - /api/*：后台管理 API（Phase 2.2 实现），当前一律 501
// - 其余路径按 wrangler.jsonc 的 assets 配置直接走静态资源（不进本代码）
// ==========================================================================

interface Env {
  ASSETS: Fetcher;
  /** Phase 2.0 资源开通后绑定；未绑定时读路径自动回退静态快照 */
  CONFIG?: KVNamespace;
  /** 图片对象存储（Phase 2.2 上传用），读路径不依赖 */
  MEDIA?: R2Bucket;
}

type Direction = '左' | '右' | '南' | '北';

/** KV `config:current` 中的完整记录（含后台专用字段），见 docs/ADMIN-BACKEND.md §3 */
interface StoredMap {
  id: number;
  sort?: number;
  direction: Direction;
  name: string;
  displayName: string;
  remarks: string;
  published?: boolean;
  deletedAt?: string | null;
  sourceKey?: string;
  images?: Record<string, string>;
}

interface StoredConfig {
  version: number;
  updatedAt: string;
  maps: StoredMap[];
}

const CONFIG_KEY = 'config:current';

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/maps.json') return handleMapsJson(request, env);
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { error: 'not_implemented', detail: '后台管理 API 将在 Phase 2.2 提供' },
        { status: 501 },
      );
    }
    // run_worker_first 未覆盖的路径不会到这里；兜底转静态资源
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleMapsJson(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET, HEAD' } });
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
